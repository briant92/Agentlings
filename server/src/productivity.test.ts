import type { CrewMember, Job } from '@agentlings/shared';
import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from './ledger';
import {
  cheaperClasses,
  isJournal,
  nowFreeRuns,
  productivityOf,
  signalFor,
  spendOf,
} from './productivity';

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    at: 1,
    jobId: 'j',
    levelId: 'hq',
    jobClass: 'worker',
    tier: 'session',
    outcome: 'done',
    costUsd: 0.1,
    priceUsd: 0.1,
    ...over,
  };
}

function member(over: Partial<CrewMember> = {}): CrewMember {
  return {
    id: 'a1',
    name: 'Pip',
    color: 0x99e550,
    role: 'worker',
    jobsDone: 0,
    jobsFailed: 0,
    hiredAt: 0,
    resting: false,
    busy: false,
    lessons: 0,
    ...over,
  };
}

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j',
    title: 't',
    prompt: 'p',
    status: 'done',
    slot: -1,
    createdAt: 1,
    ...over,
  };
}

describe('signalFor', () => {
  it('is green below half the quote, amber to 85%, red above', () => {
    expect(signalFor(0.49)).toBe('green');
    expect(signalFor(0.5)).toBe('amber');
    expect(signalFor(0.85)).toBe('amber');
    expect(signalFor(0.86)).toBe('red');
  });

  it('is green when nothing was ever quoted', () => {
    // Nothing quoted is nothing overspent. Amber here would light up every
    // new hire for the crime of not having been quoted yet.
    expect(signalFor(null)).toBe('green');
  });

  it('is red for a run that cost more than its quote', () => {
    expect(signalFor(1.4)).toBe('red');
  });
});

describe('isJournal', () => {
  it('knows the four lines the app writes about itself', () => {
    expect(isJournal('2026-07-30 · delivered "Survey the caverns" as scout')).toBe(true);
    expect(isJournal('2026-07-30 · failed "Break rocks" as worker — API Error: 401')).toBe(true);
    expect(isJournal('2026-07-30 · merged with Dot, who delivered 0')).toBe(true);
    expect(isJournal('2026-07-30 · hired to: keep an eye on my repo')).toBe(true);
  });

  it('keeps a lesson that opens on the same words', () => {
    // The quote mark is the whole distinction: the journal always names a job,
    // and a session writing about failure writes prose. Matching on the bare
    // verb would file this — a real lesson, hard won — as bookkeeping.
    expect(
      isJournal('2026-07-31 · failed runs usually mean the repo was never cloned; check first'),
    ).toBe(false);
    expect(isJournal('2026-07-31 · A probe job is a liveness check, not a puzzle')).toBe(false);
  });

  it('reads a line that lost its date', () => {
    expect(isJournal('delivered "x" as worker')).toBe(true);
  });
});

describe('cheaperClasses', () => {
  it('compares halves rather than endpoints', () => {
    // Falling overall, but the last run is the dearest of the four. Read off
    // first-against-last this class is getting worse; it plainly is not.
    const rows = [
      entry({ at: 1, costUsd: 0.4 }),
      entry({ at: 2, costUsd: 0.4 }),
      entry({ at: 3, costUsd: 0.1 }),
      entry({ at: 4, costUsd: 0.3 }),
    ];
    expect(cheaperClasses(rows)).toEqual({ repeated: 1, cheaper: 1 });
  });

  it('orders by time, not by the order it was handed', () => {
    const rows = [entry({ at: 9, costUsd: 0.1 }), entry({ at: 1, costUsd: 0.5 })];
    expect(cheaperClasses(rows).cheaper).toBe(1);
  });

  it('does not count a class run only once', () => {
    expect(cheaperClasses([entry()])).toEqual({ repeated: 0, cheaper: 0 });
  });

  it('splits by recipe where there is one, not by role', () => {
    // Two different jobs both run by the worker role. Pooling them under the
    // role would invent a trend out of two unrelated prices.
    const rows = [
      entry({ at: 1, recipeKey: 'a', costUsd: 0.1 }),
      entry({ at: 2, recipeKey: 'b', costUsd: 0.9 }),
    ];
    expect(cheaperClasses(rows)).toEqual({ repeated: 0, cheaper: 0 });
  });

  it('ignores free runs so a graduated tool is not counted twice', () => {
    const rows = [
      entry({ at: 1, costUsd: 0.5 }),
      entry({ at: 2, costUsd: 0.5 }),
      entry({ at: 3, costUsd: 0, tier: 'tool' }),
    ];
    // Two paid runs at the same price: no trend. The free one belongs to
    // nowFreeRuns, and letting it in here would report every graduation twice.
    expect(cheaperClasses(rows)).toEqual({ repeated: 1, cheaper: 0 });
  });
});

describe('nowFreeRuns', () => {
  it('counts free runs of work that used to be paid for', () => {
    const rows = [
      entry({ jobClass: 'w', costUsd: 0.5 }),
      entry({ jobClass: 'w', costUsd: 0, priceUsd: 0, tier: 'tool' }),
      entry({ jobClass: 'w', costUsd: 0, priceUsd: 0, tier: 'routed' }),
    ];
    expect(nowFreeRuns(rows)).toBe(2);
  });

  it('ignores work that was never paid for', () => {
    // A router answering something no session ever ran is not the crew
    // getting cheaper — it is a question that was always free.
    const rows = [entry({ jobClass: 'chat', costUsd: 0, priceUsd: 0, tier: 'routed' })];
    expect(nowFreeRuns(rows)).toBe(0);
  });
});

describe('spendOf', () => {
  const rows = [
    entry({ agentlingId: 'a1', costUsd: 0.2, quotedUsd: 1 }),
    entry({ agentlingId: 'a1', costUsd: 0.6, quotedUsd: 1 }),
    entry({ agentlingId: 'a2', costUsd: 5, quotedUsd: 1 }),
  ];

  it('counts only the rows that name them', () => {
    const spend = spendOf(member(), rows);
    expect(spend.jobs).toBe(2);
    expect(spend.costUsd).toBeCloseTo(0.8);
    expect(spend.ratio).toBeCloseTo(0.4);
    expect(spend.signal).toBe('green');
  });

  it('leaves unquoted runs out of the ratio but not out of the spend', () => {
    // Counting an unquoted run as nothing-against-nothing would make a member
    // look thriftier for every run nobody priced.
    const spend = spendOf(member(), [...rows, entry({ agentlingId: 'a1', costUsd: 3 })]);
    expect(spend.costUsd).toBeCloseTo(3.8);
    expect(spend.priced).toBe(2);
    expect(spend.ratio).toBeCloseTo(0.4);
  });

  it('reports no ratio at all when nothing of theirs was quoted', () => {
    const spend = spendOf(member(), [entry({ agentlingId: 'a1', costUsd: 3 })]);
    expect(spend.ratio).toBeNull();
    expect(spend.signal).toBe('green');
  });

  it('counts a run stopped a hair under its ceiling as capped', () => {
    // The ceiling is enforced by killing the session, so a capped run lands
    // just under as often as on the nose. An exact test would miss most.
    const spend = spendOf(member(), [entry({ agentlingId: 'a1', costUsd: 0.999, quotedUsd: 1 })]);
    expect(spend.atCeiling).toBe(1);
  });

  it('does not call a cheap run capped', () => {
    expect(spendOf(member(), [entry({ agentlingId: 'a1', costUsd: 0.2, quotedUsd: 1 })]).atCeiling)
      .toBe(0);
  });
});

describe('productivityOf', () => {
  const crew = [member(), member({ id: 'a2', name: 'Ivy' })];
  const lessons = (name: string) =>
    name === 'Pip'
      ? ['2026-07-30 · delivered "x" as worker', '2026-07-31 · Read the file before editing it']
      : ['2026-07-30 · merged with Dot, who delivered 0'];

  it('adds up the ledger and splits the memory', () => {
    const rows = [
      entry({ agentlingId: 'a1', costUsd: 0.2, priceUsd: 0.2 }),
      entry({ agentlingId: 'a2', costUsd: 0.5, priceUsd: 0, outcome: 'failed' }),
    ];
    const out = productivityOf(rows, [], crew, lessons);
    expect(out.jobs).toBe(2);
    expect(out.costUsd).toBeCloseTo(0.7);
    expect(out.priceUsd).toBeCloseTo(0.2);
    expect(out.absorbedUsd).toBeCloseTo(0.5);
    expect(out.lessons).toBe(3);
    expect(out.journal).toBe(2);
  });

  it('counts a partial as delivered', () => {
    // The run that exhausted its turns holding a finished diff is the one most
    // worth reviewing, and the ledger files it as a failure. Reading delivery
    // off the ledger would undercount by exactly those.
    const out = productivityOf(
      [entry({ outcome: 'failed' })],
      [job({ status: 'partial' }), job({ id: 'k', status: 'failed' })],
      [],
      () => [],
    );
    expect(out.delivered).toBe(1);
  });

  it('counts promoted and done, and not discarded', () => {
    const jobs = [
      job({ id: 'a', status: 'promoted' }),
      job({ id: 'b', status: 'done' }),
      job({ id: 'c', status: 'discarded' }),
      job({ id: 'd', status: 'running' }),
    ];
    expect(productivityOf([], jobs, [], () => []).delivered).toBe(2);
  });

  it('absorbs a tool fall-back, which finished done and was never billed', () => {
    // Keyed on the outcome this reads zero, and 83c of deliberate absorption
    // goes missing from a total that then calls itself complete.
    const rows = [entry({ outcome: 'done', costUsd: 0.4, priceUsd: 0, toolFellBack: true })];
    expect(productivityOf(rows, [], [], () => []).absorbedUsd).toBeCloseTo(0.4);
  });

  it('reports what it cannot attribute rather than hiding it', () => {
    const rows = [
      entry({ agentlingId: 'a1', costUsd: 1 }),
      entry({ costUsd: 0.25 }),
      entry({ costUsd: 0.25 }),
    ];
    const out = productivityOf(rows, [], crew, () => []);
    expect(out.unattributed).toBe(2);
    expect(out.unattributedUsd).toBeCloseTo(0.5);
    // The crew's spending plus the orphans is the level's whole spend — the
    // property that makes the gap a stated hole rather than a silent one.
    const attributed = out.crew.reduce((sum, m) => sum + m.costUsd, 0);
    expect(attributed + out.unattributedUsd).toBeCloseTo(out.costUsd);
  });

  it('keeps resting crew, who still spent what they spent', () => {
    const rows = [entry({ agentlingId: 'a2', costUsd: 2 })];
    const out = productivityOf(rows, [], [member(), member({ id: 'a2', resting: true })], () => []);
    expect(out.crew.find((m) => m.id === 'a2')?.costUsd).toBe(2);
    expect(out.unattributedUsd).toBe(0);
  });

  it('counts both free tiers as free', () => {
    const rows = [
      entry({ tier: 'routed', costUsd: 0, priceUsd: 0 }),
      entry({ tier: 'tool', costUsd: 0, priceUsd: 0 }),
      entry({ tier: 'oneshot' }),
    ];
    expect(productivityOf(rows, [], [], () => []).free).toBe(2);
  });

  it('carries unmeasured runs instead of folding them in as zero', () => {
    const rows = [entry({ costUnknown: true, costUsd: 0 })];
    expect(productivityOf(rows, [], [], () => []).unmeasured).toBe(1);
  });
});
