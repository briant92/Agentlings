// The live proof #16 owes for the ROUTES (D-255, D-264), against the running
// server — after a restart that carries the code (the mechanism itself is
// `prove-browser-act-runner.mjs`, which needs no server):
//
//   node scripts/prove-browser-act.mjs
//
// It signs in, reads the door off the catalog as Settings lists it, saves an
// allowlist and reads it back as bare hosts, is refused a schedule and a mail
// rule naming the door — by name, with the reason — then queues TWO jobs on
// HQ by hand holding exactly `browser-act`: one fills and submits the
// login-free form on the allowlist (a window opens on this screen; watch
// it), one asks for a domain off the list and is refused in the run, the
// refusal named on its trail. Both cost money. Promotion stays with you; the
// door is switched back off at the end, as it ships.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = path.join(ROOT, '.env');
const LEVEL = 'hq';
const NAME = 'browser-act';
const FORM = 'https://www.selenium.dev/selenium/web/web-form.html';
const JOB_WAIT_MS = 15 * 60_000;

const PROMPT_FORM = `Open ${FORM} in the browser. Fill the "Text input" with "agentlings proof", choose "Two" in the dropdown select, tick the checkbox that is not already ticked, and press Submit. Do not touch the password field. After submitting, read the page that comes back and write RESULT.md with its heading and its message, verbatim. Use only the browser tools for this; do not guess what the page shows.`;
const PROMPT_OFF = 'Open https://example.com/ in the browser and write its main heading into RESULT.md. If the browser refuses, write RESULT.md saying exactly what it answered and stop.';

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};
class Stop extends Error {}
const stop = (why) => {
  throw new Stop(why);
};

const envText = () => (existsSync(ENV) ? readFileSync(ENV, 'utf8') : '');
const envValue = (name) => new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'm').exec(envText())?.[1]?.trim();

let cookie = '';
const call = async (url, init = {}) => {
  const res = await fetch(`${BASE}${url}`, { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const post = (url, body, method = 'POST') =>
  call(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const connectionList = async () => {
  const { body } = await call('/api/connections');
  return Array.isArray(body) ? body : body.connections ?? [];
};
const jobsFile = path.join(ROOT, '.agentlings', 'levels', LEVEL, 'jobs.json');
// The server rewrites jobs.json whole; a read that lands mid-write is torn
// JSON, not a missing job. The first live run threw on exactly that, and the
// throw ran the `finally` — emptying the allowlist under a job just queued.
let lastGood = [];
const readJob = (id) => {
  try {
    const parsed = JSON.parse(readFileSync(jobsFile, 'utf8'));
    lastGood = Array.isArray(parsed) ? parsed : parsed.jobs ?? [];
  } catch {
    // torn — answer from the last whole read; the next poll re-reads
  }
  return lastGood.find((j) => j.id === id);
};
const waitFor = async (id) => {
  const started = Date.now();
  let job = readJob(id);
  let last = '';
  while (job && ['queued', 'running'].includes(job.status) && Date.now() - started < JOB_WAIT_MS) {
    if (job.status !== last) {
      console.log(`  ${new Date().toLocaleTimeString()}  ${job.status}${job.assignedTo ? ` (${job.assignedTo})` : ''}`);
      last = job.status;
    }
    await new Promise((r) => setTimeout(r, 5_000));
    job = readJob(id);
  }
  return job;
};
const trail = async (id) => (await call(`/api/levels/${LEVEL}/jobs/${id}/trajectory`)).body.lines ?? [];
const cadenceIn = (minutes) => {
  const at = new Date(Date.now() + minutes * 60_000);
  return { kind: 'daily', hour: at.getHours(), minute: at.getMinutes() };
};

let switchedOn = false;
let before = null;
try {
  const password = envValue('AGENTLINGS_PASSWORD');
  if (password) {
    const res = await fetch(`${BASE}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    await res.text();
    if (!res.ok) stop(`could not sign in (${res.status}) — is the server on this .env?`);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  }

  // ── the door as Settings lists it ─────────────────────────────────────────
  const settings = (await call('/api/settings')).body;
  if (!settings.browserAct) stop('no browserAct on /api/settings — the running server predates #16 (D-264); restart it first');
  // Yours, put back at the end whatever happens below (the review's catch:
  // the first cut narrowed the list to the proof's host and left it so).
  before = settings.browserAct;
  const door = (await connectionList()).find((c) => c.name === NAME);
  check('browser-act is on the catalog as a read door, supervised, off by default', door?.kind === 'read' && door.supervised === true && door.defaultOn === false, JSON.stringify({ kind: door?.kind, supervised: door?.supervised, defaultOn: door?.defaultOn }));
  const reads = (await connectionList()).find((c) => c.name === 'browser');
  check('the read-only browser is unchanged beside it', reads?.supervised === undefined && reads?.kind === 'read');

  // ── the allowlist, saved and read back as bare hosts ──────────────────────
  const saved = await post('/api/settings/browser-act', { allow: 'https://WWW.Selenium.dev/selenium/web/, Example.COM/path' }, 'PUT');
  check('the allowlist is saved as bare lowercase hosts, whatever was pasted', saved.status === 200 && JSON.stringify(saved.body.allow) === JSON.stringify(['www.selenium.dev', 'example.com']), JSON.stringify(saved.body));
  check('the profile folder defaults under .agentlings when none was chosen', typeof saved.body.profileDir === 'string' && saved.body.profileDir.includes('.agentlings'), saved.body.profileDir);
  const relative = await post('/api/settings/browser-act', { allow: 'example.com', profileDir: 'profiles/act' }, 'PUT');
  check('a relative profile folder is refused', relative.status === 400, relative.body.error);
  const narrowed = await post('/api/settings/browser-act', { allow: 'www.selenium.dev' }, 'PUT');
  check('narrowed to the one host the proof needs', JSON.stringify(narrowed.body.allow) === JSON.stringify(['www.selenium.dev']));
  check('the settings read carries the same list', JSON.stringify((await call('/api/settings')).body.browserAct.allow) === JSON.stringify(['www.selenium.dev']));

  // ── a rule may never hold it ──────────────────────────────────────────────
  const schedule = await post(`/api/levels/${LEVEL}/schedules`, { text: 'act in the browser every day', cadence: cadenceIn(60), tools: [NAME] });
  check('a schedule naming browser-act is refused, by name and with the reason', schedule.status === 400 && /browser-act/.test(schedule.body.error ?? '') && /by hand/.test(schedule.body.error ?? ''), schedule.body.error);
  const rule = await post(`/api/levels/${LEVEL}/schedules`, { text: 'act in the browser when mail arrives', trigger: { mail: 'from:nobody@example.invalid' }, tools: [NAME] });
  check('a mail rule naming browser-act is refused the same way', rule.status === 400 && /browser-act/.test(rule.body.error ?? ''), rule.body.error);
  // `GET /schedules` answers `{ schedules }`; read that list, and refuse to
  // pass on a shape that is not one (the first cut of this check read the
  // bare body and could never fail — the review's catch).
  const armed = (await call(`/api/levels/${LEVEL}/schedules`)).body.schedules;
  check('nothing was armed by either', Array.isArray(armed) && !armed.some((s) => (s.tools ?? []).includes(NAME)), Array.isArray(armed) ? `${armed.length} rows` : 'no schedules list in the answer');

  // ── switched on, by hand ──────────────────────────────────────────────────
  const on = await post(`/api/settings/connections/${NAME}`, { enabled: true }, 'PATCH');
  check('switched on in Settings', on.status === 200, on.body.error);
  switchedOn = true;

  // ── job 1: the allowlisted form, watched ──────────────────────────────────
  console.log('\njob 1 — the form on the allowlist. A browser window opens on this screen; watch it.');
  const q1 = await post(`/api/levels/${LEVEL}/work`, { text: PROMPT_FORM, single: true, tools: [NAME] });
  check('one hand-queued job on HQ holding browser-act', q1.status === 201 && Boolean(q1.body.id), q1.body.error);
  if (!q1.body.id) stop('no job id');
  check('the stored job holds exactly that door', JSON.stringify(readJob(q1.body.id)?.tools) === JSON.stringify([NAME]), JSON.stringify(readJob(q1.body.id)?.tools));
  const j1 = await waitFor(q1.body.id);
  check('job 1 finished — done, in review', j1?.status === 'done', `${j1?.status}${j1?.error ? `: ${j1.error}` : ''}`);
  const t1 = await trail(q1.body.id);
  const acts1 = t1.filter((l) => l.kind === 'call' && /^mcp__browser-act__browser_(fill_form|type|click|select_option)$/.test(String(l.name)));
  check('its trail shows the acting calls — fill, select, click — one line each', acts1.length > 0, `${acts1.length}: ${[...new Set(acts1.map((l) => String(l.name).replace('mcp__browser-act__', '')))].join(', ')}`);
  check('every acting call has its result line on the trail', acts1.every((l) => t1.some((r) => r.kind === 'result' && r.id === l.id)));
  check('no refusal on the allowlisted job', !t1.some((l) => l.kind === 'result' && /refused:/.test(String(l.head))));
  const result1 = (await call(`/api/levels/${LEVEL}/jobs/${q1.body.id}/output/RESULT.md/preview`)).body;
  check('RESULT.md reports the confirmation page — the submit reached the far end', /form submitted|received/i.test(JSON.stringify(result1)));
  console.log(`  job 1: ${q1.body.id}, ${t1.filter((l) => l.kind === 'call').length} calls, $${j1?.meter?.costUsd?.toFixed(4) ?? '?'} — promote it in review by hand.`);

  // ── job 2: a domain off the list ──────────────────────────────────────────
  console.log('\njob 2 — a domain off the list');
  const q2 = await post(`/api/levels/${LEVEL}/work`, { text: PROMPT_OFF, single: true, tools: [NAME] });
  check('a second hand-queued job holding browser-act', q2.status === 201 && Boolean(q2.body.id), q2.body.error);
  if (!q2.body.id) stop('no job id');
  const j2 = await waitFor(q2.body.id);
  check('job 2 finished — a refusal is the tool’s answer, not the run’s failure', j2?.status === 'done', `${j2?.status}${j2?.error ? `: ${j2.error}` : ''}`);
  const t2 = await trail(q2.body.id);
  const refused = t2.filter((l) => l.kind === 'result' && l.ok === false && /^refused: example\.com is not on the browser-act allowlist \(www\.selenium\.dev\)/.test(String(l.head)));
  check('the navigate was refused in the run, named on the trail with the host and the list', refused.length > 0, refused[0]?.head);
  check('every navigate on job 2 was refused — no page off the list was shown', t2.filter((l) => l.kind === 'call' && l.name === 'mcp__browser-act__browser_navigate').every((c) => t2.find((r) => r.kind === 'result' && r.id === c.id)?.ok === false));
  console.log(`  job 2: ${q2.body.id}, $${j2?.meter?.costUsd?.toFixed(4) ?? '?'}`);
} catch (err) {
  if (err instanceof Stop) console.log(`\nstopped: ${err.message}`);
  else {
    console.error(err);
    bad++;
  }
} finally {
  if (switchedOn) {
    const off = await post(`/api/settings/connections/${NAME}`, { enabled: false }, 'PATCH');
    console.log(`\nbrowser-act switched back off, as it ships (${off.status})`);
  }
  if (before) {
    const restored = await post('/api/settings/browser-act', { allow: before.allow, profileDir: before.profileDir }, 'PUT');
    console.log(`your allowlist and profile folder put back (${restored.status}): ${JSON.stringify(restored.body)}`);
  }
}

console.log(bad === 0 ? '\nBROWSER-ACT: 0 failed' : `\nNOT PROVEN — ${bad} failed`);
process.exitCode = bad === 0 ? 0 : 1;
