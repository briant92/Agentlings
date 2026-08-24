// The live proof D-248 owes — the half a fixture can reach.
//
//   node scripts/prove-mail-trigger.mjs
//
// What the unit tests cannot touch: the real routes on a real server, the
// row's shape as every surface reads it, and the one hazard with money on it —
// that the CALENDAR sweep, running every thirty seconds the whole time, never
// fires a trigger row whose nextDueAt is 0. This script makes a trigger rule
// on a level whose whole crew is rested (fail-closed, D-246's lesson: the
// guard is verified off disk BEFORE anything is created), waits out a full
// sweep interval, and proves zero jobs exist.
//
// What it deliberately cannot prove: a real mail firing the rule and a
// threaded reply landing in the right Gmail conversation. That needs a real
// mailbox and a real correspondent — no fixture stands in for it, and the
// script says so at the end rather than letting 0 failures read as "proven
// end to end".
//
// Costs nothing. Adds zero ledger rows. Takes ~40 seconds, nearly all of it
// waiting out one sweep interval.

import { existsSync, readFileSync } from 'node:fs';
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

// ── refuse a server older than the thing this proves ────────────────────────
const preview = await call('/api/trigger/preview?q=from%3Anobody-proof');
if (preview.status === 404) {
  console.error('the running server predates D-248 — restart it first');
  process.exit(1);
}

// ── a level nobody can work on ──────────────────────────────────────────────
const made = await call('/api/levels', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'D-248 trigger proof', project: 'Proof', theme: 'jungle-dusk' }),
});
if (made.status !== 201) {
  console.error(`could not make a level (${made.status}) — is the server running?`, made.body);
  process.exit(1);
}
const lid = made.body.id;
const levelDir = path.join(ROOT, '.agentlings', 'levels', lid);
const cleanup = async () => {
  try {
    const file = path.join(levelDir, 'jobs.json');
    if (existsSync(file)) {
      for (const j of JSON.parse(readFileSync(file, 'utf8'))) {
        await call(`/api/levels/${lid}/jobs/${j.id}/cancel`, { method: 'POST' });
      }
    }
  } catch {
    // Best effort: a level that will not close is reported below, not thrown.
  }
  const closed = await call(`/api/levels/${lid}`, { method: 'DELETE' });
  if (closed.status !== 200) {
    console.error(`could not close the proof level ${lid} (${closed.status}) — close it by hand`);
  }
};

// The roster off disk, rested and VERIFIED off disk before anything is
// created — the D-246 proof billed $0.38 because its guard passed by never
// executing, and this one fails closed instead.
const rosterFile = path.join(levelDir, 'roster.json');
const roster = JSON.parse(readFileSync(rosterFile, 'utf8'));
check('the proof level has a crew to rest', roster.length > 0, `${roster.length} hired`);
for (const a of roster) {
  await call(`/api/levels/${lid}/agentlings/${a.id}/rest`, { method: 'POST' });
}
const afterRest = JSON.parse(readFileSync(rosterFile, 'utf8'));
const awake = afterRest.filter((a) => !a.resting);
check('every agentling on the proof level is resting', awake.length === 0, awake.map((a) => a.name).join(' '));
if (awake.length > 0 || afterRest.length === 0) {
  console.error('refusing to create anything while someone could pick a job up');
  await cleanup();
  process.exit(1);
}

const makeSchedule = (body) =>
  call(`/api/levels/${lid}/schedules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const readRows = () =>
  existsSync(path.join(levelDir, 'schedules.json'))
    ? JSON.parse(readFileSync(path.join(levelDir, 'schedules.json'), 'utf8'))
    : [];
const readJobs = () =>
  existsSync(path.join(levelDir, 'jobs.json'))
    ? JSON.parse(readFileSync(path.join(levelDir, 'jobs.json'), 'utf8'))
    : [];

// ── refused at creation, not at the poll ────────────────────────────────────
const both = await makeSchedule({
  text: 'x',
  cadence: { kind: 'daily', hour: 9, minute: 0 },
  trigger: { mail: 'from:banco' },
});
check('cadence and trigger together are refused', both.status === 400, both.body.error);
const empty = await makeSchedule({ text: 'x', trigger: { mail: '   ' } });
check('an empty query is refused', empty.status === 400, empty.body.error);
const multiline = await makeSchedule({ text: 'x', trigger: { mail: "from:a\nto:b" } });
check('a multi-line query is refused', multiline.status === 400, multiline.body.error);

// ── the row, created and read back the way every surface reads it ───────────
const createdAtLow = Date.now();
const madeRow = await makeSchedule({
  text: 'Read input/mail.txt and summarise what the bank sent.',
  trigger: { mail: 'from:proof-nobody@example.invalid' },
});
check('a well-formed trigger rule is accepted', madeRow.status === 201, madeRow.body.error);
check('its label says what fires it', /when mail matching/.test(madeRow.body.cadenceLabel ?? ''), madeRow.body.cadenceLabel);
check('it names no next occurrence', madeRow.body.nextDueAt === undefined);

const onDisk = readRows().find((s) => s.id === madeRow.body.id);
check('the row persists with its trigger', onDisk?.trigger?.mail === 'from:proof-nobody@example.invalid');
check(
  'a new rule watches from now, never the mailbox past',
  (onDisk?.triggerState?.sinceMs ?? 0) >= createdAtLow - 5000,
  `sinceMs ${onDisk?.triggerState?.sinceMs}`,
);

// ── pause and resume, the same controls as any schedule ─────────────────────
const paused = await call(`/api/levels/${lid}/schedules/${madeRow.body.id}/pause`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ paused: true }),
});
check('a trigger row pauses', paused.status === 200 && paused.body.paused === true);
const resumed = await call(`/api/levels/${lid}/schedules/${madeRow.body.id}/pause`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ paused: false }),
});
check('and resumes', resumed.status === 200 && resumed.body.paused === false);
const afterResume = readRows().find((s) => s.id === madeRow.body.id);
check(
  'resume moves the watermark — mail during the pause stays unfired',
  (afterResume?.triggerState?.sinceMs ?? 0) >= (onDisk?.triggerState?.sinceMs ?? Infinity),
);

// ── the preview route ───────────────────────────────────────────────────────
const badPreview = await call('/api/trigger/preview?q=');
check('the preview refuses an empty query', badPreview.status === 400);
check(
  'the preview answers, or names the missing Google connection',
  (preview.status === 200 && typeof preview.body.text === 'string') ||
    (preview.status === 502 && /Google/.test(preview.body.error ?? '')),
  `status ${preview.status}`,
);

// ── the hazard with money on it: one full calendar-sweep interval ───────────
// A trigger row's nextDueAt is 0. Without dueNow's cadence guard the calendar
// sweep reads that as "due since 1970" and queues the prompt every thirty
// seconds — this wait is the live half of the unit test that pins the guard.
console.log('waiting out one full calendar-sweep interval (35 s)…');
await new Promise((resolve) => setTimeout(resolve, 35_000));
check('the calendar sweep queued nothing off the trigger row', readJobs().length === 0, `${readJobs().length} jobs`);
const afterWait = readRows().find((s) => s.id === madeRow.body.id);
check('the row is intact after the wait', afterWait?.trigger?.mail === 'from:proof-nobody@example.invalid');

// ── remove, and leave the machine as found ──────────────────────────────────
const removed = await call(`/api/levels/${lid}/schedules/${madeRow.body.id}`, { method: 'DELETE' });
check('a trigger row removes', removed.status === 200);
await cleanup();

console.log(`\n${bad === 0 ? 'ALL CHECKS PASSED' : `${bad} FAILED`}`);
console.log(
  'NOT proven here, by design: a real mail firing a rule, and a threaded reply landing in the right Gmail conversation. That needs a real mailbox — create a rule on real mail, send one, and watch the queue.',
);
process.exit(bad === 0 ? 0 : 1);
