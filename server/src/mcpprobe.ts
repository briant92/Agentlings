import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expandArgs, type Connection } from './connections';

/**
 * Connect to an MCP server once and ask what it can do.
 *
 * **Why the app asks instead of the form.** D-044 requires a connection to
 * list the tools a job may call, so that granting one is not granting
 * everything it happens to expose. For a server nobody curated, the only
 * honest source of that list is the server itself — a typed list is a guess,
 * and a wrong guess produces a connection that installs and never works.
 *
 * It doubles as the config being *proven before it is stored*: a command that
 * is not installed, a URL that is wrong, a token that is refused, all fail
 * here with something to read, rather than later and silently inside somebody's
 * paid job.
 *
 * **This runs the command.** For a `stdio` server that is arbitrary local
 * execution, which is why the route in front of it is behind Wave 0's gate and
 * why nothing calls this except an explicit "add this connection" (D-244).
 *
 * The MCP SDK is a declared dependency of this package rather than borrowed
 * from the agent SDK's tree: it arrived transitively, and a dependency you did
 * not ask for is one a version bump may take away without a line in any diff.
 */

/** Long enough for `npx` to fetch a package it has never seen, short enough to be a UI. */
const PROBE_TIMEOUT_MS = 60_000;

/**
 * Said the same way whichever kind of nothing happened, because to the person
 * who pasted the address they are one thing: it connected and it is useless.
 */
const NO_TOOLS = 'the server connected but offers no tools';

/** How much of a spawned server's stderr is kept — enough for its reason. */
const COMPLAINT_CAP = 2000;

export interface ProbeResult {
  ok: boolean;
  tools: string[];
  /** What the server calls itself, when it says. */
  serverName?: string;
  error?: string;
}

export async function probeConnection(
  connection: Connection,
  env: Record<string, string | undefined> = process.env,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  const client = new Client({ name: 'agentlings', version: '1.0.0' });
  let transport: StdioClientTransport | StreamableHTTPClientTransport;
  /** Whatever the spawned server said about itself before it gave up. */
  let complaint = '';

  try {
    if (connection.transport === 'stdio') {
      if (!connection.command) return fail('no command to run');
      // Only the secrets this connection declares, never the whole
      // environment — the same rule the runner is held to (D-217).
      const declared: Record<string, string> = {};
      for (const name of Object.keys(connection.secrets ?? {})) {
        const value = env[name];
        if (value) declared[name] = value;
      }
      transport = new StdioClientTransport({
        command: connection.command,
        args: expandArgs(connection.args ?? [], env),
        // PATH and friends, so `npx` can be found at all; the declared
        // secrets on top. `getDefaultEnvironment` is the SDK's own idea of a
        // minimal safe set, which is a better default than ours would be.
        env: { ...defaultEnv(), ...declared },
        stderr: 'pipe',
      });
      // `stderr: 'pipe'` was set here from the beginning and read by nobody,
      // so a server that refused to start said *why* into a stream nothing
      // listened to and the person filling in the form saw "Connection
      // closed". The SDK hands back a PassThrough before the child is spawned
      // precisely so early output is not lost, so the listener goes on now.
      // Bounded, because the reason is the first line or two and an adapter in
      // a crash loop could otherwise write until this process is out of memory.
      transport.stderr?.on('data', (chunk: Buffer) => {
        if (complaint.length < COMPLAINT_CAP) complaint += chunk.toString('utf8');
      });
    } else if (connection.transport === 'http') {
      if (!connection.url) return fail('no URL to reach');
      const headers: Record<string, string> = {};
      for (const [key, raw] of Object.entries(connection.headers ?? {})) {
        const wanted = [...raw.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]!);
        if (wanted.some((name) => !env[name])) continue;
        headers[key] = raw.replace(/\$\{(\w+)\}/g, (_, name: string) => env[name] ?? '');
      }
      transport = new StreamableHTTPClientTransport(new URL(connection.url), {
        requestInit: { headers },
      });
    } else {
      return fail(`${connection.transport} connections are not probed`);
    }

    // A server that accepts the connection and then never answers would
    // otherwise hold the request open for as long as the user is willing to
    // wait, which for a UI is "forever".
    const listed = await withTimeout(
      (async () => {
        await client.connect(transport);
        return client.listTools();
      })(),
      timeoutMs,
    );

    const tools = (listed.tools ?? []).map((t) => t.name).filter(Boolean);
    if (!tools.length) return fail(NO_TOOLS);
    return { ok: true, tools, serverName: client.getServerVersion()?.name };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The two shapes of "connected, and useless". A server with no tools at
    // all does not advertise the capability, so `listTools` comes back
    // `-32601 Method not found` — which is true, and no use at all to someone
    // who just pasted an address. One that advertises tools and lists none
    // reaches the check above. Both say the same readable thing.
    if (/-32601|method not found/i.test(message)) return fail(NO_TOOLS);
    return fail(withComplaint(message, complaint));
  } finally {
    // Both halves, and neither may throw past the result: a probe that
    // reported success and then blew up on cleanup would look like a failure
    // to the caller and leave the user with no connection and no reason.
    await client.close().catch(() => {});
  }
}

function fail(error: string): ProbeResult {
  return { ok: false, tools: [], error };
}

/**
 * The transport's account of the failure, plus the server's own if it gave
 * one.
 *
 * The transport's is kept rather than replaced: "Connection closed" is useless
 * alone but it is what says the process died, and a server can write to stderr
 * on a run that goes on to succeed. Only the first few lines are shown —
 * `npx` writes progress there, and a wall of download noise would bury the one
 * sentence that matters.
 */
export function withComplaint(message: string, complaint: string): string {
  const said = complaint
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('; ');
  return said ? `${message} — the server said: ${said}` : message;
}

function defaultEnv(): Record<string, string> {
  const keep = ['PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC'];
  const out: Record<string, string> = {};
  for (const name of keep) {
    const value = process.env[name];
    if (value) out[name] = value;
  }
  return out;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`the server did not answer within ${ms / 1000}s`)), ms),
    ),
  ]);
}
