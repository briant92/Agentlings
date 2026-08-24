// The runner's half of D-242's split: `.session.json` names each stdio
// connection's secret as `${NAME}`, and the real values arrive on stdin.
//
// Its own module, in plain JS, for one reason each way: the runner is spawned
// with plain `node` and cannot import TypeScript, and `agent-runner.mjs` runs a
// whole session at import, so a test that imported it would start one. A
// mutation pass is what asked for this — stubbing the runner's stdin read
// survived every test, because nothing could reach the function.

/**
 * Reads a JSON object off stdin, or `{}`.
 *
 * An `ignore`d stdin reads as immediate EOF, so a caller that sends nothing
 * (`refine.ts`, the close-out pass) gets `{}` rather than hanging. Malformed
 * input is `{}` too: the session is about to run either way, and an unresolved
 * placeholder fails at the one server that needed it rather than killing the job.
 */
export async function readSecrets(stdin) {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Fills `${NAME}` in each server's `env` from the secrets read off stdin.
 *
 * A placeholder with no matching secret is **dropped rather than passed
 * through**, so an MCP server never receives the literal string `${TOKEN}` as
 * its credential — it fails to authenticate with a clear absence instead of a
 * value that looks real in a log. Anything that is not a placeholder is left
 * exactly as it is.
 */
export function resolveSecrets(servers, secrets) {
  const out = {};
  for (const [name, server] of Object.entries(servers ?? {})) {
    const env = {};
    for (const [key, value] of Object.entries(server.env ?? {})) {
      const match = /^\$\{(\w+)\}$/.exec(String(value));
      const resolved = match ? secrets[match[1]] : value;
      if (resolved) env[key] = resolved;
    }
    out[name] = { ...server, env };
  }
  return out;
}
