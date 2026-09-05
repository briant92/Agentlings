// #53's live proof (D-287): one real schedule firing queues through intake.
//
//   node scripts/prove-intake-firing.mjs      (needs `npm run serve`)
//
// A schedule firing writes nothing to server.log (measured: the cadence
// sweep has no console write), so the reading is the row and the job record
// it leaves: `lastFiredAt` set with no `lastError`, and in jobs.json exactly
// one job — step one of a "then" sentence with the rest riding it (the split
// still happens at fire time, D-105), the row's doors exactly (D-254), a
// quote and a role from the same reading the desk would show, no party
// (TEAMWORK T2). Makes its own level and rests every agentling on it,
// verified off disk before the row is armed, so nothing runs and nothing is
// billed; the job is cancelled, the row deleted, the level closed, and the
// ledger is counted at the end.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENTENCE = 'summarise the expenses csv, then telegram Brian the total';

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};
// Ends the run early with a reason. Never `process.exit` here: on Windows,
// exiting while a fetch socket is still closing trips a libuv assertion and
// the cleanup below never runs.
class Stop extends Error {}
const stop = (why) => {
  throw new Stop(why);
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

// ── a level nobody can work on ──────────────────────────────────────────────
const made = await call('/api/levels', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'D-287 intake firing proof', project: 'Proof', theme: 'jungle-dusk' }),
});
if (made.status !== 201) {
  console.error(`could not make a level (${made.status}) — is the server running?`, made.body);
  process.exitCode = 1;
} else {
  const lid = made.body.id;
  const levelDir = path.join(ROOT, '.agentlings', 'levels', lid);
  const readJobs = () =>
    existsSync(path.join(levelDir, 'jobs.json'))
      ? JSON.parse(readFileSync(path.join(levelDir, 'jobs.json'), 'utf8'))
      : [];
  const rowsFile = path.join(levelDir, 'schedules.json');
  const readRows = () => (existsSync(rowsFile) ? JSON.parse(readFileSync(rowsFile, 'utf8')) : []);
  const cleanup = async () => {
    try {
      // A queued job is cancelled, never run: the cancel route stamps it
      // `failed` with `error: cancelled`, and a level cannot close over a
      // job still queued.
      for (const j of readJobs()) {
        if (j.status === 'queued' || j.status === 'running') {
          await call(`/api/levels/${lid}/jobs/${j.id}/cancel`, { method: 'POST' });
        }
      }
      for (const s of readRows()) {
        await call(`/api/levels/${lid}/schedules/${s.id}`, { method: 'DELETE' });
      }
    } catch {
      // Best effort: a level that will not close is reported below, not thrown.
    }
    const closed = await call(`/api/levels/${lid}`, { method: 'DELETE' });
    if (closed.status !== 200) {
      console.error(`could not close the proof level ${lid} (${closed.status}) — close it by hand`);
    }
  };

  try {
    const rosterFile = path.join(levelDir, 'roster.json');
    const roster = JSON.parse(readFileSync(rosterFile, 'utf8'));
    check('the proof level has a crew to rest', roster.length > 0, `${roster.length} hired`);
    for (const a of roster) {
      await call(`/api/levels/${lid}/agentlings/${a.id}/rest`, { method: 'POST' });
    }
    const awake = JSON.parse(readFileSync(rosterFile, 'utf8')).filter((a) => !a.resting);
    check(
      'every agentling on the proof level is resting',
      awake.length === 0,
      awake.map((a) => a.name).join(' '),
    );
    if (awake.length > 0 || roster.length === 0) {
      stop('refusing to arm anything while someone could pick it up — this would cost money');
    }

    // ── armed: a cadence row one minute out, a "then" sentence, one door ─────
    const at = new Date(Date.now() + 60_000);
    const cadence = { kind: 'daily', hour: at.getHours(), minute: at.getMinutes() };
    const arm = (tools) =>
      call(`/api/levels/${lid}/schedules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: SENTENCE, cadence, tools }),
      });
    let tools = ['render'];
    let armed = await arm(tools);
    if (armed.status === 400 && /door/.test(armed.body.error ?? '')) {
      // The door list is this install's own; a row naming none proves the
      // same thing one level down (an empty list rides as no doors).
      console.log(`  (render is not a door on this install today: ${armed.body.error} — arming with none)`);
      tools = [];
      armed = await arm(tools);
    }
    check('a cadence row with a "then" sentence is accepted', armed.status === 201, `${armed.status} ${armed.body.error ?? ''}`);
    if (armed.status !== 201) stop('no row to fire');
    const row = armed.body;
    check(
      'the row stores the sentence verbatim and the doors named',
      row.prompt === SENTENCE && JSON.stringify(row.tools) === JSON.stringify(tools),
      JSON.stringify([row.prompt, row.tools]),
    );
    check('nothing is queued before the sweep', readJobs().length === 0, `${readJobs().length} jobs`);

    // ── fired: one wait for the sweep ───────────────────────────────────────
    process.stdout.write('waiting for the sweep');
    let fired;
    for (let i = 0; i < 30 && !fired; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      process.stdout.write('.');
      const now = readRows().find((s) => s.id === row.id);
      if (now?.lastFiredAt) fired = now;
    }
    console.log('');
    if (!fired) stop('the row never fired');
    check('it fired cleanly — no lastError on the row', !fired.lastError, fired.lastError);
    console.log(`  fired at ${new Date(fired.lastFiredAt).toISOString()}`);
    const jobs = readJobs();
    check('the firing landed exactly one job', jobs.length === 1, `${jobs.length} jobs`);
    const job = jobs[0] ?? {};
    check('it is queued — nobody awake to take it', job.status === 'queued', job.status);
    check(
      'a composite sentence still splits at fire time (D-105): the job is step one',
      job.prompt === 'summarise the expenses csv',
      job.prompt,
    );
    check(
      'with the rest riding it',
      JSON.stringify(job.steps) === JSON.stringify(['telegram Brian the total']) &&
        job.step?.n === 1 &&
        job.step?.of === 2,
      JSON.stringify([job.steps, job.step]),
    );
    check(
      "the row's doors exactly, passed bare (D-254)",
      JSON.stringify(job.tools ?? []) === JSON.stringify(tools),
      JSON.stringify(job.tools),
    );
    check(
      'quoted and routed by the same reading the desk shows',
      typeof job.quotedUsd === 'number' && typeof job.preferredRole === 'string',
      JSON.stringify({ quotedUsd: job.quotedUsd, preferredRole: job.preferredRole }),
    );
    check(
      'no party, no mail stamp, no attachment',
      !job.party && !job.mailTrigger && !job.attachments?.length,
      JSON.stringify({ party: job.party, mailTrigger: job.mailTrigger, attachments: job.attachments?.length }),
    );
    check(
      'no agentling touched it and nothing ran',
      !job.assignedTo && !job.meter,
      JSON.stringify({ assignedTo: job.assignedTo, meter: job.meter }),
    );

    // ── and nothing ran, so nothing was billed ───────────────────────────────
    const ledgerFile = path.join(ROOT, '.agentlings', 'ledger.jsonl');
    const ledgerRows = existsSync(ledgerFile)
      ? readFileSync(ledgerFile, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
          .filter((r) => r.levelId === lid)
      : [];
    check('zero ledger rows for the proof level — $0', ledgerRows.length === 0, `${ledgerRows.length} rows`);
  } catch (err) {
    if (!(err instanceof Stop)) throw err;
    console.error(err.message);
    bad++;
  }

  await cleanup();
  console.log(
    bad === 0
      ? '\nall PASS — NOT proven here: a mail-trigger firing, which needs a real mail to arrive.'
      : `\n${bad} FAILED`,
  );
  process.exitCode = bad === 0 ? 0 : 1;
}
