import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { quoteFor, formatUsd, DEFAULT_CEILING_USD } from './estimate';
import {
  append,
  costPerTurn,
  history,
  priceFor,
  rateFor,
  readLedger,
  totals,
  totalsBy,
  type LedgerEntry,
  type Tier,
} from './ledger';

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    at: 1,
    jobId: 'j',
    levelId: 'hq',
    jobClass: 'analyst',
    tier: 'session',
    outcome: 'done',
    costUsd: 0.1,
    priceUsd: 0.1,
    ...over,
  };
}

describe('priceFor', () => {
  it('charges nothing for work that failed — the app absorbs it', () => {
    expect(priceFor('failed', 0.42)).toBe(0);
    expect(priceFor('failed', 0.42, 0.5)).toBe(0);
  });

  it('charges what it cost when nothing was quoted', () => {
    expect(priceFor('done', 0.12)).toBe(0.12);
  });

  // The promise the quote makes.
  it('never charges above the quote, even if it cost more', () => {
    expect(priceFor('done', 0.9, 0.4)).toBe(0.4);
  });

  it('charges the real cost when it came in under the quote', () => {
    expect(priceFor('done', 0.2, 0.4)).toBe(0.2);
  });
});

describe('totals', () => {
  it('separates what we spent from what is chargeable', () => {
    const result = totals([
      entry({ costUsd: 0.2, priceUsd: 0.2 }),
      entry({ outcome: 'failed', costUsd: 0.3, priceUsd: 0 }),
      entry({ tier: 'routed', costUsd: 0, priceUsd: 0 }),
    ]);
    expect(result).toEqual({
      jobs: 3,
      costUsd: 0.5,
      priceUsd: 0.2,
      absorbedUsd: 0.3,
      free: 1,
      unmeasured: 0,
    });
  });

  it('groups by level and by tier', () => {
    const entries = [entry({ levelId: 'hq' }), entry({ levelId: 'other', tier: 'routed' })];
    expect(Object.keys(totalsBy(entries, 'levelId')).sort()).toEqual(['hq', 'other']);
    expect(totalsBy(entries, 'tier').routed.jobs).toBe(1);
  });
});

describe('history', () => {
  it('counts every run of that kind that spent money, landed or not', () => {
    const entries = [
      entry({ jobClass: 'analyst', costUsd: 0.1 }),
      entry({ jobClass: 'analyst', costUsd: 0.3 }),
      entry({ jobClass: 'analyst', costUsd: 9, outcome: 'failed' }),
      entry({ jobClass: 'mason', costUsd: 5 }),
    ];
    // Nobody was billed for the $9 run, and it is the only one that says what
    // this work can cost: a quote blind to it keeps making the same promise.
    const own = history(entries, 'analyst');
    expect({ samples: own.samples, max: own.max }).toEqual({ samples: 3, max: 9 });
    expect(own.mean).toBeCloseTo(3.1333);
  });

  it('says nothing rather than guessing when there is no history', () => {
    expect(history([], 'analyst')).toEqual({ samples: 0, mean: 0, max: 0 });
  });

  it('keeps tiers apart, so free runs cannot drag a paid quote to zero', () => {
    const entries = [
      entry({ jobClass: 'scribe', tier: 'routed', costUsd: 0 }),
      entry({ jobClass: 'scribe', tier: 'session', costUsd: 0.2 }),
    ];
    expect(history(entries, 'scribe', 'session')).toEqual({ samples: 1, mean: 0.2, max: 0.2 });
    expect(history(entries, 'scribe', 'routed').mean).toBe(0);
  });

  // The defect this closes: a one-shot's quote asks for a recipe key, and the
  // ledger only ever wrote roles, so it matched nothing on all 20 real rows
  // and said "first time doing this" forever.
  it('looks a one-shot up by its recipe, not by who ran it', () => {
    const entries = [
      entry({ jobClass: 'worker', recipeKey: 'tidy the notes', tier: 'oneshot', costUsd: 0.1 }),
      entry({ jobClass: 'scribe', recipeKey: 'tidy the notes', tier: 'oneshot', costUsd: 0.2 }),
      entry({ jobClass: 'worker', recipeKey: 'something else', tier: 'oneshot', costUsd: 9 }),
    ];
    // Two runs of the same job, by different roles, are the same history…
    expect(history(entries, 'tidy the notes', 'oneshot').samples).toBe(2);
    expect(history(entries, 'tidy the notes', 'oneshot').mean).toBeCloseTo(0.15);
    // …and the role is no longer the class, so it finds nothing under it.
    expect(history(entries, 'worker', 'oneshot').samples).toBe(0);
  });

  // A session is quoted by role: it has no recipe, and the role is the finest
  // class there is. Stamping one would take the row out of its role's history.
  it('still looks a session up by role', () => {
    const entries = [
      entry({ jobClass: 'scribe', tier: 'session', costUsd: 0.4 }),
      entry({ jobClass: 'scribe', recipeKey: 'a repeat', tier: 'oneshot', costUsd: 0.1 }),
    ];
    expect(history(entries, 'scribe', 'session').samples).toBe(1);
  });

  // The rate is priced by the role that ran it, deliberately unchanged: what a
  // turn costs is set by the role's prompt, tools and cap, not by the recipe.
  it('keeps pricing a turn by the role even on a one-shot row', () => {
    const entries = [
      entry({ jobClass: 'worker', recipeKey: 'tidy the notes', tier: 'oneshot', costUsd: 0.2, turnsAllowed: 4 }),
    ];
    expect(costPerTurn(entries, 'worker', 'oneshot').samples).toBe(1);
    expect(costPerTurn(entries, 'tidy the notes', 'oneshot').samples).toBe(0);
  });
});

describe('rateFor', () => {
  const repo = (tier: Tier, costUsd: number, turnsAllowed: number) =>
    entry({ jobClass: 'worker', tier, costUsd, turnsAllowed, hasRepo: true });

  // Measured on the real ledger: a one-shot turn is 60–70% of a session turn
  // for the same role and shape, because a short leash explores less per turn.
  // Pricing a leash at the session rate inflated the quote floor by half again.
  it('prices a one-shot turn on one-shot history, not on sessions', () => {
    const entries = [repo('oneshot', 0.2, 5), repo('session', 0.9, 10)];
    expect(rateFor(entries, 'worker', 'oneshot', true).usd).toBeCloseTo(0.04);
    expect(rateFor(entries, 'worker', 'session', true).usd).toBeCloseTo(0.09);
  });

  // Overshooting is the safe direction: the floor stops a quote coming in
  // under the turns it has already granted, so losing it would restore the
  // bug it was written for. There is no one-shot history at all for non-repo
  // work on the real ledger, so this branch is live, not theoretical.
  it('falls back to the session rate when a one-shot has no history', () => {
    const entries = [repo('session', 0.9, 10)];
    const rate = rateFor(entries, 'worker', 'oneshot', true);
    expect(rate.samples).toBe(1);
    expect(rate.usd).toBeCloseTo(0.09);
  });

  // A session with no history stays unpriced rather than borrowing a cheaper
  // tier's rate, which would quote below what the turns will really cost.
  it('does not invent a session rate from one-shot runs', () => {
    expect(rateFor([repo('oneshot', 0.2, 5)], 'worker', 'session', true).samples).toBe(0);
  });

  it('keeps the shapes apart, as costPerTurn does', () => {
    const entries = [repo('oneshot', 0.2, 5)];
    expect(rateFor(entries, 'worker', 'oneshot', false).samples).toBe(0);
  });
});

describe('persistence', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-ledger-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('appends and reads back', () => {
    append(root, entry({ jobId: 'a' }));
    append(root, entry({ jobId: 'b' }));
    expect(readLedger(root).map((e) => e.jobId)).toEqual(['a', 'b']);
  });

  it('starts empty rather than throwing', () => {
    expect(readLedger(root)).toEqual([]);
  });
});

describe('formatUsd', () => {
  it('speaks money a non-expert reads at a glance', () => {
    expect(formatUsd(0)).toBe('free');
    expect(formatUsd(0.004)).toBe('under a cent');
    expect(formatUsd(0.04)).toBe('4c');
    expect(formatUsd(1.5)).toBe('$1.50');
  });
});

describe('quoteFor', () => {
  it('quotes a certain zero for work no session will touch', () => {
    const quote = quoteFor('routed', 'analyst', []);
    expect(quote).toMatchObject({ ceilingUsd: 0, certainty: 'certain' });
    expect(quote.wording).toMatch(/free/i);
  });

  it('quotes from history once this kind of job has been done', () => {
    const entries = [
      entry({ jobClass: 'analyst', costUsd: 0.02 }),
      entry({ jobClass: 'analyst', costUsd: 0.04 }),
      entry({ jobClass: 'analyst', costUsd: 0.03 }),
    ];
    const quote = quoteFor('session', 'analyst', entries);
    expect(quote.samples).toBe(3);
    expect(quote.certainty).toBe('high');
    expect(quote.expectedUsd).toBeCloseTo(0.03);
    expect(quote.wording).toMatch(/done this 3 times before/);
  });

  it('leaves room above the average so the ceiling is not routinely hit', () => {
    const entries = [entry({ jobClass: 'a', costUsd: 0.05 }), entry({ jobClass: 'a', costUsd: 0.1 })];
    const quote = quoteFor('session', 'a', entries);
    expect(quote.ceilingUsd).toBeGreaterThan(0.1);
  });

  it('is cautious, not flattering, when it has never seen the work', () => {
    const quote = quoteFor('session', 'brand-new', []);
    expect(quote.ceilingUsd).toBe(DEFAULT_CEILING_USD);
    expect(quote.certainty).toBe('estimated');
    expect(quote.wording).toMatch(/nothing like this/);
  });

  it('quotes a one-shot lower than a full loop, since it cannot run away', () => {
    const oneShot = quoteFor('oneshot', 'unseen', []);
    const session = quoteFor('session', 'unseen', []);
    expect(oneShot.ceilingUsd).toBeLessThan(session.ceilingUsd);
  });

  // Found live: a class whose only history was free routed jobs quoted $0,
  // which would have killed the next real session the moment it started.
  it('never quotes zero for work that will actually run a session', () => {
    const freeHistory = [
      entry({ jobClass: 'scribe', tier: 'routed', costUsd: 0, priceUsd: 0 }),
      entry({ jobClass: 'scribe', tier: 'routed', costUsd: 0, priceUsd: 0 }),
    ];
    const quote = quoteFor('session', 'scribe', freeHistory);
    expect(quote.ceilingUsd).toBeGreaterThan(0);
  });

  it('never quotes above the configured cap', () => {
    const entries = [entry({ jobClass: 'pricey', costUsd: 50 })];
    const quote = quoteFor('session', 'pricey', entries, { maxCeilingUsd: 1 });
    expect(quote.ceilingUsd).toBe(1);
  });
});

describe('costPerTurn', () => {
  it('divides total cost by total turns, not by job', () => {
    // 0.30 over 10 turns and 0.10 over 10 turns is 2c a turn, not the 2.5c a
    // per-job average would give: long jobs must weigh more than short ones.
    const entries = [
      entry({ jobClass: 'mason', costUsd: 0.3, turnsAllowed: 10 }),
      entry({ jobClass: 'mason', costUsd: 0.1, turnsAllowed: 10 }),
    ];
    expect(costPerTurn(entries, 'mason').usd).toBeCloseTo(0.02, 6);
  });

  // Found live: a cap of 4 came back reporting 6 turns. Reported turns run
  // over the cap when a run is cut off and under it when it finishes early,
  // so pricing against them is noise in both directions, not one.
  it('prices against the turns granted, not the turns reported', () => {
    const entries = [entry({ jobClass: 'mason', costUsd: 0.12, turns: 6, turnsAllowed: 4 })];
    expect(costPerTurn(entries, 'mason').usd).toBeCloseTo(0.03, 6);
  });

  // Falling back to reported turns kept the wrong unit alive in the average,
  // so the budget could never fully tighten. A smaller unit-correct sample
  // beats a larger mixed one; with none, the role's own budget stands.
  it('ignores entries written before turnsAllowed existed', () => {
    const entries = [entry({ jobClass: 'mason', costUsd: 0.2, turns: 8 })];
    expect(costPerTurn(entries, 'mason')).toEqual({ samples: 0, usd: 0 });
  });

  it('uses only the unit-correct rows when history is mixed', () => {
    const entries = [
      entry({ jobClass: 'mason', costUsd: 9, turns: 8 }), // old row, ignored
      entry({ jobClass: 'mason', costUsd: 0.2, turnsAllowed: 8 }),
    ];
    expect(costPerTurn(entries, 'mason').samples).toBe(1);
    expect(costPerTurn(entries, 'mason').usd).toBeCloseTo(0.025, 6);
  });

  // D-039. The write-up is a fixed errand on a cheap model, not something the
  // turn budget buys more or less of, so charging it to the session's turns
  // makes every turn look dearer and grants fewer of them. Measured on real
  // rows: a close-out runs 2–5c against a 39c session mean, so this is a
  // ~9% error, not a rounding one.
  it('prices the session alone, not the session plus its write-up', () => {
    const entries = [
      entry({ jobClass: 'mason', costUsd: 0.44, closeOutUsd: 0.04, turnsAllowed: 10 }),
    ];
    // 0.40 of session over 10 turns, not 0.44.
    expect(costPerTurn(entries, 'mason').usd).toBeCloseTo(0.04, 6);
  });

  // Rows written before D-039 carry no split. Treating a missing field as zero
  // is what they meant, and is what keeps the old history usable rather than
  // silently dropping every row that predates the fix.
  it('treats a row with no recorded write-up as all session', () => {
    const entries = [entry({ jobClass: 'mason', costUsd: 0.4, turnsAllowed: 10 })];
    expect(costPerTurn(entries, 'mason').usd).toBeCloseTo(0.04, 6);
  });

  // A killed run can reach the ledger having measured nothing but its own
  // write-up. Its turns are real and its session cost is not known, so
  // counting the turns against a zero would drag the rate toward zero — the
  // same shape as the pooled-shape bug that made the budget unable to bind.
  it('ignores a row whose only measured spend was the write-up', () => {
    const entries = [
      entry({ jobClass: 'mason', costUsd: 0.04, closeOutUsd: 0.04, turnsAllowed: 10 }),
      entry({ jobClass: 'mason', costUsd: 0.4, turnsAllowed: 10 }),
    ];
    expect(costPerTurn(entries, 'mason').samples).toBe(1);
    expect(costPerTurn(entries, 'mason').usd).toBeCloseTo(0.04, 6);
  });

  it('counts failures — a session that died still burnt turns', () => {
    const entries = [
      entry({ jobClass: 'mason', costUsd: 0.2, turnsAllowed: 8, outcome: 'failed', priceUsd: 0 }),
    ];
    expect(costPerTurn(entries, 'mason').samples).toBe(1);
    expect(costPerTurn(entries, 'mason').usd).toBeCloseTo(0.025, 6);
  });

  it('ignores entries that cannot give a rate', () => {
    const entries = [
      entry({ jobClass: 'mason', costUsd: 0, turns: 5 }), // free: no rate
      entry({ jobClass: 'mason', costUsd: 0.5 }), // no turns recorded
      entry({ jobClass: 'other', costUsd: 0.5, turns: 5 }), // another job class
    ];
    expect(costPerTurn(entries, 'mason')).toEqual({ samples: 0, usd: 0 });
  });

  it('keeps tiers apart, since a routed run is not a session', () => {
    const entries = [
      entry({ jobClass: 'mason', tier: 'oneshot', costUsd: 0.1, turnsAllowed: 1 }),
      entry({ jobClass: 'mason', tier: 'session', costUsd: 0.4, turnsAllowed: 8 }),
    ];
    expect(costPerTurn(entries, 'mason', 'session').usd).toBeCloseTo(0.05, 6);
  });

  // The measured cause of a ceiling that never bound: a repo run burnt
  // 7.4c a turn while the same role without one burnt 1.8c, and the pooled
  // average predicted neither of them.
  it('prices a shape of work on the runs that shared its shape', () => {
    const entries = [
      entry({ jobClass: 'mason', costUsd: 0.6, turnsAllowed: 8, hasRepo: true }),
      entry({ jobClass: 'mason', costUsd: 0.14, turnsAllowed: 8, hasRepo: false }),
    ];
    expect(costPerTurn(entries, 'mason', undefined, true).usd).toBeCloseTo(0.075, 6);
    expect(costPerTurn(entries, 'mason', undefined, false).usd).toBeCloseTo(0.0175, 6);
    // Pooled it is neither of them, which is exactly what let an overrun past.
    expect(costPerTurn(entries, 'mason').usd).toBeCloseTo(0.04625, 6);
  });

  it('leaves a row of unrecorded shape out rather than assuming one', () => {
    const entries = [entry({ jobClass: 'mason', costUsd: 0.6, turnsAllowed: 8 })];
    expect(costPerTurn(entries, 'mason', undefined, true)).toEqual({ samples: 0, usd: 0 });
    expect(costPerTurn(entries, 'mason').samples).toBe(1);
  });

  it('reports spend it could not measure rather than counting it as nothing', () => {
    const result = totals([
      entry({ costUsd: 0.2, priceUsd: 0.2 }),
      entry({ outcome: 'failed', costUsd: 0, priceUsd: 0, costUnknown: true }),
    ]);
    expect(result.costUsd).toBe(0.2);
    expect(result.unmeasured).toBe(1);
  });
});
