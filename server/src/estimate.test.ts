import { describe, expect, it } from 'vitest';
import { COMPILE_TURNS, turnsForBudget } from './executors/claude';
import {
  DEFAULT_CEILING_USD,
  MAX_CEILING_USD,
  ONESHOT_CEILING_USD,
  formatUsd,
  quoteFor,
} from './estimate';
import type { LedgerEntry, Tier } from './ledger';

/** A done session entry; override only what the case is about. */
function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    at: 0,
    jobId: 'j1',
    levelId: 'hq',
    jobClass: 'tidy',
    tier: 'session',
    outcome: 'done',
    costUsd: 0.1,
    priceUsd: 0.1,
    ...over,
  };
}

const costing = (...costs: number[]): LedgerEntry[] => costs.map((costUsd) => entry({ costUsd }));

describe('formatUsd', () => {
  it('says free rather than $0.00', () => {
    expect(formatUsd(0)).toBe('free');
  });

  it('does not print a fraction of a cent', () => {
    expect(formatUsd(0.004)).toBe('under a cent');
  });

  it('prices small change in cents', () => {
    expect(formatUsd(0.34)).toBe('34c');
  });

  it('rounds to the nearest cent', () => {
    expect(formatUsd(0.014)).toBe('1c');
    expect(formatUsd(0.336)).toBe('34c');
  });

  it('switches to dollars at a dollar', () => {
    expect(formatUsd(1)).toBe('$1.00');
    expect(formatUsd(2.5)).toBe('$2.50');
  });
});

describe('quoteFor, on a routed job', () => {
  it('is free and certain, whatever the history says', () => {
    expect(quoteFor('routed', 'tidy', costing(0.4, 0.6))).toEqual({
      tier: 'routed',
      ceilingUsd: 0,
      expectedUsd: 0,
      samples: 0,
      certainty: 'certain',
      wording: 'Free — we already know this',
    });
  });
});

describe('quoteFor, with history for this job', () => {
  it('expects the average and leaves room above it', () => {
    const quote = quoteFor('session', 'tidy', costing(0.1, 0.2, 0.3));
    expect(quote.expectedUsd).toBeCloseTo(0.2);
    expect(quote.ceilingUsd).toBeCloseTo(0.4); // twice the mean
    expect(quote.samples).toBe(3);
  });

  it('lets one expensive run set the ceiling instead of the average', () => {
    // mean 0.275 doubled is 0.55, but the 0.5 outlier plus 20% is more.
    const quote = quoteFor('session', 'tidy', costing(0.05, 0.5), { maxCeilingUsd: 2 });
    expect(quote.ceilingUsd).toBeCloseTo(0.6);
  });

  it('lets measured history quote above the cautious default', () => {
    // 50c is what ignorance quotes. A job measured at 60c is not ignorance,
    // and clamping it back to 50c is how a quote comes to promise less than
    // the evidence it is holding — which is how a real one got breached.
    const quote = quoteFor('session', 'tidy', costing(0.6));
    expect(quote.ceilingUsd).toBeCloseTo(1.2);
    expect(quote.ceilingUsd).toBeGreaterThan(DEFAULT_CEILING_USD);
  });

  it('stops at the runaway cap however costly the history', () => {
    const quote = quoteFor('session', 'tidy', costing(5));
    expect(quote.ceilingUsd).toBe(MAX_CEILING_USD);
    expect(quote.expectedUsd).toBe(5); // honest about the average it will not promise
  });

  it('never quotes zero, even asked for a ceiling of zero', () => {
    // A ceiling of zero would stop the session before its first turn.
    expect(quoteFor('session', 'tidy', costing(0.2), { maxCeilingUsd: 0 }).ceilingUsd).toBe(
      0.01,
    );
  });

  it('is only confident from the third run onwards', () => {
    expect(quoteFor('session', 'tidy', costing(0.1, 0.1)).certainty).toBe('estimated');
    expect(quoteFor('session', 'tidy', costing(0.1, 0.1, 0.1)).certainty).toBe('high');
  });

  it('counts the runs in words a person would use', () => {
    expect(quoteFor('session', 'tidy', costing(0.1)).wording).toBe(
      'About 10c — done this 1 time before',
    );
    expect(quoteFor('session', 'tidy', costing(0.1, 0.1)).wording).toBe(
      'About 10c — done this 2 times before',
    );
  });

  it('ignores what the same job cost on another tier', () => {
    const ledger = [entry({ costUsd: 0.4 }), entry({ tier: 'oneshot', costUsd: 0.02 })];
    expect(quoteFor('oneshot', 'tidy', ledger).expectedUsd).toBeCloseTo(0.02);
  });
});

describe('quoteFor, with history for the tier but not the job', () => {
  it('quotes off the tier and admits it is the first time', () => {
    const ledger = [entry({ jobClass: 'tidy', costUsd: 0.2 })];
    const quote = quoteFor('session', 'paint', ledger);
    expect(quote).toMatchObject({
      ceilingUsd: 0.4,
      samples: 0, // this job has never been done, whatever the tier has
      certainty: 'estimated',
      wording: 'Up to 40c — first time doing this',
    });
    expect(quote.expectedUsd).toBeCloseTo(0.2);
  });

  it('counts failed runs — a quote bounds spending, it does not describe a bill', () => {
    const ledger = [
      entry({ jobClass: 'tidy', costUsd: 0.2 }),
      entry({ jobClass: 'tidy', outcome: 'failed', costUsd: 1, priceUsd: 0 }),
    ];
    expect(quoteFor('session', 'paint', ledger).expectedUsd).toBeCloseTo(0.6);
  });

  it('does not treat a job that landed for free as history', () => {
    // A zero-cost run says nothing about what the work costs.
    const quote = quoteFor('session', 'tidy', [entry({ costUsd: 0, priceUsd: 0 })]);
    expect(quote.wording).toBe('Up to 50c — nothing like this has been done yet');
    expect(quote.samples).toBe(0);
  });
});

describe('quoteFor, against what the run may actually spend', () => {
  // The failure this exists for: the recipe tier's history was thirteen runs
  // that died on a three-turn leash, so it quoted 22c, which funded three
  // turns, which is the leash that was failing. A tier calibrated on its own
  // failures cannot escape them unless the quote can outvote the history.
  it('never quotes below the turns it is about to grant', () => {
    const cheapHistory = costing(0.1, 0.11, 0.1);
    expect(quoteFor('oneshot', 'tidy', cheapHistory).ceilingUsd).toBeLessThan(0.35);
    expect(
      quoteFor('oneshot', 'tidy', cheapHistory, { floorUsd: 0.354 }).ceilingUsd,
    ).toBeCloseTo(0.354);
  });

  it('leaves a quote alone when history already covers the leash', () => {
    const quote = quoteFor('session', 'tidy', costing(0.5), { floorUsd: 0.2 });
    expect(quote.ceilingUsd).toBeCloseTo(1); // twice the mean, not the floor
  });

  it('applies the floor to work it has never seen either', () => {
    expect(quoteFor('session', 'brand-new', [], { floorUsd: 0.9 }).ceilingUsd).toBeCloseTo(0.9);
  });

  // A leash nobody can afford should shorten, not overturn the ceiling.
  it('still lets the runaway cap win over the floor', () => {
    const quote = quoteFor('session', 'tidy', costing(0.1), {
      floorUsd: 5,
      maxCeilingUsd: 1,
    });
    expect(quote.ceilingUsd).toBe(1);
  });

  it('never lets a floor of nothing quote zero', () => {
    expect(quoteFor('session', 'tidy', costing(0.2), { floorUsd: 0 }).ceilingUsd).toBeGreaterThan(0);
  });

  it('keeps free work free, whatever the floor says', () => {
    expect(quoteFor('routed', 'tidy', costing(0.4), { floorUsd: 2 }).ceilingUsd).toBe(0);
    expect(quoteFor('tool', 'tidy', costing(0.4), { floorUsd: 2 }).ceilingUsd).toBe(0);
  });

  // The compile's own version of the same failure: a cap the quote cannot fund
  // is handed straight back by the turn budget, so the constant would arrive
  // inert. Checked at all three rates real compiles have burnt — 8.8c, 9.4c
  // and 12.6c a turn — since the floor has to hold at the dearest of them.
  it('funds every turn a compile is about to be granted', () => {
    for (const usd of [0.088, 0.094, 0.126]) {
      const rate = { samples: 2, usd };
      const quote = quoteFor('session', 'scribe', costing(0.5, 1.26), {
        floorUsd: COMPILE_TURNS * usd,
      });
      expect(turnsForBudget(quote.ceilingUsd, rate, COMPILE_TURNS)).toBe(COMPILE_TURNS);
    }
  });

  // Why the cap is not simply raised when a compile runs out: past about 15
  // turns MAX_CEILING_USD stops the floor, so the extra turns are quietly not
  // granted at the very rate that made them look necessary.
  it('stops funding turns once the runaway cap bites', () => {
    const dear = { samples: 2, usd: 0.126 };
    const quote = quoteFor('session', 'scribe', costing(0.5, 1.26), { floorUsd: 16 * 0.126 });
    expect(turnsForBudget(quote.ceilingUsd, dear, 16)).toBe(15);
  });
});

describe('quoteFor, with nothing to go on', () => {
  it('quotes a one-shot low, because one call cannot run away', () => {
    expect(quoteFor('oneshot', 'paint', []).ceilingUsd).toBe(ONESHOT_CEILING_USD);
  });

  it('quotes a session cautiously', () => {
    expect(quoteFor('session', 'paint', [])).toEqual({
      tier: 'session',
      ceilingUsd: DEFAULT_CEILING_USD,
      samples: 0,
      certainty: 'estimated',
      wording: 'Up to 50c — nothing like this has been done yet',
    });
  });

  it('takes the stingier of the tier floor and the caller ceiling', () => {
    for (const tier of ['oneshot', 'session'] satisfies Tier[]) {
      expect(quoteFor(tier, 'paint', [], { maxCeilingUsd: 0.05 }).ceilingUsd).toBe(0.05);
    }
  });
});
