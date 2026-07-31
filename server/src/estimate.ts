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
/**
 * The most this app will quote for one job, whatever its history says.
 *
 * A separate number from DEFAULT_CEILING_USD, and the two were the same one
 * until it caused a breach. What ignorance quotes and what knowledge is
 * allowed to say are different questions: 50c is a fair guess about a job
 * nobody has run, and a terrible bound on a job measured at 59c. Clamping the
 * learned ceiling to the cautious default made the quote promise less than
 * the history it was reading — so it broke its promise while holding the
 * evidence that it would.
 *
 * This one exists for runaways only: a single freak run would otherwise set
 * every later quote for that class. Observed max is 59c and learned ceilings
 * sit near 71c, so $2 clips nothing real. `AGENTLINGS_MAX_COST_USD` overrides
 * it, and lowering it is how you get a hard spending limit back.
 */
export const MAX_CEILING_USD = 2;

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
  options: { maxCeilingUsd?: number } = {},
): Quote {
  const cap = options.maxCeilingUsd ?? MAX_CEILING_USD;

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

  const own = history(ledger, jobClass, tier);
  if (own.samples > 0 && own.max > 0) {
    // Bounded by the runaway cap, not by the cautious default: once there is
    // history, the history is the better evidence and the quote should say so.
    // Never zero either — a ceiling of zero would kill the session instantly,
    // which is worse than quoting generously.
    const ceiling = Math.max(Math.min(ceilingFrom(own.mean, own.max), cap), 0.01);
    return {
      tier,
      ceilingUsd: ceiling,
      expectedUsd: own.mean,
      samples: own.samples,
      certainty: own.samples >= 3 ? 'high' : 'estimated',
      wording: `About ${formatUsd(own.mean)} — done this ${own.samples} time${own.samples === 1 ? '' : 's'} before`,
    };
  }

  // Nothing for this exact job, but the tier as a whole may have a track
  // record. Same population as history(): what the tier has spent, not what it
  // spent successfully — this branch catches jobs matched to a role nobody
  // holds, which is where a blind average does the most damage.
  const sameTier = ledger.filter((e) => e.tier === tier && e.costUsd > 0);
  if (sameTier.length > 0) {
    const mean = sameTier.reduce((sum, e) => sum + e.costUsd, 0) / sameTier.length;
    const max = Math.max(...sameTier.map((e) => e.costUsd));
    const ceiling = Math.min(ceilingFrom(mean, max), cap);
    return {
      tier,
      ceilingUsd: ceiling,
      expectedUsd: mean,
      samples: 0,
      certainty: 'estimated',
      wording: `Up to ${formatUsd(ceiling)} — first time doing this`,
    };
  }

  // Nothing at all to go on, so this is where the cautious default belongs —
  // and the cap still applies, since lowering it must tighten every quote.
  const unseenCeiling = Math.min(
    tier === 'oneshot' ? ONESHOT_CEILING_USD : DEFAULT_CEILING_USD,
    cap,
  );
  return {
    tier,
    ceilingUsd: unseenCeiling,
    samples: 0,
    certainty: 'estimated',
    wording: `Up to ${formatUsd(unseenCeiling)} — nothing like this has been done yet`,
  };
}
