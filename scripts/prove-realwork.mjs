// The live proof #13 owes (D-261): the score arrives on Monday.
//
//   node scripts/prove-realwork.mjs
//
// What the unit tests cannot reach: the firing lives in the cadence sweep
// inside index.ts, driven by a timer, so the only way to know a report row
// lands a finished send is to let one come due on a real server and read the
// job it left. The reading is the job record — its outbox, its meter, its
// door list — never what anything says about itself.
//
// Makes its own level and rests every agentling on it, verified off disk
// before a single row is created (D-246's lesson — the first standing proof
// billed $0.38 through a guard that passed by never executing). Costs
// nothing, adds zero ledger rows, and says so at the end by counting them.
//
// One row, one wait (about a minute and a half of wall clock, nearly all of
// it waiting out the cadence sweep):
//   refused   — a report with no channel, no recipient, an unknown channel,
//               a door, or a trigger: 400, naming the reason, no row written
//   accepted  — `report: realwork` with telegram and a recipient: 201, the
//               label says "$0, no model", the prompt is the app's own
//   fired     — a job in review: status done, the outbox one telegram message
//               to the recipient whose body is the week's block, meter $0
//               and zero turns, no door, no agentling, no ledger row
//   deleted   — the row is removed and the level closed
// Nothing is sent: the job waits for a verdict like any send (D-075), and
// this proof never approves it.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A recipient nothing can reach: the proof never approves, so nothing is sent
// to it, and a stray Approve by hand would fail at Telegram rather than land.
const RECIPIENT = 'proof — 0';

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
  body: JSON.stringify({ name: 'D-261 realwork proof', project: 'Proof', theme: 'jungle-dusk' }),
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
  const cleanup = async () => {
    try {
      // A finished report is cleared, never approved: nothing this proof made
      // may send, and a level cannot close over a delivery still in review.
      for (const j of readJobs()) {
        if (j.status === 'done') {
          await call(`/api/levels/${lid}/jobs/${j.id}/resolve`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'clear' }),
          });
        } else if (j.status === 'queued' || j.status === 'running') {
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

    const rowsFile = path.join(levelDir, 'schedules.json');
    const readRows = () => (existsSync(rowsFile) ? JSON.parse(readFileSync(rowsFile, 'utf8')) : []);
    const cadenceIn = (minutes) => {
      const at = new Date(Date.now() + minutes * 60_000);
      return { kind: 'daily', hour: at.getHours(), minute: at.getMinutes() };
    };
    const make = (body) =>
      call(`/api/levels/${lid}/schedules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cadence: cadenceIn(1), ...body }),
      });

    // The running server must know the field at all: an older one reads a
    // report body as a row with no `text` and answers 400 "text is required"
    // for every shape below — so the accepted shape goes first, and that
    // answer stops the run with the diagnosis rather than six wrong FAILs.
    const good = { report: 'realwork', channel: 'telegram', to: RECIPIENT };
    const armed = await make(good);
    if (armed.status === 400 && /text is required/.test(armed.body.error ?? '')) {
      stop('the running server predates #13 (D-261) — restart it first');
    }

    // ── refused: the route names what a report is missing ───────────────────
    const refusals = [
      ['no channel', { report: 'realwork', to: RECIPIENT }, /channel/],
      ['no recipient', { report: 'realwork', channel: 'telegram' }, /recipient/],
      ['a channel that does not exist', { ...good, channel: 'pigeon' }, /pigeon/],
      ['a door', { ...good, tools: ['mail'] }, /door/],
      ['a mail trigger instead of a cadence', { ...good, cadence: undefined, trigger: { mail: 'from:a' } }, /calendar/],
      ['a report the app does not know', { ...good, report: 'weather' }, /weather/],
    ];
    for (const [label, body, reason] of refusals) {
      const res = await make(body);
      check(
        `refused: ${label}`,
        res.status === 400 && reason.test(res.body.error ?? ''),
        `${res.status} ${res.body.error ?? ''}`,
      );
    }
    check('no row was written by a refusal', readRows().length === 1, `${readRows().length} rows — the accepted one alone`);

    // ── accepted: the row reads back as the app's own ───────────────────────
    check('a report row with a channel and a recipient is accepted', armed.status === 201, armed.body.error);
    if (armed.status !== 201) stop('no row to fire');
    const row = armed.body;
    check('its label says the score, $0, no model', /the score, \$0, no model/.test(row.cadenceLabel), row.cadenceLabel);
    check('it carries report: realwork', row.report === 'realwork', JSON.stringify(row.report));
    check('it holds no doors', Array.isArray(row.tools) && row.tools.length === 0, JSON.stringify(row.tools));
    const stored = readRows().find((s) => s.id === row.id);
    check(
      'the recipient is stored where every row keeps one',
      stored?.answers?.['send-to:telegram'] === RECIPIENT,
      JSON.stringify(stored?.answers),
    );
    const refusalsFile = path.join(ROOT, '.agentlings', 'refusals.jsonl');
    const refusalLines = () =>
      existsSync(refusalsFile)
        ? readFileSync(refusalsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.levelId === lid)
        : [];
    check("arming it counted no refusal — the app's sentence is not an ask", refusalLines().length === 0, `${refusalLines().length} lines`);

    // ── fired: one wait for the sweep ───────────────────────────────────────
    process.stdout.write('waiting for the sweep');
    let fired;
    for (let i = 0; i < 24 && !fired; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      process.stdout.write('.');
      const now = readRows().find((s) => s.id === row.id);
      if (now?.lastFiredAt) fired = now;
    }
    console.log('');
    if (!fired) stop('the row never fired');
    check('it fired cleanly', !fired.lastError, fired.lastError);
    const jobs = readJobs();
    check('the firing landed exactly one job', jobs.length === 1, `${jobs.length} jobs`);
    const job = jobs[0] ?? {};
    check('the job is done — in review, not queued, not running', job.status === 'done', job.status);
    check("the job's prompt is the app's own sentence", /real work/.test(job.prompt ?? ''), job.prompt);
    const outbox = job.outbox ?? [];
    const message = outbox[0]?.messages?.[0];
    check('one telegram outbox, one message', outbox.length === 1 && outbox[0].channel === 'telegram' && outbox[0].messages.length === 1, JSON.stringify(outbox.map((o) => [o.channel, o.messages?.length])));
    check('addressed to the recipient, named as the desk would name it', message?.to === '0' && message?.name === 'proof', JSON.stringify({ to: message?.to, name: message?.name }));
    const body = message?.body ?? '';
    check('the body is the block: a week line, a level table, the real-work line', /^week \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}\n/.test(body) && /\nlevel +promoted/.test(body) && /\nreal work: \d+ jobs? promoted or auto-sent/.test(body), body.split('\n')[0]);
    check('the body sits under telegram\'s own cap', body.length > 0 && body.length <= 4096, `${body.length} characters`);
    check('the outbox parsed — no outboxError', !job.outboxError, job.outboxError);
    check('meter: $0 and zero turns', job.meter?.costUsd === 0 && job.meter?.turns === 0, JSON.stringify(job.meter));
    check('no door rode the firing', (job.tools ?? []).length === 0, JSON.stringify(job.tools));
    check('no agentling touched it', !job.assignedTo, job.assignedTo);
    check('nothing was sent', !job.outboxSent, JSON.stringify(job.outboxSent));
    console.log('\n' + body.split('\n').map((l) => `    ${l}`).join('\n') + '\n');

    // ── deleted ─────────────────────────────────────────────────────────────
    const gone = await call(`/api/levels/${lid}/schedules/${row.id}`, { method: 'DELETE' });
    check('the row is deleted', gone.status === 200, gone.status);
    check('and gone from disk', !readRows().some((s) => s.id === row.id));

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
      ? '\nall PASS — nothing owed here. NOT proven here: the standing approval sending a Monday report on its own (three hand approvals first, D-082).'
      : `\n${bad} FAILED`,
  );
  process.exitCode = bad === 0 ? 0 : 1;
}
