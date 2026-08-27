import { existsSync, readFileSync } from 'node:fs';
import { type ConnectionInfo } from '@agentlings/shared';
import { headedAvailable } from './browserchannel';
import { listenPort } from './session';

/**
 * The connection registry: what a job may reach outside its sandbox. Nothing
 * is ambient — a job names the connections it wants and gets those and no
 * others, which is both the security boundary and the cost one, since every
 * tool a session can see is definition overhead in each of its requests.
 *
 * Secrets are referenced by environment variable name. Values never appear in
 * the registry and reach only the connection they were declared for. A value
 * crosses the API exactly once — inbound, when the settings drawer stores it
 * (D-078) — and is never returned, never listed, and never echoed in an
 * error.
 */

export interface Connection {
  name: string;
  label: string;
  description?: string;
  /**
   * How a session reaches it.
   *
   * `builtin` — the server owns the call, so it owns the size of the reply.
   * `stdio` — the SDK spawns a local process and talks to it over pipes.
   * `http` — the SDK talks to a *remote* MCP server over streamable HTTP
   * (Wave 2). Added because the alternative was a hand-written door per
   * service: a vendor that already publishes an MCP server becomes a catalog
   * entry with no code at all, which is what makes "business-system doors"
   * mostly a catalog exercise rather than engineering.
   *
   * `sse` is deliberately absent. The SDK accepts it and it is the legacy
   * shape of the same idea; adding it is one line on the day something we
   * actually want speaks only SSE, and shipping it now would be a branch with
   * no caller.
   */
  transport: 'builtin' | 'stdio' | 'http';
  /** On for every job unless the user turns it off in Settings. */
  defaultOn?: boolean;
  /**
   * This connection exists so the *server* can send at approval, and grants a
   * running session nothing at all (D-097).
   *
   * Sends never happen in a session (D-075): a run writes OUTBOX.json and the
   * server replays it through the channel's own client when the user
   * approves. So there is no door here for a session to reach — `telegram` is
   * `builtin` with no branch in the executor, and the same is true of the
   * other two. Granting one to a job was therefore inert in every way but the
   * one that mattered: it landed in the recipe's capability surface, where
   * D-044 reads it as a method that reached outside and refuses the compile.
   * The most repetitive job shape in the product was locked out of the free
   * tool tier by the channel it was *about*.
   *
   * Declared rather than inferred from the name, because a connection and the
   * channel it provides need not share one: `google` is the connection,
   * `gmail` is the channel.
   */
  sendsOnly?: boolean;
  /**
   * A door a person watches (D-255): the acting browser. Granted only to a
   * job someone queued by hand — a rule naming it is refused at creation and
   * a legacy firing is not handed it — in a visible window on the Settings
   * allowlist, and closing the window ends the run. One flag, read by every
   * seam that has to refuse, so the refusals cannot drift apart.
   */
  supervised?: boolean;
  /** builtin 'web' only. */
  allow?: string[];
  maxChars?: number;
  /**
   * The tools a job may call on this connection, without the `mcp__name__`
   * prefix. Required rather than optional: granting a connection used to mean
   * granting everything it exposes, so a server offering both reading and
   * acting could not be adopted for reading alone. Listing them here also
   * makes the catalog say what a connection can do without running it.
   */
  tools?: string[];
  /**
   * User-added only (D-256): when this install's probe read the tool list
   * above, and where the shape came from — a registry entry and version, or
   * "typed by hand". D-245's provenance rule, a source and a date per
   * entry, applied to the thing this machine actually connected to.
   */
  verifiedAt?: string;
  source?: string;
  /** stdio only. */
  command?: string;
  args?: string[];
  /** http only — the remote MCP endpoint. */
  url?: string;
  /**
   * http only. Values may name a secret as `${NAME}`, exactly as a stdio
   * connection's `env` does, and for the same reason: this object is
   * serialized into `.session.json` inside the sandbox the agentling reads
   * (D-242). An `Authorization` header is a bearer token by another name, so
   * it travels the same path — placeholder on disk, value over stdin.
   */
  headers?: Record<string, string>;
  /** Environment variable name → why it is needed. */
  secrets?: Record<string, string>;
  /** Plain-words steps for getting the secret; the settings drawer shows them. */
  setup?: string[];
  // `maxOutputTokens` used to be declared here and was read by nothing. It is
  // gone rather than wired, because it cannot be honoured: the SDK talks to a
  // stdio server directly, so there is no point of ours in between to trim at.
  // A config field that promises enforcement it cannot deliver is worse than
  // its absence — the budget for a stdio server is that server's own flags.
}

/**
 * The connections this server owns a door for, and the path of each.
 *
 * A door is the only way anything inside a run reaches outside: the server
 * makes the call, so it owns the allowlist, the trimming, the size of the
 * answer, and the secret — which never leaves this process. Four exist, and
 * they were built one at a time for sessions (D-053, D-128); this is the first
 * place that names them as a set, because the compiled-tool tier needs to ask
 * "is there a door for this connection" rather than hardcode a fifth copy of
 * the list.
 *
 * A connection absent from here has no door by definition, not by oversight:
 * `browser` drives a real browser in the session's own process, and the three
 * senders grant a run nothing at all (`sendsOnly`) because a send happens at
 * approval and never inside a run (D-075, D-097).
 */
export const DOORS: Record<string, string> = {
  web: '/internal/fetch',
  github: '/internal/github',
  search: '/internal/search',
  render: '/internal/render',
  bls: '/internal/bls',
};

/**
 * The literal endpoint of each named door, skipping any connection without one.
 *
 * The one place a door's URL is built for anything other than a session, so a
 * tool and a session cannot end up dialling different addresses for the same
 * door. Localhost by address rather than by name: `localhost` resolves to ::1
 * first on this machine and the server binds 127.0.0.1.
 */
export function doorEndpoints(names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    if (DOORS[name]) out[name] = `http://127.0.0.1:${listenPort()}${DOORS[name]}`;
  }
  return out;
}

/**
 * Every environment variable the catalog declares as a secret.
 *
 * So a child process can be handed the environment minus the keys. A session
 * never needed this — it reaches a connection through a door and the SDK gets
 * only what `toMcpServers` fills in — but a compiled tool is a plain node
 * child, and `spawn` with no `env` inherits the whole server environment. That
 * was harmless while the contract was "no network"; it is not once a tool can
 * call out, because a script holding `GITHUB_TOKEN` can reach the code host
 * without the door, and then the door is not the boundary it says it is.
 */
export function secretNames(connections: Connection[]): string[] {
  return [...new Set(connections.flatMap((c) => Object.keys(c.secrets ?? {})))];
}

export function readConnections(file: string): Connection[] {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { connections?: Connection[] };
    return (parsed.connections ?? []).filter((c) => c.name && c.transport);
  } catch {
    return [];
  }
}

/** A connection is usable only once every secret it declares is actually set. */
export function missingSecrets(
  connection: Connection,
  env: Record<string, string | undefined>,
): string[] {
  return Object.keys(connection.secrets ?? {}).filter((name) => !env[name]);
}

/**
 * What the UI lists: never the secret values, only whether they are present.
 *
 * Which connections are live is decided in settings.ts and passed in, rather
 * than worked out again here — one rule, and no import cycle between the
 * registry and the preferences that qualify it.
 */
export function describe(
  connections: Connection[],
  env: Record<string, string | undefined>,
  enabled: Set<string> = new Set(),
  /** Who each connection turned out to be, where a connect flow learned it. */
  identities: Record<string, string> = {},
): ConnectionInfo[] {
  return connections.map((c) => {
    const missing = missingSecrets(c, env);
    return {
      name: c.name,
      label: c.label,
      description: c.description ?? '',
      builtin: c.transport === 'builtin',
      ready: missing.length === 0,
      missingSecrets: missing,
      ...(c.setup ? { setup: c.setup } : {}),
      ...(identities[c.name] ? { identity: identities[c.name] } : {}),
      defaultOn: c.defaultOn === true,
      enabled: enabled.has(c.name),
      // The boundary Settings draws (UI.md, step 7), read off the one flag
      // that already says it: a sends-only connection grants a run nothing
      // and exists for approval to send through (D-097).
      kind: c.sendsOnly ? 'send' : 'read',
      credentialed: Object.keys(c.secrets ?? {}).length > 0,
      sharesSecretsWith: sharingSecrets(c, connections),
      ...(c.supervised ? { supervised: true } : {}),
    };
  });
}

/**
 * The other connections that declare any secret this one declares (D-218).
 * Forgetting a shared secret disconnects them all, so both the row's label
 * and the route's answer name them — from one place, so they cannot differ.
 */
export function sharingSecrets(connection: Connection, connections: Connection[]): string[] {
  const mine = Object.keys(connection.secrets ?? {});
  return connections
    .filter((c) => c.name !== connection.name)
    .filter((c) => Object.keys(c.secrets ?? {}).some((key) => mine.includes(key)))
    .map((c) => c.name);
}

/**
 * Why a supervised door cannot be held on an install with no desktop.
 *
 * Exported so the one place that refuses it and anything that wants to say so
 * cannot drift apart, which is the D-030 shape: "it delivered" kept being
 * re-derived locally until every copy quietly assumed something different.
 */
export const NO_SCREEN = 'needs a screen to open a window on, and this install has none';

/**
 * The connections a job asked for, dropping any that are unknown or unready.
 *
 * `headed` is measured by the caller and passed in rather than probed here,
 * so this stays a pure function of its arguments — `listenPolicy`'s shape, and
 * for the same reason: a policy that reaches out to the machine is a policy
 * that cannot be tested against the machine it will actually run on. It
 * defaults to this install's own answer, so no call site had to change.
 */
export function resolveForJob(
  requested: string[] | undefined,
  connections: Connection[],
  env: Record<string, string | undefined>,
  headed: boolean = headedAvailable(),
): { granted: Connection[]; refused: { name: string; reason: string }[] } {
  const granted: Connection[] = [];
  const refused: { name: string; reason: string }[] = [];
  for (const name of requested ?? []) {
    const found = connections.find((c) => c.name === name);
    if (!found) {
      refused.push({ name, reason: 'no such connection' });
      continue;
    }
    // A supervised door is headed by construction (D-255): the operator
    // watches the window, signs into it themselves, and closing it ends the
    // run. An install with no desktop cannot offer any of that, so it is
    // refused here — before a turn is spent — rather than at the launch,
    // halfway through work already paid for. This is the probe #24 says
    // supervised acting has; until #24 it did not have one.
    if (found.supervised && !headed) {
      refused.push({ name, reason: NO_SCREEN });
      continue;
    }
    const missing = missingSecrets(found, env);
    if (missing.length > 0) {
      refused.push({ name, reason: `needs ${missing.join(', ')} in .env` });
      continue;
    }
    granted.push(found);
  }
  return { granted, refused };
}

/**
 * The tool names a job may actually call, fully qualified.
 *
 * `allowedTools` is a strict allowlist, and the only MCP name that ever
 * reached it was a hardcoded `mcp__web__fetch_page` — so the registry's stdio
 * path could configure a server whose tools were then all refused. It was
 * never noticed because no stdio connection has ever been installed.
 *
 * A connection that lists no tools contributes none. That is deliberate: the
 * alternative is asking the SDK for everything a server offers, which is the
 * "grant a connection, grant all of it" behaviour this exists to end.
 */
export function mcpToolNames(granted: Connection[]): string[] {
  return granted.flatMap((c) => (c.tools ?? []).map((tool) => `mcp__${c.name}__${tool}`));
}

/**
 * Fills `${VAR}` in an argument from the environment, and drops the whole
 * argument when the variable is unset.
 *
 * For configuration that is optional and cannot be written down: a browser's
 * saved sign-in lives at a path that differs by machine and by person, so it
 * can never go in a committed catalog. Dropping the argument rather than
 * passing it empty is what makes it optional — the browser works signed out,
 * and gains the session the moment the variable exists.
 */
export function expandArgs(args: string[], env: Record<string, string | undefined>): string[] {
  const out: string[] = [];
  for (const arg of args) {
    const wanted = [...arg.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]);
    if (wanted.some((name) => !env[name])) continue;
    out.push(arg.replace(/\$\{(\w+)\}/g, (_, name: string) => env[name] ?? ''));
  }
  return out;
}

/**
 * MCP server config for the granted stdio connections, with each secret named
 * as a `${NAME}` placeholder rather than filled in.
 *
 * **This object is serialized into `.session.json` inside the sandbox**, which
 * the agentling reads all job long with `Read` and `Bash`. Filling real values
 * in here put every stdio connection's credentials on disk beside the work.
 * It leaked nothing while it stood — the only stdio connection in the catalog
 * (`browser`) declares no secrets, so the map was empty, and the security
 * audit opened its own job's file and confirmed it (D-240) — but that is a
 * fact about today's catalog, not about this function. Wave 2 adds
 * business-system doors, and the first one that declares a secret would have
 * made this high severity with no code change at all.
 *
 * The values travel to the runner over **stdin** instead (`mcpSecretValues`).
 * Not the environment: `launderedEnv` strips connection secrets from the child
 * on purpose (D-217), and putting them back would trade a file the session can
 * read for an environment it can also read — on Linux through
 * `/proc/<pid>/environ`, the parent's included. Stdin is read once at startup
 * and held in a variable no tool reaches.
 */
export type McpServerSpec =
  | { type: 'stdio'; command: string; args: string[]; env: Record<string, string> }
  | { type: 'http'; url: string; headers: Record<string, string> };

export function toMcpServers(
  granted: Connection[],
  env: Record<string, string | undefined>,
): Record<string, McpServerSpec> {
  const servers: Record<string, McpServerSpec> = {};
  for (const connection of granted) {
    // Named only where the value actually exists, so an unset secret stays
    // absent rather than becoming a placeholder the runner cannot resolve —
    // the same "optional means absent" rule `expandArgs` follows.
    const placeholder = (name: string): string | null =>
      env[name] ? `\${${name}}` : null;

    if (connection.transport === 'stdio' && connection.command) {
      const secrets: Record<string, string> = {};
      for (const name of Object.keys(connection.secrets ?? {})) {
        const value = placeholder(name);
        if (value) secrets[name] = value;
      }
      servers[connection.name] = {
        type: 'stdio',
        command: connection.command,
        args: expandArgs(connection.args ?? [], env),
        env: secrets,
      };
      continue;
    }

    if (connection.transport === 'http' && connection.url) {
      // `${NAME}` is matched ANYWHERE in the value, not only as the whole of
      // it, because the header that matters is `Bearer ${TOKEN}` — a prefix
      // and a placeholder. A live run caught this: a whole-value rule left
      // `Authorization: Bearer ${DESK_TOKEN}` verbatim and the far end
      // answered 401. The unit tests had passed because their fixture used the
      // bare `${NAME}`, which is a shape no real API uses.
      //
      // A header naming an unset secret is dropped entirely rather than sent
      // half-filled: `Authorization: Bearer ` is a request that looks
      // authenticated and is not, and the error it earns says nothing about
      // the missing key. That is `expandArgs`'s rule, which had it right
      // first — the same decision reached twice, so it reads the same way in
      // both places.
      const headers: Record<string, string> = {};
      for (const [key, raw] of Object.entries(connection.headers ?? {})) {
        const wanted = [...raw.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]!);
        if (wanted.some((name) => !placeholder(name))) continue;
        // The placeholder text is what lands on disk; the runner fills it.
        headers[key] = raw;
      }
      servers[connection.name] = { type: 'http', url: connection.url, headers };
    }
  }
  return servers;
}

/**
 * The real values behind `toMcpServers`'s placeholders — the half that never
 * touches the sandbox.
 *
 * Only the granted `stdio` and `http` connections' own declared secrets, so
 * the runner is handed the smallest set that starts the servers it was told to
 * start and never the whole `.env`. `builtin` is excluded because the server
 * makes those calls itself and the session never holds the credential at all.
 */
export function mcpSecretValues(
  granted: Connection[],
  env: Record<string, string | undefined>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const connection of granted) {
    const reachable =
      (connection.transport === 'stdio' && connection.command) ||
      (connection.transport === 'http' && connection.url);
    if (!reachable) continue;
    for (const name of Object.keys(connection.secrets ?? {})) {
      const value = env[name];
      if (value) values[name] = value;
    }
  }
  return values;
}
