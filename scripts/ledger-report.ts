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
import { normalise } from '../server/src/recipes';

const LEDGER = path.join(process.cwd(), '.agentlings', 'ledger.jsonl');
const LEVELS = path.join(process.cwd(), '.agentlings', 'levels');

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
    .sort((a, b) => a.at - b.at);
}

const usd = (n) => (n < 1 ? `${(n * 100).toFixed(1)}c` : `$${n.toFixed(2)}`);
const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

/**
 * What one *granted* turn cost, narrowed to a shape. Same unit as ledger.ts:
 * turnsAllowed, never the SDK's reported turns, and failures count — a session
 * that died still burnt its turns at a real rate.
 */
function perTurn(rows, tier, hasRepo) {
  const v = rows.filter(
    (r) => r.tier === tier && r.hasRepo === hasRepo && r.costUsd > 0 && (r.turnsAllowed ?? 0) > 0,
  );
  if (!v.length) return null;
  const cost = v.reduce((s, r) => s + r.costUsd, 0);
  const turns = v.reduce((s, r) => s + r.turnsAllowed, 0);
  return { n: v.length, usd: cost / turns };
}

const rows = read();
if (!rows.length) {
  console.error('ledger is empty');
  process.exit(1);
}

const span = [rows[0], rows.at(-1)].map((r) => new Date(r.at).toISOString().slice(0, 10));
console.log(`# Ledger report — ${rows.length} jobs, ${span[0]} to ${span[1]}\n`);

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
const cost = rows.reduce((s, r) => s + r.costUsd, 0);
const price = rows.reduce((s, r) => s + r.priceUsd, 0);
const absorbed = rows
  .filter((r) => r.outcome === 'failed')
  .reduce((s, r) => s + r.costUsd, 0);
const free = rows.filter((r) => r.costUsd === 0).length;
console.log(`spent        ${usd(cost)}`);
console.log(`chargeable   ${usd(price)}`);
console.log(
  `absorbed     ${usd(absorbed)}  (${Math.round((100 * absorbed) / cost)}% of spend — failed work is never billed)`,
);
console.log(`free jobs    ${free} of ${rows.length}  (${Math.round((100 * free) / rows.length)}%)`);
const unmeasured = rows.filter((r) => r.costUnknown).length;
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
]) {
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

const meanOf = (v) => (v.length ? v.reduce((s, r) => s + r.costUsd, 0) / v.length : 0);
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

console.log(
  `\n${rows.length} jobs over ${span[0]}–${span[1]} is a small and mostly synthetic sample —`,
);
console.log('most were queued to exercise a mechanism rather than to get work done.');
