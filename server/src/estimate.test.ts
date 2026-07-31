import { describe, expect, it } from 'vitest';
import { DEFAULT_CEILING_USD, ONESHOT_CEILING_USD, formatUsd, quoteFor } from './estimate';
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
    const quote = quoteFor('session', 'tidy', costing(0.05, 0.5), { defaultCeilingUsd: 2 });
    expect(quote.ceilingUsd).toBeCloseTo(0.6);
  });

  it('never quotes above the default ceiling, however costly the history', () => {
    const quote = quoteFor('session', 'tidy', costing(1));
    expect(quote.ceilingUsd).toBe(DEFAULT_CEILING_USD);
    expect(quote.expectedUsd).toBe(1); // honest about the average it cannot promise
  });

  it('never quotes zero, even asked for a ceiling of zero', () => {
    // A ceiling of zero would stop the session before its first turn.
    expect(quoteFor('session', 'tidy', costing(0.2), { defaultCeilingUsd: 0 }).ceilingUsd).toBe(
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
      expect(quoteFor(tier, 'paint', [], { defaultCeilingUsd: 0.05 }).ceilingUsd).toBe(0.05);
    }
  });
});
