// The live proof #11 owes (D-259): the desk counts what it refuses.
//
//   node scripts/prove-refusals.mjs
//
// What the unit tests cannot reach: the one call that writes the line lives
// in the /work route in index.ts, so the only way to know a Start reaches
// the file is to press Start on a real server and read refusals.jsonl back.
// The reading is the file — never what a run says about itself.
//
// Makes its own level and rests every agentling on it, verified off disk
// before a single sentence is queued (D-246's lesson — the first standing
// proof billed $0.38 through a guard that passed by never executing). Costs
// nothing, adds zero ledger rows, and says so at the end by counting them.
//
// Two Starts, a plan, a rule and a reply — every way the desk hands a
// sentence over (D-259):
//   two rows   — a sentence that pays and signs: two lines, money then sign,
//                stamped with this level, and not one word of the sentence
//   ordinary   — a sentence that claims nothing: no new line
//   plan       — the refusing sentence at /work/plan: no new line, because the
//                plan re-runs on every keystroke and is never the count
//   rule       — the refusing sentence armed as a schedule hours from now:
//                counted once, at arming (the level closes before it fires)
//   repeat     — Start with a repeat set is the bar's /work then /schedules
//                with `queued: true`: two lines from the Start, none from
//                the arming
//   reply      — a refusing reply to the queued job: its own words counted,
//                the prompt it continues not counted again
//   torn       — nothing here; the torn-line reading is unit-tested, and a
//                proof must not damage the real file to show it

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, '.agentlings', 'refusals.jsonl');

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
const post = (url, body) =>
  call(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** The file as the server reads it: every whole line, a torn one skipped. */
const readRefusals = () =>
  existsSync(FILE)
    ? readFileSync(FILE, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        })
    : [];

// ── a level nobody can work on ──────────────────────────────────────────────
const made = await post('/api/levels', { name: 'D-259 refusals proof', project: 'Proof', theme: 'jungle-dusk' });
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
    check('every agentling on the proof level is resting', awake.length === 0, awake.map((a) => a.name).join(' '));
    if (awake.length > 0 || afterRest.length === 0) {
      stop('refusing to queue anything while someone could pick it up — this would cost money');
    }

    const mine = () => readRefusals().filter((r) => r.levelId === lid);
    // Each step is read against the lines it added, never an absolute offset —
    // the first live run failed a passing step because an earlier one had
    // added fewer lines than assumed.
    const added = (since) => mine().slice(since).map((r) => r.key).join(' ');
    check('the level starts with no refusal on file', mine().length === 0, `${mine().length}`);

    // ── two rows ────────────────────────────────────────────────────────────
    const REFUSING = 'Pay the deposit and sign the contract for the new office';
    const before = Date.now();
    const started = await post(`/api/levels/${lid}/work`, { text: REFUSING, single: true });
    check('Start queued the refusing sentence anyway — the desk warns, it does not block', started.status === 201, `${started.status}`);
    const lines = mine();
    if (lines.length === 0) {
      stop('no line for this level — the running server predates #11 (D-259); restart it first');
    }
    check('one line per row, in board order', JSON.stringify(lines.map((r) => r.key)) === '["money","sign"]', lines.map((r) => r.key).join(' '));
    check('each line carries the time and this level', lines.every((r) => r.levelId === lid && r.at >= before && r.at <= Date.now()), JSON.stringify(lines));
    const raw = readFileSync(FILE, 'utf8');
    check(
      'not one word of the sentence is on file',
      !['deposit', 'contract', 'office', 'Pay'].some((w) => raw.includes(w)),
    );

    // ── ordinary ─────────────────────────────────────────────────────────────
    const ORDINARY = "Summarise last quarter's numbers into a one-page PDF";
    const beforePlain = mine().length;
    const plain = await post(`/api/levels/${lid}/work`, { text: ORDINARY, single: true });
    check('Start queued the ordinary sentence', plain.status === 201, `${plain.status}`);
    check('ordinary work appended nothing', added(beforePlain) === '', added(beforePlain));

    // ── plan ─────────────────────────────────────────────────────────────────
    const beforePlan = mine().length;
    const planned = await post(`/api/levels/${lid}/work/plan`, { text: REFUSING, single: true });
    check('the plan answered', planned.status === 200, `${planned.status}`);
    check('the plan counted nothing — the plan is never the count', added(beforePlan) === '', added(beforePlan));

    // ── rule ─────────────────────────────────────────────────────────────────
    const later = new Date(Date.now() + 6 * 60 * 60_000);
    const beforeRule = mine().length;
    const armed = await post(`/api/levels/${lid}/schedules`, {
      text: REFUSING,
      cadence: { kind: 'daily', hour: later.getHours(), minute: later.getMinutes() },
    });
    check('the rule was armed', armed.status === 201, `${armed.status}`);
    check('arming a rule counted its sentence once', added(beforeRule) === 'money sign', added(beforeRule));

    // ── reply ────────────────────────────────────────────────────────────────
    // "pay the" rather than "wire the deposit": the first live run found that
    // the lexicon missed the latter, which is fixed in the code but not on a
    // server that predates the fix. The seam is what this step proves.
    const beforeReply = mine().length;
    const replied = await post(`/api/levels/${lid}/jobs/${started.body.id}/reply`, {
      text: 'Also pay the landlord the deposit today',
    });
    check('the reply queued', replied.status === 201, `${replied.status}`);
    check("a reply counts its own words only — one line, not the prompt's two again", added(beforeReply) === 'money', added(beforeReply));

    // ── repeat ───────────────────────────────────────────────────────────────
    const beforeRepeat = mine().length;
    const again = await post(`/api/levels/${lid}/work`, { text: REFUSING, single: true });
    const armedToo = await post(`/api/levels/${lid}/schedules`, {
      text: REFUSING,
      cadence: { kind: 'daily', hour: later.getHours(), minute: later.getMinutes() },
      queued: true,
    });
    check('Start with a repeat set queued and armed', again.status === 201 && armedToo.status === 201, `${again.status} ${armedToo.status}`);
    check('…and counted its sentence once, at the Start', added(beforeRepeat) === 'money sign', added(beforeRepeat));

    // ── and nothing ran, so nothing was billed ───────────────────────────────
    const jobs = existsSync(path.join(levelDir, 'jobs.json'))
      ? JSON.parse(readFileSync(path.join(levelDir, 'jobs.json'), 'utf8'))
      : [];
    const ran = jobs.filter((j) => j.status !== 'queued');
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
      ? `\nall PASS — nothing owed. The seven lines for ${lid} stay in refusals.jsonl: the file is append-only, and a proof level's demand is a proof, not demand (#12 counts real levels only).`
      : `\n${bad} FAILED`,
  );
  process.exitCode = bad === 0 ? 0 : 1;
}
