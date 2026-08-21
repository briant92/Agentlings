import { mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { quoteFor, formatUsd, DEFAULT_CEILING_USD } from './estimate';
import {
  append,
  closeOpenRows,
  costPerTurn,
  finalize,
  history,
  interruptedRow,
  ledgerFile,
  ledgerRow,
  openRow,
  priceFor,
  rateFor,
  readLedger,
  repriceChain,
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
  // rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

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
    // "this kind of job", as the name of this test has always said: the class
    // here is a role, and 3 analyst runs are not 3 runs of this job.
    expect(quote.wording).toMatch(/from 3 jobs like it/);
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

describe('absorbed', () => {
  // A tool fall-back finishes `done` at a price of zero: the run succeeded and
  // the app ate it, because the quote had promised free. Keying absorption on
  // the outcome hid 83c across two real jobs and reported the total as though
  // it were complete.
  it('counts spend that was never charged, whatever the outcome says', () => {
    const entries = [
      entry({ outcome: 'done', costUsd: 0.28, priceUsd: 0, toolFellBack: true }),
      entry({ outcome: 'failed', costUsd: 0.1, priceUsd: 0 }),
      entry({ outcome: 'done', costUsd: 0.2, priceUsd: 0.2 }),
    ];
    expect(totals(entries).absorbedUsd).toBeCloseTo(0.38, 6);
    expect(totals(entries).priceUsd).toBeCloseTo(0.2, 6);
  });

  it('adds nothing for work that was free to begin with', () => {
    const entries = [entry({ tier: 'tool', costUsd: 0, priceUsd: 0 })];
    expect(totals(entries).absorbedUsd).toBe(0);
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

/**
 * The builder that turns a finished job into a row.
 *
 * These tests exist because this is the function with a proven habit of
 * dropping fields silently: `closeOutUsd` was declared on the type, set by the
 * executor, described in the spec, and copied here for 79 jobs; `toolFellBack`
 * for two more (D-039). Both were found by reading job files afterwards, which
 * is the expensive way. So every field the meter can carry is pinned here,
 * including the ones that were already working.
 */
describe('ledgerRow', () => {
  const AT = 1_700_000_000_000;
  const row = (
    meter: NonNullable<Parameters<typeof ledgerRow>[0]['meter']>,
    over: Partial<Parameters<typeof ledgerRow>[0]> = {},
  ): LedgerEntry => ledgerRow({ id: 'j1', meter, ...over }, 'hq', 'worker', 'done', AT);

  it('files the run under the role that actually ran it', () => {
    expect(row({ costUsd: 0.3 })).toMatchObject({
      at: AT,
      jobId: 'j1',
      levelId: 'hq',
      jobClass: 'worker',
      tier: 'session',
      outcome: 'done',
      costUsd: 0.3,
      priceUsd: 0.3,
      hasRepo: false,
    });
  });

  it('carries the close-out split the rate depends on', () => {
    expect(row({ costUsd: 0.3, closeOutUsd: 0.02 }).closeOutUsd).toBe(0.02);
  });

  it('carries a tool fall-back, and absorbs the run it caused', () => {
    const entry = row({ costUsd: 0.4, toolFellBack: true }, { quotedUsd: 0 });
    expect(entry.toolFellBack).toBe(true);
    // Quoted free on the strength of a tool that then could not: the app eats it.
    expect(entry.priceUsd).toBe(0);
  });

  it('picks the tier from what actually ran', () => {
    expect(row({ tooled: true }).tier).toBe('tool');
    expect(row({ routed: true }).tier).toBe('routed');
    expect(row({ oneShot: true }).tier).toBe('oneshot');
    expect(row({ costUsd: 0.3 }).tier).toBe('session');
  });

  it('never charges above the quote, and nothing at all for a failure', () => {
    expect(ledgerRow({ id: 'j1', meter: { costUsd: 0.9 }, quotedUsd: 0.5 }, 'hq', 'worker', 'done', AT).priceUsd).toBe(0.5);
    expect(ledgerRow({ id: 'j1', meter: { costUsd: 0.9 } }, 'hq', 'worker', 'failed', AT).priceUsd).toBe(0);
  });

  it('carries the rest of the meter', () => {
    expect(
      row({ costUsd: 0.3, turns: 4, turnsAllowed: 10, model: 'haiku', costUnknown: true, recipeKey: 'k' }),
    ).toMatchObject({
      turns: 4,
      turnsAllowed: 10,
      model: 'haiku',
      costUnknown: true,
      recipeKey: 'k',
    });
    expect(ledgerRow({ id: 'j1', meter: {}, compile: true }, 'hq', 'worker', 'done', AT).compile).toBe(true);
    expect(row({}, { repoPath: '/repo' }).hasRepo).toBe(true);
  });

  // The measurement D-046 is waiting on. Both fields are gated on presence
  // rather than truth, so the uninteresting answers survive to be a denominator.
  describe('the recall measurement', () => {
    it('records a question with nothing on file', () => {
      expect(row({ costUsd: 0.3, asked: true, recallable: 0 })).toMatchObject({
        asked: true,
        recallable: 0,
      });
    });

    it('keeps the negative answers, which are the denominator', () => {
      const entry = row({ costUsd: 0.3, asked: false, recallable: 0 });
      expect(entry.asked).toBe(false);
      expect(Object.hasOwn(entry, 'asked')).toBe(true);
      expect(Object.hasOwn(entry, 'recallable')).toBe(true);
    });

    // An older row is not a run that failed to be a question — it is a run
    // from before anybody was counting, and the two must stay distinguishable.
    it('leaves the fields off entirely when the run was never measured', () => {
      const entry = row({ costUsd: 0.3 });
      expect(Object.hasOwn(entry, 'asked')).toBe(false);
      expect(Object.hasOwn(entry, 'recallable')).toBe(false);
    });
  });

  /**
   * What the turn budget was spent on. The question is whether a run that hit
   * its cap ran out doing the work or checking it, which nothing could answer
   * before: the ledger had turns and cost, and the tool stream died with the
   * process (D-052).
   */
  describe('what the run spent itself on', () => {
    it('records the count and the last tool', () => {
      expect(row({ costUsd: 0.3, toolCalls: 14, lastTool: 'Bash' })).toMatchObject({
        toolCalls: 14,
        lastTool: 'Bash',
      });
    });

    // A session that called nothing is an answer, not a missing measurement.
    it('keeps a count of zero', () => {
      const entry = row({ costUsd: 0.3, toolCalls: 0 });
      expect(entry.toolCalls).toBe(0);
      expect(Object.hasOwn(entry, 'toolCalls')).toBe(true);
    });

    it('leaves both off for a run from before the counter', () => {
      const entry = row({ costUsd: 0.3 });
      expect(Object.hasOwn(entry, 'toolCalls')).toBe(false);
      expect(Object.hasOwn(entry, 'lastTool')).toBe(false);
    });
  });
});

/**
 * D-150: a chain of cut legs whose end promotes charges its legs after the
 * fact — twice it shipped an installed world for $0 (the Iliad $9.29, the
 * Odyssey $6.22). Each leg prices at min(cost, its own quote), marked so a
 * second Approve reprices nothing.
 */
describe('repriceChain', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-reprice-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const cutLeg = (jobId: string, over: Partial<LedgerEntry> = {}): LedgerEntry =>
    entry({ jobId, outcome: 'failed', priceUsd: 0, costUsd: 1.39, quotedUsd: 2, ...over });

  it('prices each named cut leg at min(cost, its own quote)', () => {
    append(root, cutLeg('a'));
    append(root, cutLeg('b', { costUsd: 3.5, quotedUsd: 2 }));
    append(root, entry({ jobId: 'other', outcome: 'failed', priceUsd: 0, costUsd: 0.5 }));
    const result = repriceChain(root, ['a', 'b']);
    expect(result).toEqual({ rows: 2, chargedUsd: 1.39 + 2 });
    const rows = readLedger(root);
    expect(rows.find((r) => r.jobId === 'a')).toMatchObject({ priceUsd: 1.39, chainPriced: true });
    expect(rows.find((r) => r.jobId === 'b')).toMatchObject({ priceUsd: 2, chainPriced: true });
    // A failure outside the chain stays absorbed.
    expect(rows.find((r) => r.jobId === 'other')?.priceUsd).toBe(0);
  });

  it('reprices nothing twice — the marker is the guard', () => {
    append(root, cutLeg('a'));
    repriceChain(root, ['a']);
    expect(repriceChain(root, ['a'])).toEqual({ rows: 0, chargedUsd: 0 });
    expect(readLedger(root).find((r) => r.jobId === 'a')?.priceUsd).toBe(1.39);
  });

  it('leaves unmeasured spend absorbed — a price on an unknown cost is an invention', () => {
    append(root, cutLeg('a', { costUsd: 0, costUnknown: true }));
    expect(repriceChain(root, ['a'])).toEqual({ rows: 0, chargedUsd: 0 });
    expect(readLedger(root).find((r) => r.jobId === 'a')?.priceUsd).toBe(0);
  });

  it('never touches a row that already carries a price or finished done', () => {
    append(root, entry({ jobId: 'a', outcome: 'done', priceUsd: 0.54, costUsd: 0.54 }));
    expect(repriceChain(root, ['a'])).toEqual({ rows: 0, chargedUsd: 0 });
    expect(readLedger(root).find((r) => r.jobId === 'a')?.priceUsd).toBe(0.54);
  });

  it('touches nothing on disk when no row qualifies', () => {
    append(root, entry({ jobId: 'x' }));
    const before = readLedger(root);
    expect(repriceChain(root, ['missing'])).toEqual({ rows: 0, chargedUsd: 0 });
    expect(readLedger(root)).toEqual(before);
  });
});

// The vanish mode (D-199): the only write used to be the completion
// callback, so a process that died under a session left no row at all —
// thirteen times on the real install. A row now opens when the run does.
describe('the row a run opens with', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-open-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const job = { id: 'j1', quotedUsd: 2, repoPath: 'C:/r', assignedTo: 'a9' };
  /** The file as written, open rows included — what readers must not see. */
  const onDisk = (): LedgerEntry[] =>
    readFileSync(ledgerFile(root), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as LedgerEntry);

  it('knows nothing yet: failed, cost zero and unknown, priced nothing, open', () => {
    expect(openRow(job, 'hq', 'designer', 5)).toEqual({
      at: 5,
      jobId: 'j1',
      levelId: 'hq',
      jobClass: 'designer',
      agentlingId: 'a9',
      tier: 'session',
      outcome: 'failed',
      costUsd: 0,
      priceUsd: 0,
      quotedUsd: 2,
      hasRepo: true,
      costUnknown: true,
      open: true,
    });
  });

  it('is hidden from every reader while open — a run in flight is not yet a cost', () => {
    append(root, entry({ jobId: 'done-before' }));
    append(root, openRow(job, 'hq', 'designer', 5));
    expect(onDisk()).toHaveLength(2);
    expect(readLedger(root).map((r) => r.jobId)).toEqual(['done-before']);
    expect(totals(readLedger(root)).unmeasured).toBe(0);
  });

  it('is replaced by the real row at close-out: one row a job, in finish order', () => {
    append(root, entry({ jobId: 'earlier' }));
    append(root, openRow(job, 'hq', 'designer', 5));
    finalize(root, entry({ jobId: 'j1', at: 9, costUsd: 1.2, priceUsd: 1.2 }));
    expect(onDisk().map((r) => [r.jobId, r.open ?? false])).toEqual([
      ['earlier', false],
      ['j1', false],
    ]);
    expect(readLedger(root).find((r) => r.jobId === 'j1')).toMatchObject({
      at: 9,
      costUsd: 1.2,
      outcome: 'done',
    });
  });

  it('close-out with no open row simply appends — nothing was in flight when this landed', () => {
    append(root, entry({ jobId: 'earlier' }));
    finalize(root, entry({ jobId: 'j1' }));
    expect(onDisk().map((r) => r.jobId)).toEqual(['earlier', 'j1']);
  });

  it('closes every row still open at startup as interrupted, and only those', () => {
    append(root, entry({ jobId: 'fine' }));
    append(root, openRow(job, 'hq', 'designer', 5));
    append(root, openRow({ id: 'j2' }, 'hq', 'worker', 6));
    expect(closeOpenRows(root)).toBe(2);
    const rows = readLedger(root);
    expect(rows.map((r) => r.jobId)).toEqual(['fine', 'j1', 'j2']);
    expect(rows[0]).toEqual(entry({ jobId: 'fine' }));
    // The same row the backfill builds from the job record.
    expect(rows[1]).toEqual(interruptedRow(job, 'hq', 'designer', 5));
    expect(rows[1].open).toBeUndefined();
    // Counted where the killed runs always were: unmeasured, "at least".
    expect(totals(rows).unmeasured).toBe(2);
    // Idempotent, and silent when there is nothing to close.
    expect(closeOpenRows(root)).toBe(0);
  });

  it('survives a chain repricing — a rewrite must not drop what readers cannot see', () => {
    append(root, entry({ jobId: 'a', outcome: 'failed', priceUsd: 0, costUsd: 1.39, quotedUsd: 2 }));
    append(root, openRow(job, 'hq', 'designer', 5));
    expect(repriceChain(root, ['a']).rows).toBe(1);
    expect(onDisk().map((r) => r.jobId)).toEqual(['a', 'j1']);
    expect(onDisk()[1].open).toBe(true);
  });
});
