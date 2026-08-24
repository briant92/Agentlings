// The live proof D-246 owes.
//
//   node scripts/prove-standing.mjs
//
// What the unit tests cannot reach: the sweep. `sweepSchedules` lives inside
// index.ts and is driven by a timer, so the only way to know a standing input
// actually rides a firing is to let a real schedule come due on a real server
// and then look in the sandbox it queued.
//
// Costs nothing. The proof makes its own level and rests every agentling on it
// before firing, so the jobs it queues can never be picked up and no session
// ever starts — the attachment is written by queue.add, long before anyone
// would run it. The last check confirms the job never left `queued`, so a
// failure of that guard is reported rather than quietly billed.
//
// Takes about three minutes of wall clock, nearly all of it waiting for two
// cadences to come round. The second wait is what proves the actual point:
// next month's file lands in the folder and the UNCHANGED schedule follows it.

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

const password = /^\s*AGENTLINGS_PASSWORD\s*=\s*(.+)$/m
  .exec(readFileSync(path.join(ROOT, '.env'), 'utf8'))?.[1]
  ?.trim();

let cookie = '';
if (password) {
  const res = await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
}
const call = async (url, init = {}) => {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// ── a books folder, shaped like a real one ──────────────────────────────────
const books = mkdtempSync(path.join(tmpdir(), 'books-'));
const write = (name, body, secondsAgo = 0) => {
  const file = path.join(books, name);
  writeFileSync(file, body, 'utf8');
  const when = new Date(Date.now() - secondsAgo * 1000);
  utimesSync(file, when, when);
};
write('estado-cuenta-2026-07.xlsx', 'JULY ROWS', 6000);
write('estado-cuenta-2026-08.xlsx', 'AUGUST ROWS', 60);
// Excel's lock file: newer than the workbook, and the trap the newest-wins
// rule would fall into every time the sheet happened to be open.
write('~$estado-cuenta-2026-08.xlsx', 'LOCK', 0);
write('movimientos.xlsx', 'LEDGER ROWS', 300);

// ── a level nobody can work on ──────────────────────────────────────────────
const made = await call('/api/levels', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'D-246 standing proof', project: 'Proof', theme: 'jungle-dusk' }),
});
if (made.status !== 201) {
  console.error(`could not make a level (${made.status}) — is the server running?`, made.body);
  rmSync(books, { recursive: true, force: true });
  process.exit(1);
}
const lid = made.body.id;
const levelDir = path.join(ROOT, '.agentlings', 'levels', lid);
const cleanup = async () => {
  await call(`/api/levels/${lid}`, { method: 'DELETE' }).catch(() => {});
  rmSync(books, { recursive: true, force: true });
};

let restedAll = true;
for (const a of made.body.agentlings ?? []) {
  const r = await call(`/api/levels/${lid}/agentlings/${a.id}/rest`, { method: 'POST' });
  if (r.status !== 200) restedAll = false;
}
check('every agentling on the proof level is resting', restedAll);

const readJobs = () =>
  existsSync(path.join(levelDir, 'jobs.json'))
    ? JSON.parse(readFileSync(path.join(levelDir, 'jobs.json'), 'utf8'))
    : [];
const readRows = () =>
  existsSync(path.join(levelDir, 'schedules.json'))
    ? JSON.parse(readFileSync(path.join(levelDir, 'schedules.json'), 'utf8'))
    : [];

const cadenceIn = (minutes) => {
  const at = new Date(Date.now() + minutes * 60_000);
  return { kind: 'daily', hour: at.getHours(), minute: at.getMinutes() };
};
const makeSchedule = (text, inputs, cadence) =>
  call(`/api/levels/${lid}/schedules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, cadence, inputs }),
  });

// ── refused at creation, not at 08:10 on the first of the month ─────────────
const relative = await makeSchedule('reconcile', [{ dir: 'books', as: 'a.xlsx' }], cadenceIn(30));
check('a relative folder is refused at creation', relative.status === 400, relative.body.error);

const escaping = await makeSchedule('reconcile', [{ dir: books, as: '../out.xlsx' }], cadenceIn(30));
check('a landing name that is a path is refused', escaping.status === 400, escaping.body.error);

const collide = await makeSchedule(
  'reconcile',
  [
    { dir: books, match: 'estado', as: 'same.xlsx' },
    { dir: books, match: 'movimientos', as: 'same.xlsx' },
  ],
  cadenceIn(30),
);
check('two inputs landing as one name are refused', collide.status === 400, collide.body.error);

// ── round one: the good one and the broken one, same minute ─────────────────
const GOOD = 'Reconcile input/statement.xlsx against input/ledger.xlsx and list what matched.';
const BAD = 'Reconcile the vanished books.';
const round1 = cadenceIn(1);
const STATEMENT = { dir: books, match: 'estado', as: 'statement.xlsx' };

const good = await makeSchedule(GOOD, [STATEMENT, { dir: books, match: 'movimientos', as: 'ledger.xlsx' }], round1);
check('a well-formed standing schedule is accepted', good.status === 201, good.body.error);

const broken = await makeSchedule(BAD, [{ dir: path.join(books, 'nowhere'), as: 'statement.xlsx' }], round1);
check('a folder that is missing today is still accepted', broken.status === 201, broken.body.error);

check(
  'the standing inputs survived the round trip to disk',
  readRows().find((s) => s.id === good.body.id)?.inputs?.length === 2,
);

const waitForFirings = async (ids, seconds = 150) => {
  const deadline = Date.now() + seconds * 1000;
  process.stdout.write('waiting for the cadence');
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    process.stdout.write('.');
    const rows = readRows().filter((s) => ids.includes(s.id));
    if (rows.length === ids.length && rows.every((s) => s.lastFiredAt)) {
      console.log('');
      return rows;
    }
  }
  console.log('');
  return null;
};

const fired = await waitForFirings([good.body.id, broken.body.id]);
if (!fired) {
  console.error('the schedules never fired — is this server older than D-246?');
  await cleanup();
  process.exit(1);
}

const goodRow = fired.find((s) => s.id === good.body.id);
const brokenRow = fired.find((s) => s.id === broken.body.id);
check('the good schedule fired with no error on its row', !goodRow.lastError, goodRow.lastError);
check(
  'the broken one failed LOUDLY rather than running half-blind',
  !!brokenRow.lastError && /no folder at/.test(brokenRow.lastError),
  brokenRow.lastError,
);

const jobs = readJobs();
check('the good firing queued exactly one job', jobs.filter((j) => j.prompt === GOOD).length === 1);
check('the broken firing queued nothing at all', jobs.filter((j) => j.prompt === BAD).length === 0);

const job = jobs.find((j) => j.prompt === GOOD);
const inputDir = path.join(levelDir, 'jobs', job.id, 'input');
const read = (n) =>
  existsSync(path.join(inputDir, n)) ? readFileSync(path.join(inputDir, n), 'utf8') : null;

check('the statement reached the sandbox under the name the prompt uses', read('statement.xlsx') !== null);
check('and it is the NEWEST statement, not July', read('statement.xlsx') === 'AUGUST ROWS', read('statement.xlsx'));
check("and NOT Excel's lock file, which was newer than both", read('statement.xlsx') !== 'LOCK');
check('the ledger reached it too', read('ledger.xlsx') === 'LEDGER ROWS', read('ledger.xlsx'));
check(
  'nothing else was carried in',
  existsSync(inputDir) && readdirSync(inputDir).length === 2,
  existsSync(inputDir) ? readdirSync(inputDir).join(' ') : 'no input dir',
);

// ── round two: the whole point ──────────────────────────────────────────────
// September's download lands beside August's. Nothing about the schedule
// changes — same folder, same match, same words — and the next firing must
// pick up the new file without anyone touching anything.
write('estado-cuenta-2026-09.xlsx', 'SEPTEMBER ROWS', 0);
const NEXT = 'Reconcile input/statement.xlsx — next month, same sentence.';
const second = await makeSchedule(NEXT, [STATEMENT], cadenceIn(1));
check('the same standing input makes a second schedule', second.status === 201, second.body.error);

const firedAgain = await waitForFirings([second.body.id]);
if (!firedAgain) {
  console.error('the second schedule never fired');
  await cleanup();
  process.exit(1);
}
check('it fired cleanly', !firedAgain[0].lastError, firedAgain[0].lastError);

const nextJob = readJobs().find((j) => j.prompt === NEXT);
const nextRead = nextJob
  ? readFileSync(path.join(levelDir, 'jobs', nextJob.id, 'input', 'statement.xlsx'), 'utf8')
  : null;
check(
  'a new month landed in the folder and the UNCHANGED schedule followed it',
  nextRead === 'SEPTEMBER ROWS',
  nextRead,
);

// ── and nothing ran, so nothing was billed ──────────────────────────────────
const ran = readJobs().filter((j) => j.status !== 'queued');
check('no job on this level ever left the queue', ran.length === 0, ran.map((j) => j.status).join(' '));

await cleanup();
console.log(bad === 0 ? '\nall PASS — nothing owed' : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
