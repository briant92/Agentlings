import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Append-only record of what work cost and what it would be charged for.
 *
 * Cost and price are separate numbers even though they are equal today: a
 * ledger cannot be reconstructed retroactively, so the shape that supports
 * quoting, absorbing failures and any future markup has to exist from the
 * first entry or the history is worthless.
 */

export type Tier = 'routed' | 'oneshot' | 'session';

export interface LedgerEntry {
  at: number;
  jobId: string;
  levelId: string;
  /** Stable key for "this kind of job" — a recipe key, or the role. */
  jobClass: string;
  tier: Tier;
  outcome: 'done' | 'failed';
  /** What it actually cost us, from the SDK. */
  costUsd: number;
  /** What the user would be charged. Zero for failures: the app absorbs those. */
  priceUsd: number;
  /** The ceiling quoted before the work, when there was one. */
  quotedUsd?: number;
  turns?: number;
  /** The turn limit the session was given — the unit a budget is priced in. */
  turnsAllowed?: number;
  model?: string;
}

export function ledgerFile(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'ledger.jsonl');
}

export function append(sandboxRoot: string, entry: LedgerEntry): void {
  mkdirSync(sandboxRoot, { recursive: true });
  appendFileSync(ledgerFile(sandboxRoot), `${JSON.stringify(entry)}\n`);
}

export function readLedger(sandboxRoot: string): LedgerEntry[] {
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

export interface Totals {
  jobs: number;
  costUsd: number;
  priceUsd: number;
  /** Cost of work that failed, and was therefore not charged for. */
  absorbedUsd: number;
  free: number;
}

export function totals(entries: LedgerEntry[]): Totals {
  return entries.reduce<Totals>(
    (acc, entry) => ({
      jobs: acc.jobs + 1,
      costUsd: acc.costUsd + entry.costUsd,
      priceUsd: acc.priceUsd + entry.priceUsd,
      absorbedUsd: acc.absorbedUsd + (entry.outcome === 'failed' ? entry.costUsd : 0),
      free: acc.free + (entry.tier === 'routed' ? 1 : 0),
    }),
    { jobs: 0, costUsd: 0, priceUsd: 0, absorbedUsd: 0, free: 0 },
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
 * What this kind of job has cost before, on this tier — the basis of a quote.
 *
 * Tier matters: the same class of work routed for free and run as a session
 * are different prices, and letting free runs into the average would quote a
 * ceiling of zero for a session that genuinely needs to spend.
 */
/**
 * What one *allowed* turn of this kind of work has cost.
 *
 * The unit matters and was got wrong once: the SDK's reported `turns` runs
 * higher than the limit it was given (a cap of 4 came back as 6), so pricing
 * against it and then using the result to set the cap understates the budget
 * and lets cost overshoot the quote. The rate is therefore cost per turn we
 * granted — the number we control — falling back to reported turns only for
 * older entries that predate the distinction.
 *
 * Failures count here, unlike history(): a session that died still burnt its
 * turns at a real rate, and the question is the burn rate, not whether the
 * work landed.
 */
export function costPerTurn(
  entries: LedgerEntry[],
  jobClass: string,
  tier?: Tier,
): { samples: number; usd: number } {
  const granted = (e: LedgerEntry): number => e.turnsAllowed ?? e.turns ?? 0;
  const useful = entries.filter(
    (e) =>
      e.jobClass === jobClass &&
      (tier ? e.tier === tier : true) &&
      e.costUsd > 0 &&
      granted(e) > 0,
  );
  if (useful.length === 0) return { samples: 0, usd: 0 };
  const cost = useful.reduce((sum, e) => sum + e.costUsd, 0);
  const turns = useful.reduce((sum, e) => sum + granted(e), 0);
  return { samples: useful.length, usd: cost / turns };
}

export function history(
  entries: LedgerEntry[],
  jobClass: string,
  tier?: Tier,
): { samples: number; mean: number; max: number } {
  const costs = entries
    .filter(
      (e) => e.jobClass === jobClass && e.outcome === 'done' && (tier ? e.tier === tier : true),
    )
    .map((e) => e.costUsd);
  if (costs.length === 0) return { samples: 0, mean: 0, max: 0 };
  const sum = costs.reduce((a, b) => a + b, 0);
  return { samples: costs.length, mean: sum / costs.length, max: Math.max(...costs) };
}
