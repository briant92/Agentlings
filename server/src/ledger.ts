import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { JobMeter } from '@agentlings/shared';

/**
 * Append-only record of what work cost and what it would be charged for.
 *
 * Cost and price are separate numbers even though they are equal today: a
 * ledger cannot be reconstructed retroactively, so the shape that supports
 * quoting, absorbing failures and any future markup has to exist from the
 * first entry or the history is worthless.
 */

/**
 * `tool` is free like `routed`, but kept apart from it: routed work was never
 * paid for, whereas a tool is work that *used* to be paid for and no longer
 * is. Only the second one says the crew is getting cheaper.
 */
export type Tier = 'routed' | 'tool' | 'oneshot' | 'session';

export interface LedgerEntry {
  at: number;
  jobId: string;
  levelId: string;
  /**
   * The role that actually ran the work. What a *turn* is priced by, since
   * the prompt, tools and cap that decide a turn's cost are the role's.
   *
   * Was documented as "a recipe key, or the role" and has only ever held the
   * role — the two diverged when this was fixed to record the runner rather
   * than the role the matcher named. `recipeKey` below closes the gap that
   * left.
   */
  jobClass: string;
  /**
   * Who actually ran it.
   *
   * The role above answers "what does a turn of this cost"; it cannot answer
   * "who is spending". Both questions look the same until two agentlings hold
   * the same role, and then the second has no answer at all — which is how the
   * crew's spending came to be read off the queue file instead, a source that
   * keeps only the jobs still in it and was already missing 12 of this level's
   * 95 runs.
   *
   * Absent on rows written before this existed, and on the 17 whose job record
   * has since gone: the backfill matched rows to jobs by id, and a row it could
   * not identify was left blank rather than attributed to the likeliest name.
   * `LevelProductivity.unattributed` reports what that leaves unaccounted for.
   */
  agentlingId?: string;
  /**
   * The recipe a one-shot was a repeat of. What a *quote* is looked up by on
   * that tier, because "done this 7 times before" means this job, not this
   * role.
   *
   * Absent on every other tier, where the role is the finest class there is.
   */
  recipeKey?: string;
  /**
   * The run compiled a recipe into a tool.
   *
   * Recorded, and deliberately not yet read. A compile is its own kind of work
   * and plausibly its own price, but measured across four of them the rate is
   * 9.0c a turn against the 8.3c pooled scribe-with-a-repo rate the quote
   * actually uses — 8%, on four samples, with the turn budget capped by
   * `COMPILE_TURNS` either way and no compile having ever breached its quote.
   * Pricing on that would be tuning on noise, and an earlier claim that the
   * gap was a third came from comparing one bad compile against the pool
   * rather than the compiles against it.
   *
   * It is kept anyway because the two directions are not symmetrical: a rate
   * can be computed from a ledger whenever there is finally enough of it, and
   * a ledger cannot be given a field it never wrote.
   */
  compile?: boolean;
  tier: Tier;
  outcome: 'done' | 'failed';
  /** What it actually cost us, from the SDK. Includes `closeOutUsd`. */
  costUsd: number;
  /**
   * The part of `costUsd` spent by the close-out pass rather than by the
   * session.
   *
   * Kept separate so `costPerTurn` can price the session alone: the write-up
   * is a fixed errand on a cheap model, not something the turn budget can buy
   * more or less of, so charging it to the session's turns makes every turn
   * look dearer than it is and grants fewer of them.
   *
   * It was declared on `JobMeter` and on no ledger row for 79 jobs, because
   * the row builder simply did not copy it (D-039). Rows written before the
   * fix carry it only where a persisted job still held the split and the
   * backfill could match it by id.
   */
  closeOutUsd?: number;
  /**
   * The run spent money we could not measure. A killed session never reaches
   * the result message the SDK reports cost on, so its spend is real and
   * unknowable — recorded as a gap rather than as a zero, which would quietly
   * understate the ledger.
   */
  costUnknown?: boolean;
  /**
   * The session has started and nothing has closed it out yet.
   *
   * Written the moment a run begins, before anything about it is known, and
   * replaced by the real row when the run finishes — so a process that dies
   * under a session leaves this instead of nothing. Thirteen runs vanished
   * that way (42e320d0 and 31d0c24b the two that were noticed): the only
   * write was the completion callback, which a killed server never reaches,
   * so the job store marked them INTERRUPTED at the next start and the
   * ledger never heard (D-199). An open row is this file's own business —
   * `readLedger` hides it, because a run that has not finished is not yet a
   * cost — and `closeOpenRows` turns every one still open at startup into an
   * `interrupted` row: a fresh process has no session running, which is the
   * same fact the job store's restore relies on.
   */
  open?: boolean;
  /**
   * The run died with the process running it and no close-out ever reached
   * the ledger: cost unknowable (`costUnknown`), turns and tools unrecorded,
   * `at` the time it started — the only time it has. Closed from an open row
   * at the next startup, or backfilled by identification from the job
   * store's INTERRUPTED mark (D-199).
   */
  interrupted?: boolean;
  /**
   * A compiled tool claimed this job, could not deliver, and a session did it
   * instead. The user was quoted nothing on the strength of that tool, so the
   * run is absorbed.
   *
   * Recorded because the ledger could not otherwise answer how often the
   * fourth tier claims work it cannot finish — the question that decides
   * whether the tier earns its keep. It was on `JobMeter` and on no row, so
   * the two fall-backs on record could only be found by reading job files:
   * the same gap as `closeOutUsd` (D-039), in the same builder.
   */
  toolFellBack?: boolean;
  /** What the user would be charged. Zero for failures: the app absorbs those. */
  priceUsd: number;
  /**
   * This row's price was set after the fact, when the chain it fed promoted
   * (D-150). A cut leg files as a failure priced zero — "charged only if it
   * finishes" — but a chain of cut legs whose END promotes finished by any
   * honest reading, and twice it delivered an installed world for $0 (the
   * Iliad $9.29, the Odyssey $6.22). The marker is the idempotency guard —
   * a second Approve reprices nothing — and the row's own explanation for
   * why a failed outcome carries a price.
   */
  chainPriced?: boolean;
  /** The ceiling quoted before the work, when there was one. */
  quotedUsd?: number;
  turns?: number;
  /** The turn limit the session was given — the unit a budget is priced in. */
  turnsAllowed?: number;
  /**
   * Whether the run had a repository to work in. Not bookkeeping: measured
   * 2026-07-31, it is the largest single thing driving what a turn costs — a
   * repo run burnt 7.4c/turn against 1.8c for the same role without one,
   * because the clone puts hundreds of thousands of cached tokens in front of
   * every turn. A rate averaged across both shapes predicts neither.
   */
  hasRepo?: boolean;
  model?: string;
  /**
   * Whether this paid run was a question, and how many of the level's own
   * notes bore on it. Written on sessions and one-shots; absent on the free
   * tiers, where the router has already said what the job was.
   *
   * Recorded and deliberately not read, exactly like `compile` above. The
   * question they exist to answer is D-046's: a level can answer for free only
   * about work it has already done, and nothing in this ledger says how much
   * paid traffic was a question the crew's own material could have covered. So
   * the size of that prize is currently unknown, and a knowledge store cannot
   * be priced before it is built.
   *
   * Two raw facts rather than one verdict, because the bar is the part nobody
   * can place yet — `recallable: 0` on an asked question is the interesting
   * case (nothing on file), and so is a high count (on file, still paid for),
   * and which of those matters depends on data that does not exist. Deciding
   * "recall-only" at write time would bake in a guess and lose the rest;
   * storing both leaves it a query.
   *
   * `asked` understates: it needs a question mark or a leading wh-word, so
   * "do we have a deploy doc" is missed. Better that than counting "do the
   * dishes" as a question — an undercount is a floor, an overcount is a story.
   */
  asked?: boolean;
  recallable?: number;
  /**
   * How many tool calls the session made, and which one it made last.
   *
   * Recorded and deliberately not read, the same bargain as `compile` and
   * `asked`. The question they exist for is what a turn budget is actually
   * spent on — and specifically whether a run that hits its cap ran out doing
   * the work or ran out checking it, since the second would be an argument for
   * moving verification off the session's turns the way D-020 moved the
   * write-up, and the first would be an argument for nothing.
   *
   * Nothing could answer that before. The ledger carried `turns` and `cost`,
   * and the per-tool-call `progress` events lived only in memory and died with
   * the process, so the shape of a run was unrecoverable the moment it ended.
   * A claim was made on the strength of that gap and was wrong (D-052).
   *
   * `lastTool` is the sharper of the two: a run stopping on `Bash` was checking
   * something, one stopping on `Write` or `Edit` was still producing. Neither
   * is proof on its own — a `Bash` call can be `ls` as easily as `npm test` —
   * so this is evidence to be counted over many runs, not read off one.
   */
  toolCalls?: number;
  lastTool?: string;
}

/**
 * The row a finished job becomes.
 *
 * Lived inline in the server's completion callback, where nothing could reach
 * it without binding a port — and it is the one function in this app with a
 * proven habit of dropping fields silently. `closeOutUsd` was set on the meter
 * and copied here for 79 jobs; `toolFellBack` for two more; both were declared
 * on the type, written by the executor, documented in the spec, and lost in
 * exactly these lines (D-039). Pulled out so a test can watch it rather than a
 * reader, which is the only difference between those two bugs shipping and not.
 *
 * Pure and mechanical: same expression, same order, same conditionals.
 */
export function ledgerRow(
  job: {
    id: string;
    meter?: JobMeter;
    quotedUsd?: number;
    repoPath?: string;
    compile?: boolean;
    /** Who picked it up. The row's author, and the only record of one. */
    assignedTo?: string;
  },
  levelId: string,
  /** The role that actually ran it, not the one the matcher named. */
  role: string,
  outcome: 'done' | 'failed',
  at: number,
): LedgerEntry {
  const costUsd = job.meter?.costUsd ?? 0;
  return {
    at,
    jobId: job.id,
    levelId,
    // The role that did the work, not the one the matcher asked for. A job
    // routed to a role nobody holds is picked up by whoever is free, and the
    // session runs as *their* role — filing it under the absent specialist
    // would build a history for work that never happened, and rob the role
    // that really did it of its own.
    jobClass: role,
    // Taken from the job rather than passed in beside the role: the two must
    // agree, and the one place they cannot disagree is the job that records
    // both. Gated on presence — an absent author means the row predates the
    // field or its job was never assigned, never that nobody ran it.
    ...(job.assignedTo ? { agentlingId: job.assignedTo } : {}),
    // Which recipe this repeated, when it repeated one. Priced per turn by the
    // role above; quoted by this. A one-shot's quote asks "have we done this
    // job before", and the role cannot answer that.
    ...(job.meter?.recipeKey ? { recipeKey: job.meter.recipeKey } : {}),
    ...(job.compile ? { compile: true } : {}),
    tier: job.meter?.tooled
      ? 'tool'
      : job.meter?.routed
        ? 'routed'
        : job.meter?.oneShot
          ? 'oneshot'
          : 'session',
    outcome,
    costUsd,
    // Part of costUsd, and recorded apart from it so the per-turn rate can
    // price the session rather than the session plus a fixed errand.
    ...(job.meter?.closeOutUsd ? { closeOutUsd: job.meter.closeOutUsd } : {}),
    // A job quoted free because a tool would do it is never billed when the
    // tool turned out not to.
    priceUsd: priceFor(outcome, costUsd, job.meter?.toolFellBack ? 0 : job.quotedUsd),
    ...(job.meter?.toolFellBack ? { toolFellBack: true } : {}),
    ...(job.quotedUsd ? { quotedUsd: job.quotedUsd } : {}),
    ...(job.meter?.turns !== undefined ? { turns: job.meter.turns } : {}),
    ...(job.meter?.turnsAllowed !== undefined ? { turnsAllowed: job.meter.turnsAllowed } : {}),
    hasRepo: Boolean(job.repoPath),
    ...(job.meter?.costUnknown ? { costUnknown: true } : {}),
    ...(job.meter?.model ? { model: job.meter.model } : {}),
    // Gated on presence, never on truth: `asked: false` and `recallable: 0`
    // are both answers, and the second is the interesting one — a question
    // with nothing on file is precisely the run a knowledge store would have
    // served. Writing these only when truthy would keep the boring half and
    // drop the half D-046 is asking about, and the absent field is already
    // doing a job here: it means the row predates the measurement, not that
    // the run was not a question.
    ...(job.meter?.asked !== undefined ? { asked: job.meter.asked } : {}),
    ...(job.meter?.recallable !== undefined ? { recallable: job.meter.recallable } : {}),
    // Presence, not truth, for the same reason as above: `toolCalls: 0` is an
    // answer — a session that called nothing — and an absent field means the
    // row was written before anyone was counting.
    ...(job.meter?.toolCalls !== undefined ? { toolCalls: job.meter.toolCalls } : {}),
    ...(job.meter?.lastTool ? { lastTool: job.meter.lastTool } : {}),
  };
}

/**
 * The row a session opens with: `ledgerRow` with nothing yet known — cost
 * zero and unknown, failed until proven otherwise, priced nothing. Built by
 * the same function as the final row so the two cannot drift on the fields
 * they share (the D-039 lesson), and replaced by that row in `finalize`.
 */
export function openRow(
  job: Parameters<typeof ledgerRow>[0],
  levelId: string,
  role: string,
  at: number,
): LedgerEntry {
  return { ...ledgerRow(job, levelId, role, 'failed', at), costUnknown: true, open: true };
}

/**
 * What an open row becomes when the process dies under it — the same row,
 * closed. `closeOpenRows` derives it from the row on disk; the backfill
 * builds it from the job record.
 */
export function interruptedRow(
  job: Parameters<typeof ledgerRow>[0],
  levelId: string,
  role: string,
  at: number,
): LedgerEntry {
  return { ...ledgerRow(job, levelId, role, 'failed', at), costUnknown: true, interrupted: true };
}

export function ledgerFile(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'ledger.jsonl');
}

export function append(sandboxRoot: string, entry: LedgerEntry): void {
  mkdirSync(sandboxRoot, { recursive: true });
  appendFileSync(ledgerFile(sandboxRoot), `${JSON.stringify(entry)}\n`);
}

/** Every row on disk, open ones included. For the rewriters below only. */
function readRows(sandboxRoot: string): LedgerEntry[] {
  const file = ledgerFile(sandboxRoot);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LedgerEntry];
      } catch {
        return []; // a torn last line must not lose the rest of the history
      }
    });
}

/**
 * The finished runs. An open row is a session still running in this
 * process — or one that died under a process not yet restarted — and either
 * way not yet a cost: a reader that counted it would report a run in flight
 * as "stopped mid-run, cost unknown" for as long as it ran.
 */
export function readLedger(sandboxRoot: string): LedgerEntry[] {
  return readRows(sandboxRoot).filter((entry) => !entry.open);
}

/**
 * Whole-file rewrite through a sibling and a rename, because a torn ledger
 * is worse than any bug a rewrite fixes.
 */
function rewrite(sandboxRoot: string, rows: readonly LedgerEntry[]): void {
  const file = ledgerFile(sandboxRoot);
  const sibling = `${file}.rewriting`;
  writeFileSync(sibling, rows.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  renameSync(sibling, file);
}

/**
 * Closes a run out: its open row goes and the real row is appended, so the
 * file reads exactly as it would have with no open row at all — one row a
 * job, in the order runs finished. A run that never opened one (nothing was
 * in flight when this landed) is simply appended.
 */
export function finalize(sandboxRoot: string, entry: LedgerEntry): void {
  const rows = readRows(sandboxRoot);
  const kept = rows.filter((row) => !(row.open && row.jobId === entry.jobId));
  if (kept.length === rows.length) {
    append(sandboxRoot, entry);
    return;
  }
  rewrite(sandboxRoot, [...kept, entry]);
}

/**
 * Every row still open when a process starts is a death — a fresh process
 * has no session running, the same fact `JobQueue.restore` marks running
 * jobs INTERRUPTED on — so each becomes an `interrupted` row, cost unknown,
 * `at` left as the start it recorded. Returns how many it closed; nothing is
 * written when there were none.
 *
 * The cap the run was granted is not recovered here: it lives in the
 * sandbox's `.session.json`, and a row with no cost prices no turns.
 */
export function closeOpenRows(sandboxRoot: string): number {
  const rows = readRows(sandboxRoot);
  const open = rows.filter((row) => row.open).length;
  if (open === 0) return 0;
  rewrite(
    sandboxRoot,
    rows.map(({ open: wasOpen, ...rest }) => (wasOpen ? { ...rest, interrupted: true } : rest)),
  );
  return open;
}

/**
 * The price for a job. Failures are absorbed — only work that landed is
 * charged — and nothing is ever charged above what was quoted.
 */
export function priceFor(
  outcome: 'done' | 'failed',
  costUsd: number,
  quotedUsd?: number,
): number {
  if (outcome === 'failed') return 0;
  if (typeof quotedUsd === 'number') return Math.min(costUsd, quotedUsd);
  return costUsd;
}

/**
 * Prices a promoted chain's cut legs, after the fact (D-150, D-141's
 * recorded fix). Each named row that is still an unpriced failure gets
 * `min(cost, its own quote)` — never above what that leg was quoted (D-012)
 * — and the `chainPriced` marker, which is also what makes a second Approve
 * reprice nothing. Rows whose spend was unmeasurable stay absorbed: a price
 * on an unknown cost would be an invention.
 *
 * The whole file is rewritten through a sibling-and-rename, because a torn
 * ledger is worse than any bug this fixes.
 */
export function repriceChain(
  sandboxRoot: string,
  jobIds: readonly string[],
): { rows: number; chargedUsd: number } {
  if (jobIds.length === 0) return { rows: 0, chargedUsd: 0 };
  const ids = new Set(jobIds);
  const entries = readRows(sandboxRoot);
  let rows = 0;
  let chargedUsd = 0;
  const next = entries.map((entry) => {
    if (!ids.has(entry.jobId)) return entry;
    if (entry.chainPriced || entry.priceUsd !== 0 || entry.outcome !== 'failed') return entry;
    if (entry.costUnknown || entry.costUsd <= 0) return entry;
    const priceUsd = Math.min(entry.costUsd, entry.quotedUsd ?? entry.costUsd);
    rows += 1;
    chargedUsd += priceUsd;
    return { ...entry, priceUsd, chainPriced: true };
  });
  if (rows > 0) rewrite(sandboxRoot, next);
  return { rows, chargedUsd };
}

export interface Totals {
  jobs: number;
  costUsd: number;
  priceUsd: number;
  /** Money spent that nobody was charged for, whatever the outcome says. */
  absorbedUsd: number;
  free: number;
  /**
   * Runs that spent money none of these numbers include. Reported so the
   * totals can be read as "at least this much" rather than as complete.
   */
  unmeasured: number;
}

export function totals(entries: LedgerEntry[]): Totals {
  return entries.reduce<Totals>(
    (acc, entry) => ({
      jobs: acc.jobs + 1,
      costUsd: acc.costUsd + entry.costUsd,
      priceUsd: acc.priceUsd + entry.priceUsd,
      // Spent and not charged, which is not the same as failed. A tool
      // fall-back finishes `done` at a price of zero — the run succeeded and
      // the app ate it, because the quote had promised free. Keying this on
      // the outcome hid 83c of deliberate absorption across two jobs and
      // reported the total as complete.
      absorbedUsd: acc.absorbedUsd + (entry.priceUsd === 0 ? entry.costUsd : 0),
      free: acc.free + (entry.tier === 'routed' ? 1 : 0),
      unmeasured: acc.unmeasured + (entry.costUnknown ? 1 : 0),
    }),
    { jobs: 0, costUsd: 0, priceUsd: 0, absorbedUsd: 0, free: 0, unmeasured: 0 },
  );
}

export function totalsBy<K extends keyof LedgerEntry>(
  entries: LedgerEntry[],
  key: K,
): Record<string, Totals> {
  const grouped: Record<string, LedgerEntry[]> = {};
  for (const entry of entries) {
    const value = String(entry[key]);
    (grouped[value] ??= []).push(entry);
  }
  return Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, totals(v)]));
}

/**
 * What one *allowed* turn of this kind of work has cost.
 *
 * The unit matters. The SDK's reported `turns` is not the limit it was given:
 * higher when the run was cut off (a cap of 4 came back as 6), lower when it
 * finished early. So pricing against it and then using the result to set a
 * cap is noise in both directions rather than a bias in one — measured on
 * real history it left one job class unchanged and moved another by 15%.
 *
 * Only entries carrying `turnsAllowed` count. Falling back to reported turns
 * for older rows kept the wrong unit alive in the average; a smaller,
 * unit-correct sample is worth more than a larger mixed one, and with none at
 * all the role's own budget stands, which is the safe direction.
 *
 * Failures count here, as they do in history(): a session that died still
 * burnt its turns at a real rate, and the question is the burn rate, not
 * whether the work landed.
 *
 * `hasRepo` narrows the rate to runs of the same shape, and it is what makes
 * the budget bite at all. Measured 2026-07-31: a rate pooled across both
 * shapes came out at 1.8c/turn for a run that really burnt 7.4c, so the
 * budget worked out to 17 turns against a role cap of 8 and the cap always
 * won — a ceiling that could never bind on anything. Rows with no recorded
 * shape are left out of a narrowed rate rather than assumed: mixing them back
 * in is the very averaging that hid the overrun.
 */
export function costPerTurn(
  entries: LedgerEntry[],
  jobClass: string,
  tier?: Tier,
  hasRepo?: boolean,
): { samples: number; usd: number } {
  const granted = (e: LedgerEntry): number => e.turnsAllowed ?? 0;
  /**
   * The session's own cost: total less the close-out errand. A row that never
   * recorded the split contributes its total, which is what it did before
   * D-039 and the honest reading of a row that does not say otherwise.
   */
  const session = (e: LedgerEntry): number => e.costUsd - (e.closeOutUsd ?? 0);
  const useful = entries.filter(
    (e) =>
      e.jobClass === jobClass &&
      (tier ? e.tier === tier : true) &&
      (hasRepo === undefined || e.hasRepo === hasRepo) &&
      // The session must have cost something, not merely the job: a killed run
      // whose only measured spend was its write-up prices no turns at all, and
      // counting its turns against a zero session cost would deflate the rate.
      session(e) > 0 &&
      granted(e) > 0,
  );
  if (useful.length === 0) return { samples: 0, usd: 0 };
  const cost = useful.reduce((sum, e) => sum + session(e), 0);
  const turns = useful.reduce((sum, e) => sum + granted(e), 0);
  return { samples: useful.length, usd: cost / turns };
}

/**
 * What a turn of the run about to happen will cost — priced on the tier it
 * will actually run as, not on `session` for everything.
 *
 * Measured 2026-07-31: a one-shot turn costs 60–70% of a session turn for the
 * same role and shape (scribe with a repo, 5.7c against 8.3c; worker, 3.6c
 * against 5.9c), because a short leash does less exploring per turn. Pricing
 * a five-turn leash at the session rate therefore inflated the quote floor by
 * about half again, and the floor is a *lower* bound on the quote — so the
 * user was quoted more than the work costs.
 *
 * A one-shot with no history of its own falls back to the session rate rather
 * than to no rate at all. That overshoots, which is the safe direction: the
 * floor exists so a quote cannot come in under the turns it has already
 * decided to grant, and dropping it would restore exactly the bug it was
 * written for.
 */
export function rateFor(
  entries: LedgerEntry[],
  jobClass: string,
  tier: 'oneshot' | 'session',
  hasRepo: boolean,
): { samples: number; usd: number } {
  const own = costPerTurn(entries, jobClass, tier, hasRepo);
  if (own.samples > 0 || tier === 'session') return own;
  return costPerTurn(entries, jobClass, 'session', hasRepo);
}

/**
 * The class a row is *quoted* under: the recipe when there is one, else the
 * role. Deliberately not the class it is *priced per turn* under, which is
 * always the role — a turn costs what the role's prompt and tools make it
 * cost, while a quote answers "have we done this job before".
 *
 * The two were one field, and a quote for a one-shot looked up a recipe key
 * the ledger only ever wrote roles into. Measured on 20 one-shot rows: not one
 * matched, so every one-shot quote fell through to the tier average and said
 * "first time doing this" forever — a worker one-shot quoted 56c against its
 * own 22c history. A quote that cannot find its history cannot tighten, which
 * was the whole promise of pricing from a ledger.
 */
function quoteClass(entry: LedgerEntry): string {
  return entry.recipeKey ?? entry.jobClass;
}

/**
 * What this kind of job has cost before, on this tier — the basis of a quote.
 *
 * Every run that spent money counts, not only the ones that landed. Measured
 * 2026-07-31: a job quoted at 30c cost 59c, ran out of turns and filed as
 * failed — and the quote for the identical next job did not move a cent,
 * because it read successes only. The runs that break a quote are exactly the
 * ones that exhaust their turns and file failed or partial, so a done-only
 * average cannot see its own worst cases. On that same history the quote saw
 * 4 scribe runs at a mean of 15c while 5 runs had really cost money, at 24c.
 *
 * That nobody is billed for a failure is a separate decision, and priceFor
 * makes it. A quote is a bound on spending, and spent money is spent whatever
 * the outcome.
 *
 * Tier matters: the same class of work routed for free and run as a session
 * are different prices, and letting free runs into the average would quote a
 * ceiling of zero for a session that genuinely needs to spend.
 */
export function history(
  entries: LedgerEntry[],
  jobClass: string,
  tier?: Tier,
): { samples: number; mean: number; max: number } {
  const costs = entries
    .filter((e) => quoteClass(e) === jobClass && e.costUsd > 0 && (tier ? e.tier === tier : true))
    .map((e) => e.costUsd);
  if (costs.length === 0) return { samples: 0, mean: 0, max: 0 };
  const sum = costs.reduce((a, b) => a + b, 0);
  return { samples: costs.length, mean: sum / costs.length, max: Math.max(...costs) };
}
