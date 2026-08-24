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
 * Fills every `${NAME}` inside one bag of key→value, dropping any entry it
 * cannot fully resolve.
 *
 * Anywhere in the value, not only as the whole of it: the header that matters
 * is `Bearer ${TOKEN}`. A whole-value rule shipped first and a live run caught
 * it — the far end saw the literal `Bearer ${DESK_TOKEN}` and answered 401.
 * An entry with no placeholders at all is a constant and passes through, which
 * is how an API-version header survives.
 */
function fill(bag, secrets) {
  const out = {};
  for (const [key, value] of Object.entries(bag ?? {})) {
    const raw = String(value);
    const wanted = [...raw.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]);
    if (wanted.some((name) => !secrets[name])) continue;
    const filled = raw.replace(/\$\{(\w+)\}/g, (_, name) => secrets[name]);
    if (filled) out[key] = filled;
  }
  return out;
}

/**
 * Fills `${NAME}` from the secrets read off stdin — in a stdio server's `env`
 * and in an http server's `headers`, which are the same problem wearing two
 * names. An `Authorization` header is a bearer token, and it would land in
 * `.session.json` beside the work if it were not a placeholder there (D-242).
 *
 * A placeholder with no matching secret is **dropped rather than passed
 * through**, so a server never receives the literal string `${TOKEN}` as its
 * credential — it fails with a clear absence instead of a value that looks
 * real in a log, and `Authorization: Bearer ${TOKEN}` would look real in
 * somebody else's log. Anything that is not a placeholder is left as it is,
 * which is how a constant header like an API version survives.
 */
export function resolveSecrets(servers, secrets) {
  const out = {};
  for (const [name, server] of Object.entries(servers ?? {})) {
    out[name] =
      server.type === 'http'
        ? { ...server, headers: fill(server.headers, secrets) }
        : { ...server, env: fill(server.env, secrets) };
  }
  return out;
}
