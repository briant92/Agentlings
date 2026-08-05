import {
  type AgentlingRecord,
  BUDGET_AMBER,
  BUDGET_GREEN,
  type BudgetSignal,
  type CrewMember,
  isDelivery,
  type Job,
  type LevelProductivity,
  type MemberSpend,
} from '@agentlings/shared';
import type { LedgerEntry } from './ledger';

/**
 * What the crew has produced and what it cost, for the productivity panel.
 *
 * Pure, and its own module for the reason `ledgerRow` is: this builds one
 * object out of three sources, and the one function in this app with a proven
 * habit of quietly dropping a field was exactly that shape (D-039). A reader
 * cannot tell that `cheaper` counts classes rather than jobs, or that the
 * street lights skip unpriced runs; a test can.
 *
 * Everything here reads the ledger except `delivered`, which cannot — see the
 * field's own note.
 */

/**
 * A run that spent essentially its whole quote. Not `>=` exactly: the ceiling
 * is enforced by stopping the session, so a capped run lands a hair under as
 * often as on the nose, and an exact test would miss most of them.
 */
const CEILING = 0.995;

/**
 * The class a row is compared against its own past under: the recipe where
 * there is one, else the role. The same rule the quote uses — "have we done
 * this job before" is a question about the job, and the role cannot answer it.
 */
function classOf(entry: LedgerEntry): string {
  return entry.recipeKey ?? entry.jobClass;
}

export function signalFor(ratio: number | null): BudgetSignal {
  if (ratio === null) return 'green'; // nothing quoted, nothing overspent
  if (ratio < BUDGET_GREEN) return 'green';
  if (ratio <= BUDGET_AMBER) return 'amber';
  return 'red';
}

/**
 * Whether the memory line is the app's own journal rather than something
 * learnt.
 *
 * Matched against the whole shape of the four lines the app writes, not
 * against their opening words: the sim writes `delivered "…" as role`, a merge
 * writes `merged with Name, who delivered 3`, and a lesson is free prose that
 * can begin with any of those words — "merged with care: read both files
 * before rewriting either" is a real lesson and starts exactly like the
 * bookkeeping. Anything not of these shapes came back from a session, which is
 * the only way a lesson gets in at all.
 *
 * A crew of 114 memory lines that has learnt 43 things should say 43, and
 * every line this misreads moves one between those two numbers.
 */
const JOURNAL = [
  /^delivered ".*" as \S+$/,
  /^failed ".*" as \S+ — /,
  /^merged with .+, who delivered \d+$/,
  /^hired to: /,
];

export function isJournal(line: string): boolean {
  const text = line.replace(/^\d{4}-\d{2}-\d{2} · /, '');
  return JOURNAL.some((shape) => shape.test(text));
}

/**
 * Job classes run more than once, and how many now cost less than they did.
 *
 * Compared as first half against second half rather than first run against
 * last. A single run is noise — a repo job costs what its clone costs that
 * day — and reading a trend off two endpoints makes the verdict turn on
 * whichever run happened to be last. Free runs are left out: a class that
 * graduated to a tool would otherwise show as "cheaper" by an infinite margin
 * and drown the ones that genuinely got leaner, which is what `nowFree`
 * counts separately.
 */
export function cheaperClasses(entries: readonly LedgerEntry[]): {
  repeated: number;
  cheaper: number;
} {
  const byClass = new Map<string, LedgerEntry[]>();
  for (const entry of [...entries].sort((a, b) => a.at - b.at)) {
    if (entry.costUsd <= 0) continue;
    const key = classOf(entry);
    byClass.set(key, [...(byClass.get(key) ?? []), entry]);
  }
  let repeated = 0;
  let cheaper = 0;
  for (const rows of byClass.values()) {
    if (rows.length < 2) continue;
    repeated++;
    const split = Math.ceil(rows.length / 2);
    const mean = (list: LedgerEntry[]) =>
      list.reduce((sum, e) => sum + e.costUsd, 0) / list.length;
    if (mean(rows.slice(split)) < mean(rows.slice(0, split))) cheaper++;
  }
  return { repeated, cheaper };
}

/**
 * Runs on a class that used to cost money and now goes free.
 *
 * The tier matters and `tool` is not `routed`: routed work was never paid for,
 * whereas a tool is work that *used* to be paid for and no longer is. Only the
 * second says the crew is getting cheaper — but a router answering a question
 * a session once ran says it too, so both count where the class has a paid run
 * behind it. Without that condition this would just be "free runs", which the
 * `free` total already says.
 */
export function nowFreeRuns(entries: readonly LedgerEntry[]): number {
  const everPaid = new Set(entries.filter((e) => e.costUsd > 0).map(classOf));
  return entries.filter(
    (e) => (e.tier === 'tool' || e.tier === 'routed') && everPaid.has(classOf(e)),
  ).length;
}

/**
 * One member's lifetime record for their profile card (D-089): the level
 * block's own arithmetic, filtered to the rows that name them as author.
 * Blank-author rows (the 17 deliberately left unattributed after D-056's
 * backfill) are absent from every figure rather than guessed in, and
 * `avgPerDoneUsd` divides *all* their spend by the runs that landed — a
 * delivered run's true price carries the failures around it (D-012's
 * absorption, seen from the member's side).
 */
export function recordOf(
  memberId: string,
  entries: readonly LedgerEntry[],
): AgentlingRecord {
  const mine = entries.filter((e) => e.agentlingId === memberId);
  const done = mine.filter((e) => e.outcome === 'done').length;
  const costUsd = mine.reduce((sum, e) => sum + e.costUsd, 0);
  const priced = mine.filter((e) => typeof e.quotedUsd === 'number' && e.quotedUsd > 0);
  const quotedUsd = priced.reduce((sum, e) => sum + (e.quotedUsd ?? 0), 0);
  const ratio = quotedUsd > 0 ? priced.reduce((sum, e) => sum + e.costUsd, 0) / quotedUsd : null;
  const { repeated, cheaper } = cheaperClasses(mine);
  return {
    runs: mine.length,
    done,
    costUsd,
    avgPerDoneUsd: done > 0 ? costUsd / done : null,
    repeated,
    cheaper,
    atCeiling: priced.filter((e) => e.costUsd >= (e.quotedUsd ?? 0) * CEILING).length,
    pricedRuns: priced.length,
    ratio,
    signal: signalFor(ratio),
  };
}

/** One member's spending, from the rows that name them as the author. */
export function spendOf(member: CrewMember, entries: readonly LedgerEntry[]): MemberSpend {
  const mine = entries.filter((e) => e.agentlingId === member.id);
  // Only runs that carried a quote can be measured against one. Counting the
  // rest as costing nothing against nothing would make a member look thriftier
  // for every unquoted run they did.
  const priced = mine.filter((e) => typeof e.quotedUsd === 'number' && e.quotedUsd > 0);
  const costUsd = mine.reduce((sum, e) => sum + e.costUsd, 0);
  const quotedUsd = priced.reduce((sum, e) => sum + (e.quotedUsd ?? 0), 0);
  const ratio = quotedUsd > 0 ? priced.reduce((sum, e) => sum + e.costUsd, 0) / quotedUsd : null;
  return {
    id: member.id,
    name: member.name,
    color: member.color,
    jobs: mine.length,
    costUsd,
    quotedUsd,
    priced: priced.length,
    ratio,
    signal: signalFor(ratio),
    atCeiling: priced.filter((e) => e.costUsd >= (e.quotedUsd ?? 0) * CEILING).length,
  };
}

export function productivityOf(
  /** This level's ledger rows. Filtering by level is the caller's job. */
  entries: readonly LedgerEntry[],
  /** The queue, for `delivered` alone. */
  jobs: readonly Job[],
  crew: readonly CrewMember[],
  lessonsOf: (agentlingName: string) => readonly string[],
): LevelProductivity {
  const lines = crew.flatMap((member) => [...lessonsOf(member.name)]);
  const { repeated, cheaper } = cheaperClasses(entries);
  const unattributed = entries.filter((e) => !e.agentlingId);
  return {
    jobs: entries.length,
    costUsd: entries.reduce((sum, e) => sum + e.costUsd, 0),
    priceUsd: entries.reduce((sum, e) => sum + e.priceUsd, 0),
    // Spent and not charged, which is not the same as failed: a tool
    // fall-back finishes `done` at a price of zero because the quote had
    // promised free. Keyed on the price for that reason, as `totals` is.
    absorbedUsd: entries.reduce((sum, e) => sum + (e.priceUsd === 0 ? e.costUsd : 0), 0),
    free: entries.filter((e) => e.tier === 'routed' || e.tier === 'tool').length,
    unmeasured: entries.filter((e) => e.costUnknown).length,
    delivered: jobs.filter((job) => isDelivery(job.status)).length,
    lessons: lines.length,
    journal: lines.filter(isJournal).length,
    repeated,
    cheaper,
    nowFree: nowFreeRuns(entries),
    // Resting crew included: they are still who spent it, and dropping them
    // would move their spending into the unattributed pile the moment they
    // went to sleep.
    crew: crew.map((member) => spendOf(member, entries)),
    unattributed: unattributed.length,
    unattributedUsd: unattributed.reduce((sum, e) => sum + e.costUsd, 0),
  };
}
