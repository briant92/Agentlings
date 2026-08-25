// Prints the money map in AGENTLING.md straight from the ledger.
//
// The figures in that section are generated, not typed. SPEC.md carried
// "~13c / ~50c" for the one-shot and session tiers until 2026-08-01, by which
// point the real numbers were 19.2c and 39.2c — a figure written into prose is
// a figure nobody recomputes. Run this and paste the output.
//
//   npm run ledger:report
//
// Plain node, no dependencies, reads one file. Safe to run any time.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { normalise, readRecipes, TOOL_CANDIDATE_RUNS } from '../server/src/recipes';
import { totals, type LedgerEntry } from '../server/src/ledger';
import { compileBlockers } from '../server/src/capability';
import { readConnections } from '../server/src/connections';
import { usableTools } from '../server/src/tools';
import { TRAJECTORY_FILE } from '../server/src/trajectory';
import { listLevelDirs, readMeta } from '../server/src/levels';
import { readStoredJobs } from '../server/src/queue';
import { readRefusals } from '../server/src/refusals';
import { formatRealWork, lastFullWeek, realWork } from '../server/src/realwork';

const ROOT = path.join(process.cwd(), '.agentlings');
const LEDGER = path.join(process.cwd(), '.agentlings', 'ledger.jsonl');
const LEVELS = path.join(process.cwd(), '.agentlings', 'levels');
// Recomputed like LEDGER and LEVELS above: the server's own constant lives in
// index.ts, which boots a server on import — a report must not. It is the
// REPO-ROOT catalog (index.ts ROOT), not .agentlings/catalog — this script's
// first run pointed there, read an empty list, and printed inverted verdicts:
// an empty connections list voids the gate silently, passing every usedTools
// recipe vacuously and blocking every capabilities-path one with nothing
// subtracted. Hence the loud guard where it is read.
const CONNECTIONS = path.join(process.cwd(), 'catalog', 'connections.json');

/**
 * Which recipe each job belongs to, including the runs that predate it.
 *
 * `recipeKey` is only written on `oneshot` rows, so grouping by it alone sees
 * a job's third run and not its first two — which hid the whole point, since
 * the step down from session to leash is the thing the section is about.
 *
 * The key is recovered from the job record's own prompt, through the same
 * `normalise` the router keys recipes by. Imported rather than copied: a
 * second notion of "the same job" that drifts from the first is the mistake
 * this repo has already paid for.
 *
 * Rows whose job record is gone stay ungrouped and are counted, not dropped.
 */
function promptKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const level of existsSync(LEVELS) ? readdirSync(LEVELS) : []) {
    const file = path.join(LEVELS, level, 'jobs.json');
    if (!existsSync(file)) continue;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    for (const job of Array.isArray(parsed) ? parsed : (parsed.jobs ?? [])) {
      if (job.id && job.prompt) keys.set(job.id, normalise(job.prompt));
    }
  }
  return keys;
}

/** A torn last line must not lose the rest of the history — as in ledger.ts. */
function read() {
  let raw;
  try {
    raw = readFileSync(LEDGER, 'utf8');
  } catch {
    console.error(`no ledger at ${LEDGER} — run some jobs first`);
    process.exit(1);
  }
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    })
    // A run still in flight, or one that died under a server not yet
    // restarted — not yet a cost either way, as readLedger reads it (D-199).
    .filter((row) => !row.open)
    .sort((a, b) => a.at - b.at);
}

const usd = (n: number) => (n < 1 ? `${(n * 100).toFixed(1)}c` : `$${n.toFixed(2)}`);
const pad = (s: unknown, n: number) => String(s).padEnd(n);
const num = (s: unknown, n: number) => String(s).padStart(n);

/**
 * What one *granted* turn cost, narrowed to a shape. Same unit as ledger.ts:
 * turnsAllowed, never the SDK's reported turns, and failures count — a session
 * that died still burnt its turns at a real rate.
 */
function perTurn(rows: LedgerEntry[], tier: string, hasRepo: boolean) {
  const v = rows.filter(
    (r) => r.tier === tier && r.hasRepo === hasRepo && r.costUsd > 0 && (r.turnsAllowed ?? 0) > 0,
  );
  if (!v.length) return null;
  const cost = v.reduce((s, r) => s + r.costUsd, 0);
  const turns = v.reduce((s, r) => s + (r.turnsAllowed ?? 0), 0);
  return { n: v.length, usd: cost / turns };
}

const rows = read();
if (!rows.length) {
  console.error('ledger is empty');
  process.exit(1);
}

const span = [rows[0], rows.at(-1)].map((r) => new Date(r.at).toISOString().slice(0, 10));
console.log(`# Ledger report — ${rows.length} jobs, ${span[0]} to ${span[1]}\n`);

/**
 * The score first (D-249, D-260): real work under supervision, last full
 * week, per real level — from the one function the Monday send (#13) will
 * also call, so this section and that message cannot disagree. Everything
 * below it is the map and the money; this is what the horde actually did.
 */
console.log('## Real work — the score, last full week\n');
console.log(
  formatRealWork(
    realWork(
      lastFullWeek(Date.now()),
      listLevelDirs(ROOT).map((dir) => {
        const meta = readMeta(dir);
        return { id: meta.id, name: meta.name, jobs: readStoredJobs(dir) };
      }),
      rows,
      readRefusals(ROOT),
    ),
  ),
);
console.log('\nA job counts in the week of its verdict, not the week it ran; a done nobody reviewed is awaiting, not real work.\n');

console.log('## By tier\n');
console.log(`${pad('tier', 9)}${num('n', 4)}${num('paid', 6)}${num('mean', 9)}${num('max', 9)}  per turn (repo / no repo)`);
for (const tier of ['routed', 'tool', 'oneshot', 'session']) {
  const v = rows.filter((r) => r.tier === tier);
  if (!v.length) continue;
  const paid = v.filter((r) => r.costUsd > 0);
  const mean = paid.length ? paid.reduce((s, r) => s + r.costUsd, 0) / paid.length : 0;
  const max = paid.length ? Math.max(...paid.map((r) => r.costUsd)) : 0;
  const withRepo = perTurn(rows, tier, true);
  const without = perTurn(rows, tier, false);
  const rate = paid.length
    ? `${withRepo ? usd(withRepo.usd) : '—'} / ${without ? usd(without.usd) : '—'}`
    : 'free';
  console.log(
    `${pad(tier, 9)}${num(v.length, 4)}${num(paid.length, 6)}${num(paid.length ? usd(mean) : 'free', 9)}${num(paid.length ? usd(max) : '—', 9)}  ${rate}`,
  );
}

console.log('\n## Billing\n');
/**
 * From `totals`, not from a second copy of the same arithmetic.
 *
 * It used to keep its own copy: `absorbed` was "cost of rows whose outcome is
 * failed", which misses a tool fall-back — a run that finished `done` and was
 * deliberately charged nothing. So fixing `totals` moved this report by
 * exactly zero until the copy went, which is the argument for calling the
 * shared function rather than re-deriving it alongside.
 */
const { costUsd: cost, priceUsd: price, absorbedUsd: absorbed, unmeasured } = totals(rows);
const free = rows.filter((r) => r.costUsd === 0).length;
console.log(`spent        ${usd(cost)}`);
console.log(`chargeable   ${usd(price)}`);
console.log(
  `absorbed     ${usd(absorbed)}  (${Math.round((100 * absorbed) / cost)}% of spend — spent and never charged)`,
);
const fellBack = rows.filter((r) => r.toolFellBack);
if (fellBack.length) {
  console.log(
    `  of which    ${usd(fellBack.reduce((s, r) => s + r.costUsd, 0))} over ${fellBack.length} rows a compiled tool claimed and could not finish`,
  );
}
console.log(`free jobs    ${free} of ${rows.length}  (${Math.round((100 * free) / rows.length)}%)`);
if (unmeasured) console.log(`unmeasured   ${unmeasured}  (spent money none of the above includes)`);
// Part of `spent`, shown apart from it because the per-turn rate excludes it:
// the write-up is a fixed errand, not something a turn budget buys (D-039).
const split = rows.filter((r) => r.closeOutUsd);
if (split.length) {
  const wrote = split.reduce((s, r) => s + r.closeOutUsd, 0);
  console.log(
    `write-ups    ${usd(wrote)} over ${split.length} rows, mean ${usd(wrote / split.length)}  (inside 'spent'; excluded from every per-turn rate)`,
  );
}

console.log('\n## Trend\n');
const half = Math.floor(rows.length / 2);
for (const [label, v] of [
  ['first half ', rows.slice(0, half)],
  ['second half', rows.slice(half)],
] as const) {
  const c = v.reduce((s, r) => s + r.costUsd, 0);
  const f = v.filter((r) => r.costUsd === 0).length;
  console.log(
    `${label}  n=${num(v.length, 3)}  free=${num(Math.round((100 * f) / v.length) + '%', 4)}  spent=${num(usd(c), 8)}  mean=${num(usd(c / v.length), 7)}`,
  );
}

/**
 * The metric that can actually show the crew getting cheaper.
 *
 * Mean cost per job cannot: it is dominated by novel work and by compiles, so
 * it rises whenever the cheap tiers take the easy jobs and leave the paid half
 * with the hard ones. Measured 2026-08-01, free share went 18% → 30% while the
 * mean nearly doubled, and both were true.
 *
 * So compare a class against itself — first time this kind of job was done,
 * against every time since. That is the number the recipe and tool tiers exist
 * to move.
 */
console.log('\n## Repeat work — two step-downs, not a curve\n');
const keys = promptKeys();
/** The recipe a row belongs to: what it recorded, else what its job asked. */
const keyOf = (r: { recipeKey?: string; jobId: string }): string | undefined =>
  r.recipeKey ?? keys.get(r.jobId);
const byKey = new Map<string, typeof rows>();
let ungrouped = 0;
for (const r of rows) {
  /**
   * A compile is not work anybody asked for twice.
   *
   * It goes through the same queue and carries a prompt like everything else,
   * so grouping by prompt collected the compile *brief* — "The crew has done
   * this job enough times to stop paying for it…" — into a row reading like a
   * job run twice. Nothing downstream depended on it, and it made the section
   * claim a repeat that never happened, which is the one thing a report about
   * repeats must not do. Excluded rather than counted as ungrouped: its job
   * record is right there, it simply is not this section's subject.
   */
  if (r.compile) continue;
  const key = keyOf(r);
  if (!key) {
    if (r.costUsd > 0) ungrouped++;
    continue;
  }
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key)!.push(r);
}
const repeated = [...byKey.entries()].filter(([, v]) => v.length >= 2);
/** One letter per tier, so the step down is visible in the trail itself. */
const mark = (tier: string) => ({ session: 'S', oneshot: '1', tool: 'T', routed: 'R' })[tier] ?? '?';
if (!repeated.length) {
  console.log('no job has been run twice yet — nothing to compare.');
} else {
  console.log('Each job, run by run.  S = full session, 1 = one-shot leash, T = compiled tool\n');
  for (const [key, v] of repeated.sort((a, b) => b[1].length - a[1].length)) {
    const trail = v.map((r) => `${usd(r.costUsd)}(${mark(r.tier)})`).join(' → ');
    console.log(`  ${num(v.length, 2)} runs  ${key.slice(0, 38).padEnd(38)}  ${trail}`);
  }
  console.log('\nA recipe does not make a job cheaper by degrees. It cuts the price once,');
  console.log('by moving the job down a tier, and then holds it there.');
  if (ungrouped) {
    console.log(
      `\n(${ungrouped} paid rows could not be grouped — their job record is gone, so which job they were is unknowable.)`,
    );
  }

  /**
   * The step down measured *within* a job rather than across the population.
   *
   * The headline below compares two whole tiers, which mixes roles and shapes
   * — D-042 measured one job at 7.86c as a session and 8.04c on the leash, so
   * the population figure is not a promise about any particular job. This only
   * counts jobs seen on both tiers, and says how few that is.
   */
  const bothTiers = repeated
    .map(([key, v]) => ({
      key,
      s: v.filter((r) => r.tier === 'session' && r.costUsd > 0).map((r) => r.costUsd),
      o: v.filter((r) => r.tier === 'oneshot' && r.costUsd > 0).map((r) => r.costUsd),
    }))
    .filter((g) => g.s.length > 0 && g.o.length > 0);
  if (bothTiers.length) {
    const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    console.log(`\nSame job on both tiers — ${bothTiers.length} of ${repeated.length}:`);
    for (const g of bothTiers) {
      const cut = Math.round((100 * (avg(g.s) - avg(g.o))) / avg(g.s));
      console.log(
        `  ${g.key.slice(0, 38).padEnd(38)}  session ${usd(avg(g.s))} → leash ${usd(avg(g.o))}  ${cut > 0 ? `${cut}% off` : `${-cut}% dearer`}`,
      );
    }
    console.log('This is the honest per-job version of step 1 below. Read the sample size.');
  }
}

const meanOf = (v: LedgerEntry[]) => (v.length ? v.reduce((s, r) => s + r.costUsd, 0) / v.length : 0);
const sessionMean = meanOf(rows.filter((r) => r.tier === 'session' && r.costUsd > 0));
const oneshotMean = meanOf(rows.filter((r) => r.tier === 'oneshot' && r.costUsd > 0));
if (sessionMean > 0 && oneshotMean > 0) {
  console.log(
    `\nstep 1  session ${usd(sessionMean)} → one-shot ${usd(oneshotMean)}   ${Math.round((100 * (sessionMean - oneshotMean)) / sessionMean)}% off, when a recipe matches strongly`,
  );
  console.log(`step 2  one-shot ${usd(oneshotMean)} → tool free            100% off, when it compiles`);
}

/**
 * What the ladder has saved, as a counterfactual: every job that ran free or
 * on a leash, priced at what a session of that era cost. It is an estimate and
 * says so — the assumption is that each would otherwise have been an ordinary
 * session, which is what the router's own fall-through would have made it.
 */
console.log('\n## Avoided cost (counterfactual)\n');
if (sessionMean > 0) {
  const cheap = rows.filter((r) => r.tier === 'oneshot' && r.costUsd > 0).length;
  const gratis = rows.filter((r) => r.tier === 'routed' || r.tier === 'tool').length;
  const saved = cheap * (sessionMean - oneshotMean) + gratis * sessionMean;
  console.log(`${cheap} one-shot runs saved ~${usd(cheap * (sessionMean - oneshotMean))}`);
  console.log(`${gratis} free runs saved    ~${usd(gratis * sessionMean)}`);
  console.log(`total avoided       ~${usd(saved)}   against ${usd(cost)} actually spent`);
  console.log('\nAssumes each would otherwise have run as an ordinary session, which is');
  console.log('what the router would have done with it. Treat as an order of magnitude.');
}

/**
 * LLM calls by trade — the success metric the 2026-08-21 brief set (D-211):
 * a measurable fall in model calls on repeated document, research and
 * drawing work once the library fills.
 *
 * A "model run" is a row on a paid tier: every session or leash is one call
 * to the API that a routed answer or a compiled tool would have avoided.
 * Counted per class because the admin trades — scribe and designer for
 * documents, researcher and scout, architect and drafter for drawings,
 * analyst for numbers — are where that fall is expected, and across the same
 * halves the Trend section uses so the two columns compare across classes.
 * A class with nothing in a half prints a dash rather than a zero: no traffic
 * is not a rate. Read the sample sizes; a trade with five rows has no trend.
 */
console.log('\n## LLM calls by trade — model runs against free ones\n');
console.log(
  `${pad('trade', 12)}${num('runs', 6)}${num('model', 7)}${num('free', 6)}${num('free%', 7)}   first half → second half (free share)`,
);
const byClass = new Map<string, typeof rows>();
for (const r of rows) {
  const cls = r.jobClass ?? '(none)';
  if (!byClass.has(cls)) byClass.set(cls, []);
  byClass.get(cls)!.push(r);
}
const isFree = (r: LedgerEntry) => r.tier === 'routed' || r.tier === 'tool';
const freeShare = (v: LedgerEntry[]) => (v.length ? `${Math.round((100 * v.filter(isFree).length) / v.length)}%` : '—');
const cutAt = rows[half]?.at ?? Infinity;
for (const [cls, v] of [...byClass.entries()].sort((a, b2) => b2[1].length - a[1].length)) {
  const free = v.filter(isFree).length;
  console.log(
    `${pad(cls, 12)}${num(v.length, 6)}${num(v.length - free, 7)}${num(free, 6)}${num(freeShare(v), 7)}   ${freeShare(v.filter((r) => r.at < cutAt))} → ${freeShare(v.filter((r) => r.at >= cutAt))}`,
  );
}

/**
 * How many sandboxes carry a trajectory (D-211): the coverage of the
 * instrument the promotion loop will read, visible from the day it starts
 * rather than assumed — a file nobody counts is a file nobody notices has
 * stopped being written. Older runs cannot be given one.
 */
let sandboxes = 0;
let trails = 0;
// D-212's instrument: how often the SDK compacted a context, and in how many
// runs — the one candidate for a leash that does not bind, counted here so
// the answer is visible without opening a trail.
let compactions = 0;
let compactedRuns = 0;
for (const level of existsSync(LEVELS) ? readdirSync(LEVELS) : []) {
  const jobs = path.join(LEVELS, level, 'jobs');
  if (!existsSync(jobs)) continue;
  for (const id of readdirSync(jobs)) {
    sandboxes++;
    const trail = path.join(jobs, id, TRAJECTORY_FILE);
    if (!existsSync(trail)) continue;
    trails++;
    const seen = readFileSync(trail, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('"kind":"compact"')).length;
    if (seen > 0) {
      compactions += seen;
      compactedRuns++;
    }
  }
}
console.log(
  `\ntrajectories on disk: ${trails} of ${sandboxes} sandboxes carry ${TRAJECTORY_FILE} (recording began with D-211)` +
    `\ncompactions seen: ${compactions} in ${compactedRuns} of those runs (D-212's instrument; 0 until the server restarts with it)`,
);

/**
 * The absorbed headline, split by cause.
 *
 * "45% absorbed" cannot drive a decision until it says whether the money went
 * on tuition (compiles and discovery, absorbed by design), on walls (runs cut
 * at their own budget), or on honest failure. Buckets use ledger-only signals,
 * first match wins. The wall marker is the runner's own record shape: a failed
 * run cut at max-turns reports exactly `turnsAllowed + 1` (carried, never
 * inferred — D-066), and only *failed* rows may use it, because on finished
 * rows the same inference is known-wrong on 7 of 43 (D-052).
 *
 * The section proves itself before it prints: buckets that do not sum to
 * `totals()`'s own absorbedUsd, plus clip slices reconciling to spent minus
 * chargeable, exit non-zero — a report about money that disagrees with the
 * shared arithmetic must fail loudly, not print two truths (D-021, D-030).
 */
console.log('\n## Absorbed, bucketed\n');
const fullAbs = rows.filter((r) => r.priceUsd === 0 && r.costUsd > 0);
const bucketOf = (r: LedgerEntry): string => {
  if (r.compile) return 'compiles (tuition by design — D-096)';
  if (r.toolFellBack) return 'tool fall-backs (promised free)';
  if (r.outcome === 'failed' && (r.turnsAllowed ?? 0) > 0 && r.turns === (r.turnsAllowed ?? 0) + 1)
    return 'cut at the turn wall';
  if (r.outcome === 'failed') return 'failed inside its budget';
  return 'done at price zero (free-quoted or unpriced)';
};
const buckets = new Map<string, { n: number; usd: number }>();
for (const r of fullAbs) {
  const b = buckets.get(bucketOf(r)) ?? { n: 0, usd: 0 };
  b.n += 1;
  b.usd += r.costUsd;
  buckets.set(bucketOf(r), b);
}
const fullSum = fullAbs.reduce((s, r) => s + r.costUsd, 0);
for (const [name, b] of [...buckets.entries()].sort((a, b2) => b2[1].usd - a[1].usd)) {
  console.log(
    `${num(b.n, 4)} rows  ${num(usd(b.usd), 8)}  ${num(Math.round((100 * b.usd) / fullSum) + '%', 4)}  ${name}`,
  );
}
const clip = rows.filter((r) => r.priceUsd > 0 && r.costUsd > r.priceUsd);
const clipSum = clip.reduce((s, r) => s + r.costUsd - r.priceUsd, 0);
const chainClipped = clip.filter((r) => r.chainPriced);
console.log(
  `${num(clip.length, 4)} rows  ${num(usd(clipSum), 8)}       over-quote overruns clipped to the quote` +
    (chainClipped.length ? ` (${chainClipped.length} of them chain legs repriced at promote)` : ''),
);
if (Math.abs(fullSum - absorbed) > 0.005 || Math.abs(fullSum + clipSum - (cost - price)) > 0.005) {
  console.error(
    `\nRECONCILIATION FAILED: buckets ${usd(fullSum)} + clips ${usd(clipSum)} != spent − chargeable ${usd(cost - price)} (absorbed ${usd(absorbed)})`,
  );
  process.exit(1);
}
console.log(
  `\nreconciles: ${usd(fullSum)} bucketed + ${usd(clipSum)} clipped = ${usd(cost - price)} spent-never-charged, matching totals()`,
);

/**
 * Which recipes the compile gate would take today, by the gate's own criteria:
 * `successes` at the bar promotion refuses under (D-021), no usable tool
 * already answering the key, and `compileBlockers` — the same function the
 * route calls (D-100), fed the same connections file — saying nothing the
 * method used stops a plain-node script. A scheduled key recurs by standing
 * instruction, so its payback never stops arriving; measured compiles cost
 * $0.94–$1.32 (D-025, D-029), which is the payback arithmetic printed.
 */
console.log('\n## Compile candidates — by the gate\'s own criteria\n');
const connections = readConnections(CONNECTIONS);
if (!connections.length) {
  console.error(
    `\nNO CONNECTIONS read from ${CONNECTIONS} — an empty list silently voids the gate` +
      ' (every usedTools recipe passes vacuously, every capabilities-path recipe blocks' +
      ' with no ambient subtracted). Fix the path; nothing below this line can be trusted.',
  );
  process.exit(1);
}
type Candidate = {
  level: string;
  key: string;
  successes: number;
  blockers: string[];
  paid: number;
  mean: number;
  scheduled: boolean;
};
const candidates: Candidate[] = [];
for (const level of existsSync(LEVELS) ? readdirSync(LEVELS) : []) {
  const dir = path.join(LEVELS, level);
  const tooled = new Set(usableTools(dir).map((t) => t.recipeKey));
  const schedFile = path.join(dir, 'schedules.json');
  const scheduled = new Set<string>(
    existsSync(schedFile)
      ? JSON.parse(readFileSync(schedFile, 'utf8')).map((s: { prompt: string }) => normalise(s.prompt))
      : [],
  );
  for (const recipe of readRecipes(dir)) {
    if ((recipe.successes ?? 0) < TOOL_CANDIDATE_RUNS) continue;
    if (tooled.has(recipe.key)) continue;
    const runs = (byKey.get(recipe.key) ?? []).filter((r) => r.levelId === level && r.costUsd > 0);
    candidates.push({
      level,
      key: recipe.key,
      successes: recipe.successes ?? 0,
      blockers: compileBlockers(recipe, connections),
      paid: runs.length,
      mean: runs.length ? runs.reduce((s, r) => s + r.costUsd, 0) / runs.length : 0,
      scheduled: scheduled.has(recipe.key),
    });
  }
}
if (!candidates.length) {
  console.log('none — no recipe both reaches the success bar and lacks a tool.');
} else {
  candidates.sort(
    (a, b2) =>
      Number(a.blockers.length > 0) - Number(b2.blockers.length > 0) ||
      Number(b2.scheduled) - Number(a.scheduled) ||
      b2.mean * b2.paid - a.mean * a.paid,
  );
  for (const c of candidates) {
    const verdict = c.blockers.length
      ? `blocked: used ${c.blockers.join(' and ')}`
      : `compilable${c.mean > 0 ? ` — pays back in ~${Math.max(1, Math.ceil(1.1 / c.mean))} runs at ${usd(c.mean)}/run` : ''}`;
    console.log(
      `  ${pad(c.level, 16)} ${c.key.slice(0, 38).padEnd(38)} successes ${c.successes}${c.scheduled ? ' · SCHEDULED' : ''} · ${verdict}`,
    );
  }
}

/**
 * D-050's own gate question, answered by counting rather than by principle.
 *
 * Tool graduation across levels was deferred on "one genuine repeat in 36
 * jobs, two working tools, one active level". The design already exists; what
 * it waits for is a job independently earned in two levels. Counted both ways
 * it could be true: the same normalised sentence paid for in two levels on the
 * ledger, and the same recipe key present in two levels' recipes.json.
 */
console.log("\n## Cross-level repeats — D-050's gate question\n");
const ledgerSpan = [...byKey.entries()]
  .map(([k, v]) => ({ k, levels: [...new Set(v.filter((r) => r.costUsd > 0).map((r) => r.levelId))] }))
  .filter((g) => g.levels.length >= 2);
const keyLevels = new Map<string, string[]>();
for (const level of existsSync(LEVELS) ? readdirSync(LEVELS) : []) {
  for (const recipe of readRecipes(path.join(LEVELS, level))) {
    keyLevels.set(recipe.key, [...(keyLevels.get(recipe.key) ?? []), level]);
  }
}
const recipeSpan = [...keyLevels.entries()].filter(([, v]) => v.length >= 2);
console.log(`same sentence paid for in ≥2 levels (ledger):   ${ledgerSpan.length}`);
for (const g of ledgerSpan) console.log(`    ${g.k.slice(0, 44).padEnd(44)} ${g.levels.join(', ')}`);
console.log(`same recipe key stored in ≥2 levels (recipes):  ${recipeSpan.length}`);
for (const [k, v] of recipeSpan) console.log(`    ${k.slice(0, 44).padEnd(44)} ${v.join(', ')}`);
if (!ledgerSpan.length && !recipeSpan.length) {
  console.log('\nzero — cross-level graduation (D-050 stages 1–3) waits until this number moves.');
}

/**
 * Rows that paid the repo tax, split by whether the clone left an artifact.
 *
 * A clone multiplies the per-turn rate (the By-tier line above prints both
 * rates). The artifact is DIFF.patch at the sandbox root, which survives the
 * sweep (D-121 spot-checked the kept side byte-identical). No artifact does
 * NOT prove waste — a survey reads the clone and writes elsewhere — so the
 * figure is an upper bound and a reading list, not a verdict: identification
 * before any router change, never a guess (D-053 is the case this asks about).
 */
console.log('\n## Clone use — rows that paid the repo tax\n');
const repoRows = rows.filter(
  (r) => r.hasRepo && r.costUsd > 0 && (r.tier === 'session' || r.tier === 'oneshot'),
);
let touched = 0;
let gone = 0;
const untouched: typeof rows = [];
for (const r of repoRows) {
  const sandbox = path.join(LEVELS, r.levelId, 'jobs', r.jobId);
  if (!existsSync(sandbox)) {
    gone++;
  } else if (existsSync(path.join(sandbox, 'DIFF.patch'))) {
    touched++;
  } else {
    untouched.push(r);
  }
}
const untouchedCost = untouched.reduce((s, r) => s + r.costUsd, 0);
const noRepoRate = perTurn(rows, 'session', false);
console.log(
  `${repoRows.length} paid rows carried a clone: ${touched} left a DIFF.patch, ${untouched.length} left none, ${gone} sandboxes gone (unknowable)`,
);
if (untouched.length) {
  const counterfactual = noRepoRate
    ? untouched.reduce((s, r) => s + (r.turnsAllowed ?? 0) * noRepoRate.usd, 0)
    : null;
  console.log(
    `no-artifact rows cost ${usd(untouchedCost)}` +
      (counterfactual !== null
        ? `; at the no-repo session rate the same grants cost ~${usd(counterfactual)}`
        : ''),
  );
  console.log(
    'an upper bound on the clone tax, not a verdict — read those jobs before touching the router.',
  );
}

console.log(
  `\n${rows.length} jobs over ${span[0]}–${span[1]} is a small and mostly synthetic sample —`,
);
console.log('most were queued to exercise a mechanism rather than to get work done.');
