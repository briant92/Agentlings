import type { Quote } from '@agentlings/shared';
import { history, type LedgerEntry, type Tier } from './ledger';

/**
 * What a job will cost, before it runs. Not a model — a lookup over what
 * this kind of work has actually cost, which is only possible because the
 * router sorts work into tiers with genuinely different cost behaviour.
 *
 * The quote is a ceiling, and it is enforced: the user is never charged
 * above it. That matters most where the estimate is worst, since the widest
 * variance sits on exactly the most expensive jobs.
 */

/** Used until any history exists. Deliberately cautious rather than flattering. */
export const DEFAULT_CEILING_USD = 0.5;
/** A one-shot is one call; it cannot run away the way a loop can. */
export const ONESHOT_CEILING_USD = 0.1;

export function formatUsd(amount: number): string {
  if (amount === 0) return 'free';
  if (amount < 0.01) return 'under a cent';
  if (amount < 1) return `${Math.round(amount * 100)}c`;
  return `$${amount.toFixed(2)}`;
}

/** Room for a job to cost more than its average without breaking the quote. */
function ceilingFrom(mean: number, max: number): number {
  return Math.max(mean * 2, max * 1.2);
}

export function quoteFor(
  tier: Tier,
  jobClass: string,
  ledger: LedgerEntry[],
  options: { defaultCeilingUsd?: number } = {},
): Quote {
  const fallbackCeiling = options.defaultCeilingUsd ?? DEFAULT_CEILING_USD;

  if (tier === 'routed') {
    return {
      tier,
      ceilingUsd: 0,
      expectedUsd: 0,
      samples: 0,
      certainty: 'certain',
      wording: 'Free — we already know this',
    };
  }

  const floor = tier === 'oneshot' ? ONESHOT_CEILING_USD : fallbackCeiling;
  const own = history(ledger, jobClass, tier);
  if (own.samples > 0 && own.max > 0) {
    // Never quote below the tier's floor: a ceiling of zero would kill the
    // session instantly, which is worse than quoting generously.
    const ceiling = Math.max(Math.min(ceilingFrom(own.mean, own.max), fallbackCeiling), 0.01);
    return {
      tier,
      ceilingUsd: ceiling,
      expectedUsd: own.mean,
      samples: own.samples,
      certainty: own.samples >= 3 ? 'high' : 'estimated',
      wording: `About ${formatUsd(own.mean)} — done this ${own.samples} time${own.samples === 1 ? '' : 's'} before`,
    };
  }

  // Nothing for this exact job, but the tier as a whole may have a track record.
  const sameTier = ledger.filter((e) => e.tier === tier && e.outcome === 'done' && e.costUsd > 0);
  if (sameTier.length > 0) {
    const mean = sameTier.reduce((sum, e) => sum + e.costUsd, 0) / sameTier.length;
    const max = Math.max(...sameTier.map((e) => e.costUsd));
    const ceiling = Math.min(ceilingFrom(mean, max), fallbackCeiling);
    return {
      tier,
      ceilingUsd: ceiling,
      expectedUsd: mean,
      samples: 0,
      certainty: 'estimated',
      wording: `Up to ${formatUsd(ceiling)} — first time doing this`,
    };
  }

  const unseenCeiling = Math.min(floor, fallbackCeiling);
  return {
    tier,
    ceilingUsd: unseenCeiling,
    samples: 0,
    certainty: 'estimated',
    wording: `Up to ${formatUsd(unseenCeiling)} — nothing like this has been done yet`,
  };
}
