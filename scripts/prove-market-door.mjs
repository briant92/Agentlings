// The live proof #14 owes (D-262): a market-data door through the ORDINARY path.
//
//   node scripts/prove-market-door.mjs
//
// Two halves, against the running server.
//
// The first costs nothing and needs no key of Brian's: the Alpha Vantage chip
// is offered, the form's own probe reaches Alpha Vantage's hosted MCP server
// through the header the suggestion carries, and the server answers with its
// tools — and nothing is written, to `.env` or to the connections file. It
// probes with Alpha Vantage's public `demo` key, the one their docs hand out.
//
// The second needs a key (a free one from alphavantage.co/support, 25
// requests a day), given as the first argument, as ALPHAVANTAGE_API_KEY in
// the environment, or already in `.env`. It adds the connection through the
// same route the form posts to — which is what writes the key to `.env`, and
// the script can only prove that write when the key did NOT come from `.env`
// — switches it on, queues ONE job on HQ with exactly that door, waits for
// it, and reads the job's own record and trail for the door and the calls
// made through it. Promotion stays with Brian — the script never resolves
// the job. Without a key it says so and stops, and the first half's verdict
// stands on its own.
//
// What it cannot prove, and says: the far end does not check the key's VALUE
// — a made-up token lists tools and returns a live quote, measured 2026-08-25
// — so the probe here proves the path and the header, not the key.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = path.join(ROOT, '.env');
const STORE = path.join(ROOT, '.agentlings', 'connections.json');
const LEVEL = 'hq';
const NAME = 'alphavantage';
const SECRET = 'ALPHAVANTAGE_API_KEY';
const JOB_WAIT_MS = 20 * 60_000;

const PROMPT = [
  'Market snapshot through the Alpha Vantage door.',
  'For IBM, MSFT and SPY: fetch the latest quote (GLOBAL_QUOTE) and the 50-day and',
  '200-day simple moving averages (SMA, daily interval, close). Write NOTE.md with',
  'one line per symbol — price, day change %, and whether the price sits above',
  'both averages — and the date the quotes carry. Use only the Alpha Vantage tools',
  'for every number; do not estimate or recall anything.',
].join(' ');

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};
// Ends the run early with a reason. Never `process.exit` here: on Windows,
// exiting while a fetch socket is still closing trips a libuv assertion.
class Stop extends Error {}
const stop = (why) => {
  throw new Stop(why);
};

const envText = () => (existsSync(ENV) ? readFileSync(ENV, 'utf8') : '');
const envValue = (name) => new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'm').exec(envText())?.[1]?.trim();
const storeText = () => (existsSync(STORE) ? readFileSync(STORE, 'utf8') : '');
// A chip carries two fields the form never posts.
const asDraft = ({ docs: _d, source: _s, ...draft }) => draft;

let cookie = '';
const call = async (url, init = {}) => {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const post = (url, body, method = 'POST') =>
  call(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
// GET answers a bare list; the add route answers `{ connections }`.
const connectionList = async () => {
  const { body } = await call('/api/connections');
  return Array.isArray(body) ? body : body.connections ?? [];
};

try {
  // ── sign in ───────────────────────────────────────────────────────────────
  const password = envValue('AGENTLINGS_PASSWORD');
  if (password) {
    const res = await fetch(`${BASE}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    await res.text();
    if (!res.ok) stop(`could not sign in (${res.status}) — is the server on this .env?`);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  }

  // ── half one: the chip, the probe, and nothing written ──────────────────
  const listed = await connectionList();
  check('the connection list is readable, shipped doors on it', listed.some((c) => c.name === 'web'), `${listed.length} connections`);
  const installed = listed.find((c) => c.name === NAME);
  const offered = (await call('/api/connections/suggestions')).body.suggestions ?? [];
  const chip = offered.find((s) => s.name === NAME);

  if (installed) {
    console.log(`(the "${NAME}" connection is already installed, so the chip is rightly not offered — skipping to the job)`);
  } else {
    if (!chip) stop('no alphavantage chip — the running server predates D-262, or catalog/suggestions.json lost the entry');
    check('the chip is offered, and names its source and the page to check it against', Boolean(chip.source) && Boolean(chip.docs), chip.source);
    check('it carries the key as a header placeholder, never in the URL', chip.headers?.Authorization === `Bearer \${${SECRET}}` && !/apikey/i.test(chip.url ?? ''), `${chip.url}  ${JSON.stringify(chip.headers)}`);

    const envBefore = envText();
    const storeBefore = storeText();
    const probe = await post('/api/connections/probe', { draft: asDraft(chip), values: { [SECRET]: 'demo' } });
    check('the form’s probe reached Alpha Vantage’s own server and it answered', probe.status === 200, probe.body.error ?? `${probe.status}`);
    const tools = probe.body.tools ?? [];
    check('the server named its tools — over a hundred, GLOBAL_QUOTE and SMA among them', tools.length >= 100 && tools.includes('GLOBAL_QUOTE') && tools.includes('SMA'), `${tools.length} tools`);
    check('the server said who it is', typeof probe.body.serverName === 'string' && /alphavantage/i.test(probe.body.serverName), probe.body.serverName);
    check('the probe wrote nothing to .env', envText() === envBefore);
    check('the probe wrote nothing to the connections file', storeText() === storeBefore);
  }

  // ── half two: the door, and one real job on HQ ──────────────────────────
  const inEnvBefore = envValue(SECRET);
  const key = (process.argv[2] ?? process.env[SECRET] ?? inEnvBefore)?.trim();
  if (!key) {
    console.log(`\nOWED: no key. Claim a free one at https://www.alphavantage.co/support/#api-key, then either`);
    console.log(`  node scripts/prove-market-door.mjs <key>      — the route writes it to .env, and that write is checked`);
    console.log('or paste it in Settings → reads → add a connection of your own → Alpha Vantage, and run this again for the HQ job.');
    stop('half proven — the path is live, the job waits on a key');
  }

  if (!installed) {
    const added = await post('/api/connections', { draft: asDraft(chip), values: { [SECRET]: key } });
    check('the connection was added through the form’s own route', added.status === 201, added.body.error ?? `${added.status}`);
    const stored = JSON.parse(storeText()).connections?.find((c) => c.name === NAME) ?? {};
    check('it is stored off, with the tools the SERVER named', stored.defaultOn === false && (stored.tools ?? []).length >= 100, `${(stored.tools ?? []).length} tools, defaultOn ${stored.defaultOn}`);
    check('the key is nowhere in the connections file', !storeText().includes(key));
    if (inEnvBefore) console.log(`  (the key was already in .env, so the route's own write to it is not proven by this run)`);
    else check('the route wrote the key to .env under its own name', envValue(SECRET) === key);
  }

  const switched = await post(`/api/settings/connections/${NAME}`, { enabled: true }, 'PATCH');
  check('switched on in Settings', switched.status === 200, switched.body.error ?? `${switched.status}`);
  const door = (await connectionList()).find((c) => c.name === NAME) ?? {};
  check('listed as a ready, enabled read door', door.enabled === true && door.ready === true && door.kind === 'read', JSON.stringify({ enabled: door.enabled, ready: door.ready, kind: door.kind }));

  const queued = await post(`/api/levels/${LEVEL}/work`, { text: PROMPT, single: true, tools: [NAME] });
  check('one job queued on HQ', queued.status === 201 && Boolean(queued.body.id), queued.body.error ?? `${queued.status}`);
  const jobId = queued.body.id;
  if (!jobId) stop('no job id — nothing to wait for');
  console.log(`\njob ${jobId} on ${LEVEL} — waiting for an agentling to pick it up and finish (up to ${JOB_WAIT_MS / 60_000} min)…`);

  const jobsFile = path.join(ROOT, '.agentlings', 'levels', LEVEL, 'jobs.json');
  const readJob = () => {
    const parsed = JSON.parse(readFileSync(jobsFile, 'utf8'));
    return (Array.isArray(parsed) ? parsed : parsed.jobs ?? []).find((j) => j.id === jobId);
  };
  const started = Date.now();
  let job = readJob();
  // The record, not the reply — `Job.tools` is the one field the grant writes (D-254).
  check('the stored job holds exactly that door', JSON.stringify(job?.tools) === JSON.stringify([NAME]), JSON.stringify(job?.tools));
  let last = '';
  while (job && ['queued', 'running'].includes(job.status) && Date.now() - started < JOB_WAIT_MS) {
    if (job.status !== last) {
      console.log(`  ${new Date().toLocaleTimeString()}  ${job.status}${job.assignedTo ? ` (${job.assignedTo})` : ''}`);
      last = job.status;
    }
    await new Promise((r) => setTimeout(r, 5_000));
    job = readJob();
  }
  if (!job) stop('the job vanished from jobs.json');
  check('the job finished — done, in review', job.status === 'done', `${job.status}${job.error ? `: ${job.error}` : ''}`);

  const trail = (await call(`/api/levels/${LEVEL}/jobs/${jobId}/trajectory`)).body.lines ?? [];
  const calls = trail.filter((l) => l.kind === 'call' && String(l.name).startsWith(`mcp__${NAME}__`));
  const names = [...new Set(calls.map((l) => String(l.name).replace(`mcp__${NAME}__`, '')))];
  check('the job read live data through the door — its trail shows the calls', calls.length > 0, `${calls.length} calls: ${names.join(', ')}`);
  check('nothing but this door was reached — no web, no search, no other MCP', !trail.some((l) => l.kind === 'call' && /^mcp__/.test(String(l.name)) && !String(l.name).startsWith(`mcp__${NAME}__`)));

  const cost = job.meter?.costUsd;
  console.log(`\nfor the D-entry: job ${jobId} on ${LEVEL}, ${calls.length} door calls, ${job.meter?.turns ?? '?'} turns, $${typeof cost === 'number' ? cost.toFixed(4) : '?'} — promote it in review by hand.`);
} catch (err) {
  if (err instanceof Stop) console.log(`\nstopped: ${err.message}`);
  else {
    console.error(err);
    bad++;
  }
}

console.log(bad === 0 ? '\nMARKET DOOR: 0 failed' : `\nNOT PROVEN — ${bad} failed`);
process.exitCode = bad === 0 ? 0 : 1;
