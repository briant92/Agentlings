// The mechanism behind the registry browse (D-256, D-263, #15), proven against
// the real world with no server running — the halves that need the running
// server's route and form are `prove-user-connections.mjs` §5 and
// `prove-user-connections-ui.mjs`.
//
//   npx tsx scripts/prove-registry-fill.mts        (from the repo root)
//
// The REAL registry is searched, Brave's official entry is turned into a fill,
// the fill is held to the form's own validator, and the REAL probe spawns the
// fill's command — `npx -y @brave/brave-search-mcp-server@…` — with
// BRAVE_API_KEY read from `.env` under the very name the entry declares, and
// Brave's server answers with its tools. Then the registry's own Alpha Vantage
// entry is shown to be passed over BY NAME (it lists only an SSE address), and
// a registry that cannot be reached comes back as the named state. Nothing is
// written anywhere: no connection, no `.env` line.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchRegistry } from '../server/src/registry.ts';
import { connectionFromDraft, draftProblem } from '../server/src/userconnections.ts';
import { probeConnection } from '../server/src/mcpprobe.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // No .env — the key check below says so.
}

let bad = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

const PICK = 'io.github.brave/brave-search-mcp-server';
const readOn = new Date().toISOString().slice(0, 10);
// The shipped names plus the one door this install is known to hold.
const taken = new Set(['web', 'github', 'render', 'browser', 'search', 'alphavantage']);

const t0 = Date.now();
const found = await searchRegistry('brave', { readOn, taken });
check('the real registry answered a search', found.ok, found.ok ? `${found.hits.length} fills, ${found.omitted.length} passed over, ${Date.now() - t0}ms` : found.error);
const hit = found.ok ? found.hits.find((h) => h.id === PICK) : undefined;
check('Brave’s official entry is among them, as a fill', Boolean(hit), hit && `${hit.fill.command} ${hit.fill.args?.join(' ')}`);
if (!hit) {
  console.log('\nNOT PROVEN — nothing to fill from');
  process.exit(1);
}
check('the fill names the credential the server wants, by its env name', Object.keys(hit.fill.secrets ?? {}).join() === 'BRAVE_API_KEY', JSON.stringify(hit.fill.secrets));
check('the fill passes the form’s own validation', draftProblem(hit.fill, []) === null, draftProblem(hit.fill, []));
check('the fill carries no tools and says where and when it was read', !('tools' in hit.fill) && hit.fill.source.includes(PICK) && hit.fill.source.includes(readOn), hit.fill.source);

const alpha = await searchRegistry('alphavantage', { readOn, taken });
check(
  'the registry’s own Alpha Vantage entry is passed over BY NAME (SSE only), not silently',
  alpha.ok && alpha.omitted.some((o) => o.id === 'io.github.alphavantage/alpha_vantage_mcp' && /SSE/.test(o.why)),
  alpha.ok ? JSON.stringify(alpha.omitted) : alpha.error,
);

const down = await searchRegistry('brave', { readOn, taken, base: 'https://127.0.0.1:9/nowhere', timeoutMs: 3000 });
check('a registry that cannot be reached is a named state', !down.ok && /could not be reached/.test(down.error), down.ok ? 'answered?!' : down.error);

if (!process.env.BRAVE_API_KEY) {
  console.log('NOTE  no BRAVE_API_KEY in .env — the fill was not connected to; add one and run again for the probe half');
} else {
  const t1 = Date.now();
  const probe = await probeConnection(connectionFromDraft(hit.fill, []), process.env);
  check(
    'the real probe spawned the fill’s command and Brave’s server answered with its tools',
    probe.ok && probe.tools.length > 0,
    probe.ok ? `${probe.tools.length} tools in ${Date.now() - t1}ms: ${probe.tools.join(', ')} (server: ${probe.serverName})` : probe.error,
  );
  const stamped = connectionFromDraft(hit.fill, probe.tools, new Date().toISOString());
  check('what would be stored carries the shelf’s two facts', typeof stamped.verifiedAt === 'string' && stamped.source === hit.fill.source, `${stamped.verifiedAt} · ${stamped.source}`);
}

console.log(bad === 0 ? '\nREGISTRY FILL PROVEN' : `\nNOT PROVEN — ${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
