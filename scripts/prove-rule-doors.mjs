// The live proof #9 owes (D-254): a rule's firing holds only the doors it names.
//
//   node scripts/prove-rule-doors.mjs
//
// What the unit tests cannot reach: both sweeps live inside index.ts and are
// driven by timers, so the only way to know a row's doors ride its firing is
// to let real rows come due on a real server and read the jobs they queued.
// The reading is `Job.tools` — the one field `grantedTools` writes — never
// what a run says about itself.
//
// Makes its own level and rests every agentling on it, verified off disk
// before a single row is created (D-246's lesson — the first standing proof
// billed $0.38 through a guard that passed by never executing). Costs
// nothing, adds zero ledger rows, and says so at the end by counting them.
//
// Four rows, two waits (about two and a half minutes of wall clock, nearly
// all of it waiting out the cadence sweep):
//   legacy   — written straight into schedules.json WITHOUT the field, the
//              way every row on disk looked before #9: fires with the old
//              grant, every enabled door, and its label says so
//   none     — `tools: []`, fires with an EMPTY door list
//   omitted  — no `tools` in the request: stored as none, fires as none
//   one door — `tools: [<a door the legacy firing proved is on>]`, fires with
//              exactly that door
// The one door is read off the legacy firing rather than off these notes, so
// the proof cannot pass by naming a door that happens to be switched off.
//
// What it deliberately cannot prove: a MAIL firing. That needs real mail from
// a real correspondent; the mail sweep passes the same field through the same
// glue, one line apart from the cadence sweep's, and the script says so at
// the end rather than letting 0 failures read as both sweeps proven.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};
// Ends the run early with a reason. Never `process.exit` here: on Windows,
// exiting while a fetch socket is still closing trips a libuv assertion
// (`!(handle->flags & UV_HANDLE_CLOSING)`) and the cleanup below never runs.
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
  body: JSON.stringify({ name: 'D-254 rule doors proof', project: 'Proof', theme: 'jungle-dusk' }),
});
if (made.status !== 201) {
  console.error(`could not make a level (${made.status}) — is the server running?`, made.body);
  process.exitCode = 1;
} else {
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

  try {
    const rosterFile = path.join(levelDir, 'roster.json');
    const roster = JSON.parse(readFileSync(rosterFile, 'utf8'));
    check('the proof level has a crew to rest', roster.length > 0, `${roster.length} hired`);
    for (const a of roster) {
      await call(`/api/levels/${lid}/agentlings/${a.id}/rest`, { method: 'POST' });
    }
    const afterRest = JSON.parse(readFileSync(rosterFile, 'utf8'));
    const awake = afterRest.filter((a) => !a.resting);
    check(
      'every agentling on the proof level is resting',
      awake.length === 0,
      awake.map((a) => a.name).join(' '),
    );
    if (awake.length > 0 || afterRest.length === 0) {
      stop('refusing to queue anything while someone could pick it up — this would cost money');
    }

    const readJobs = () =>
      existsSync(path.join(levelDir, 'jobs.json'))
        ? JSON.parse(readFileSync(path.join(levelDir, 'jobs.json'), 'utf8'))
        : [];
    const rowsFile = path.join(levelDir, 'schedules.json');
    const readRows = () =>
      existsSync(rowsFile) ? JSON.parse(readFileSync(rowsFile, 'utf8')) : [];
    const row = (id) => readRows().find((s) => s.id === id);

    const cadenceIn = (minutes) => {
      const at = new Date(Date.now() + minutes * 60_000);
      return { kind: 'daily', hour: at.getHours(), minute: at.getMinutes() };
    };
    const makeSchedule = (text, extra) =>
      call(`/api/levels/${lid}/schedules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, cadence: cadenceIn(1), ...extra }),
      });

    const waitForFirings = async (ids, seconds = 120) => {
      const deadline = Date.now() + seconds * 1000;
      process.stdout.write('waiting for the sweep');
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
    // `tools` absent on a stored job is none — queue.add drops an empty list.
    const doorsOf = (job) => job?.tools ?? [];

    // ── the legacy row, exactly as every row on disk looked before #9 ────────
    const LEGACY = 'Legacy row: the field does not exist on me.';
    const NONE = 'A row that names no doors.';
    const OMITTED = 'A row whose request had no tools field at all.';
    writeFileSync(
      rowsFile,
      `${JSON.stringify(
        [{ id: 'legacy01', prompt: LEGACY, cadence: cadenceIn(1), createdAt: Date.now(), nextDueAt: Date.now() - 1 }],
        null,
        2,
      )}\n`,
      'utf8',
    );
    const none = await makeSchedule(NONE, { tools: [] });
    check('a row naming no doors is accepted', none.status === 201, none.body.error);

    // The staleness refusal every proof on this line carries, and it comes
    // FIRST: a server started before #9 accepts the POST and silently drops
    // the field, and it validates nothing — so on that server every check
    // below would read as a failure of the feature rather than of the server.
    if (row(none.body.id)?.tools === undefined) {
      stop('the running server predates #9 (D-254) — restart it first');
    }
    check(
      'an empty list survived the round trip to disk as [] — not absent',
      JSON.stringify(row(none.body.id)?.tools) === '[]',
      JSON.stringify(row(none.body.id)?.tools),
    );
    const omitted = await makeSchedule(OMITTED, {});
    check('a row naming nothing at all is accepted', omitted.status === 201, omitted.body.error);
    check('and stored as none', JSON.stringify(row(omitted.body.id)?.tools) === '[]');
    check('the legacy row still carries no field', row('legacy01')?.tools === undefined);

    // ── refused at creation, not at the firing ───────────────────────────────
    const unknown = await makeSchedule('x', { tools: ['nosuchdoor'] });
    check(
      'a name that is no connection is refused, by name',
      unknown.status === 400 && /nosuchdoor/.test(unknown.body.error ?? ''),
      unknown.body.error,
    );
    const channel = await makeSchedule('x', { tools: ['telegram'] });
    check('a sending channel is refused — it is not a door', channel.status === 400, channel.body.error);
    const notList = await makeSchedule('x', { tools: 'bls' });
    check('a list that is not a list is refused', notList.status === 400, notList.body.error);
    check('and none of those was stored', readRows().length === 3, `${readRows().length} rows`);

    const listed = (await call(`/api/levels/${lid}/schedules`)).body.schedules ?? [];
    const legacyInfo = listed.find((s) => s.id === 'legacy01');
    const noneInfo = listed.find((s) => s.id === none.body.id);
    check(
      'the legacy row reads as legacy on every surface',
      /holds every door/.test(legacyInfo?.cadenceLabel ?? ''),
      legacyInfo?.cadenceLabel,
    );
    check('and reports no door list', legacyInfo?.tools === undefined);
    check(
      'a row that named none reads without the legacy note',
      !!noneInfo && !/holds every door/.test(noneInfo.cadenceLabel),
      noneInfo?.cadenceLabel,
    );
    check('and reports its empty list', JSON.stringify(noneInfo?.tools) === '[]');

    // ── first wait: legacy, none and omitted come due together ───────────────
    const first = await waitForFirings(['legacy01', none.body.id, omitted.body.id]);
    if (!first) stop('the rows never fired — is this server older than #9?');
    check(
      'every row fired with no error on it',
      first.every((s) => !s.lastError),
      first.map((s) => s.lastError).filter(Boolean).join(' | '),
    );

    const jobs = readJobs();
    const legacyJob = jobs.find((j) => j.prompt === LEGACY);
    const noneJob = jobs.find((j) => j.prompt === NONE);
    const omittedJob = jobs.find((j) => j.prompt === OMITTED);
    check(
      'each firing queued exactly one job',
      [LEGACY, NONE, OMITTED].every((p) => jobs.filter((j) => j.prompt === p).length === 1),
    );
    const today = doorsOf(legacyJob);
    check('the legacy firing holds the old grant — every enabled door', today.length >= 2, today.join(' '));
    check('the none firing holds an EMPTY door list', doorsOf(noneJob).length === 0, JSON.stringify(doorsOf(noneJob)));
    check('the omitted firing holds none too', doorsOf(omittedJob).length === 0, JSON.stringify(doorsOf(omittedJob)));

    // ── second wait: one door, read off what the legacy firing proved is on ──
    const door = today.includes('bls') ? 'bls' : today[0];
    const ONE = `A row that names one door: ${door}.`;
    const one = await makeSchedule(ONE, { tools: [door] });
    check(`a row naming one door (${door}) is accepted`, one.status === 201, one.body.error);
    const second = await waitForFirings([one.body.id]);
    if (!second) stop('the one-door row never fired');
    check('it fired cleanly', !second[0].lastError, second[0].lastError);
    const oneJob = readJobs().find((j) => j.prompt === ONE);
    check(
      'the firing holds exactly that door and nothing else',
      JSON.stringify(doorsOf(oneJob)) === JSON.stringify([door]),
      JSON.stringify(doorsOf(oneJob)),
    );

    // ── and nothing ran, so nothing was billed ───────────────────────────────
    const ran = readJobs().filter((j) => j.status !== 'queued');
    check('no job on this level ever left the queue', ran.length === 0, ran.map((j) => j.status).join(' '));
    const ledgerFile = path.join(ROOT, '.agentlings', 'ledger.jsonl');
    const ledgerRows = existsSync(ledgerFile)
      ? readFileSync(ledgerFile, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
          .filter((r) => r.levelId === lid)
      : [];
    check(
      'zero ledger rows for the proof level — $0',
      ledgerRows.length === 0,
      `${ledgerRows.length} rows, $${ledgerRows.reduce((s, r) => s + (r.costUsd ?? 0), 0)}`,
    );
  } catch (err) {
    if (!(err instanceof Stop)) throw err;
    console.error(err.message);
    bad++;
  }

  await cleanup();
  console.log(
    bad === 0
      ? '\nall PASS — nothing owed. NOT proven here: a MAIL firing (needs real mail); the mail sweep passes the same field one line apart.'
      : `\n${bad} FAILED`,
  );
  process.exitCode = bad === 0 ? 0 : 1;
}
