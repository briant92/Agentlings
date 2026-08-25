import { describe, expect, it } from 'vitest';
import type { Job } from '@agentlings/shared';
import type { LedgerEntry } from './ledger';
import type { Refusal } from './refusals';
import {
  failedRun,
  formatRealWork,
  isProofLevel,
  lastFullWeek,
  realWork,
  resolution,
  type LevelJobs,
} from './realwork';

/** Local midnight, the way a week starts on this machine. */
const day = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime();

// The fixture window: Monday 2026-08-17 to Monday 2026-08-24, local.
const START = day(2026, 8, 17);
const END = day(2026, 8, 24);
const WINDOW = { start: START, end: END };
const IN = day(2026, 8, 19, 10);
const BEFORE = day(2026, 8, 12, 10);
const AFTER = day(2026, 8, 25, 10);

let n = 0;
function job(partial: Partial<Job>): Job {
  n++;
  return {
    id: `j${n}`,
    title: `job ${n}`,
    prompt: 'x',
    status: 'done',
    slot: -1,
    createdAt: BEFORE - 1000,
    ...partial,
  };
}

const row = (levelId: string, at: number, costUsd: number, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  at,
  jobId: `r${++n}`,
  levelId,
  jobClass: 'worker',
  tier: 'session',
  outcome: 'done',
  costUsd,
  priceUsd: costUsd,
  ...extra,
});

const refusal = (levelId: string, at: number, key: string): Refusal => ({ at, levelId, key });
const EMPTY = { files: 0, pdf: 0, images: 0, dirs: [] };

/** Every shape the block must keep apart, one job each, on one real level. */
function fixture(): LevelJobs[] {
  return [
    {
      id: 'hq',
      name: 'HQ',
      jobs: [
        // AC3: ran the week before, approved this week — counts this week.
        job({ status: 'promoted', finishedAt: BEFORE, resolvedAt: IN, resolvedBy: 'you' }),
        // A standing approval's send: the app resolved it, and something went out.
        job({
          status: 'promoted',
          finishedAt: IN,
          resolvedAt: IN,
          resolvedBy: 'app',
          outboxSent: [{ at: IN, channel: 'telegram', sentTo: ['me'], failed: [] }],
        }),
        // A check filed / a hand folded into a gather: the app promoted it, nothing was sent.
        job({ status: 'promoted', finishedAt: IN, resolvedAt: IN, resolvedBy: 'app' }),
        job({ status: 'discarded', finishedAt: IN, resolvedAt: IN, resolvedBy: 'you' }),
        job({ status: 'failed', finishedAt: IN, error: 'boom' }),
        // A failure cleared away by a discard the week after: a failed run in the week it ran, not a discard.
        job({
          status: 'discarded',
          finishedAt: IN,
          resolvedAt: AFTER,
          resolvedBy: 'you',
          error: 'ran out of turns',
          delivered: EMPTY,
        }),
        // A partial turned down: it delivered, so the discard is a verdict on it.
        job({
          status: 'discarded',
          finishedAt: IN,
          resolvedAt: IN,
          resolvedBy: 'you',
          error: 'ran out of turns',
          delivered: { ...EMPTY, files: 2 },
        }),
        // Delivered and nobody looked: not real work, awaiting review.
        job({ status: 'done', finishedAt: IN }),
        // Delivered and carried on (more turns, a reply): decided, not awaiting.
        job({ status: 'done', finishedAt: IN, continuedBy: 'j99' }),
        // Before the stamp existed: a person, at its finish time.
        job({ status: 'promoted', finishedAt: IN }),
        job({ status: 'promoted', finishedAt: BEFORE }),
        // Resolved after the window closed.
        job({ status: 'promoted', finishedAt: IN, resolvedAt: AFTER, resolvedBy: 'you' }),
        // Seen and let go (D-216): no verdict, not counted.
        job({ status: 'cleared', finishedAt: IN, resolvedAt: IN, resolvedBy: 'you' }),
        job({ status: 'running', startedAt: IN }),
      ],
    },
    { id: 'home-chores', name: 'Home chores', jobs: [] },
    {
      id: 'basin-proof',
      name: 'Basin Proof',
      jobs: [job({ status: 'promoted', finishedAt: IN, resolvedAt: IN, resolvedBy: 'you' })],
    },
    {
      id: 'ui-check',
      name: 'UI Check',
      jobs: [job({ status: 'promoted', finishedAt: IN, resolvedAt: IN, resolvedBy: 'app' })],
    },
  ];
}

const LEDGER: LedgerEntry[] = [
  row('hq', IN, 1.5),
  row('hq', IN + 1, 0.25, { outcome: 'failed' }),
  row('hq', BEFORE, 9),
  row('hq', AFTER, 9),
  row('basin-proof', IN, 5),
];

const REFUSALS: Refusal[] = [
  refusal('home-chores', IN, 'money'),
  refusal('home-chores', IN + 1, 'money'),
  refusal('home-chores', IN + 2, 'image'),
  refusal('home-chores', BEFORE, 'money'),
  refusal('d-259-refusals-proof-2', IN, 'sign'),
];

describe('isProofLevel', () => {
  it('excludes a level named for a proof or a check, by id or by name, and nothing else', () => {
    expect(isProofLevel({ id: 'basin-proof', name: 'Basin Proof' })).toBe(true);
    expect(isProofLevel({ id: 'd-248-sweep-quiet-check', name: 'D-248 sweep quiet check' })).toBe(true);
    expect(isProofLevel({ id: 'd-259-refusals-proof-2' })).toBe(true);
    expect(isProofLevel({ id: 'level-7', name: 'Gate proof' })).toBe(true);
    expect(isProofLevel({ id: 'hq', name: 'HQ' })).toBe(false);
    expect(isProofLevel({ id: 'training-ground', name: 'Training ground' })).toBe(false);
    expect(isProofLevel({ id: 'home-chores' })).toBe(false);
    // A word that merely contains the letters is not the name.
    expect(isProofLevel({ id: 'checkout-flow', name: 'Proofreading desk' })).toBe(false);
  });
});

describe('resolution', () => {
  it('reads the stamp when there is one', () => {
    expect(resolution(job({ status: 'promoted', finishedAt: BEFORE, resolvedAt: IN, resolvedBy: 'app' }))).toEqual({
      at: IN,
      by: 'app',
    });
  });

  it('reads a job from before the stamp as resolved by a person at its finish time', () => {
    expect(resolution(job({ status: 'discarded', finishedAt: IN }))).toEqual({ at: IN, by: 'you' });
  });

  it('is null for anything not yet resolved', () => {
    expect(resolution(job({ status: 'done', finishedAt: IN }))).toBeNull();
    expect(resolution(job({ status: 'failed', finishedAt: IN }))).toBeNull();
    expect(resolution(job({ status: 'running' }))).toBeNull();
  });
});

describe('failedRun', () => {
  it('is a failed job, or a discard that carried an error and delivered nothing', () => {
    expect(failedRun(job({ status: 'failed' }))).toBe(true);
    expect(failedRun(job({ status: 'discarded', error: 'x', delivered: EMPTY }))).toBe(true);
    // A discarded partial delivered — files, a folder, or a patch.
    expect(failedRun(job({ status: 'discarded', error: 'x', delivered: { ...EMPTY, pdf: 1 } }))).toBe(false);
    expect(
      failedRun(job({ status: 'discarded', error: 'x', delivered: { ...EMPTY, dirs: [{ name: 'out', files: 3, bytes: 9 }] } })),
    ).toBe(false);
    expect(
      failedRun(job({ status: 'discarded', error: 'x', delivered: EMPTY, changes: { files: 1, added: 2, removed: 0, names: ['a.ts'] } })),
    ).toBe(false);
    // A discarded done job with no files — an answer in RESULT.md — has no error.
    expect(failedRun(job({ status: 'discarded', delivered: EMPTY }))).toBe(false);
    // A sandbox gone before the summary was stamped cannot be told.
    expect(failedRun(job({ status: 'discarded', error: 'x' }))).toBe(false);
    expect(failedRun(job({ status: 'promoted', error: 'x', delivered: EMPTY }))).toBe(false);
  });
});

describe('lastFullWeek', () => {
  it('is the Monday-to-Monday week that ended most recently, local time', () => {
    expect(lastFullWeek(day(2026, 8, 25, 12))).toEqual(WINDOW);
    // A Monday morning still reports the week that just closed.
    expect(lastFullWeek(day(2026, 8, 24, 8))).toEqual(WINDOW);
    // A Sunday night reports the week before the one still open.
    expect(lastFullWeek(day(2026, 8, 23, 23))).toEqual({ start: day(2026, 8, 10), end: START });
  });
});

describe('realWork', () => {
  const block = realWork(WINDOW, fixture(), LEDGER, REFUSALS);
  const hq = block.levels.find((l) => l.levelId === 'hq')!;

  it('counts promoted, auto-sent, discarded, failed and awaiting per real level, by the week of the verdict', () => {
    expect(hq).toMatchObject({
      levelId: 'hq',
      name: 'HQ',
      promoted: 2,
      autoSent: 1,
      discarded: 2,
      failed: 2,
      awaiting: 1,
    });
  });

  it('a failure discarded later is a failed run in the week it ran, never a discard', () => {
    const one = (extra: Partial<Job>) =>
      realWork(
        WINDOW,
        [{ id: 'hq', name: 'HQ', jobs: [job({ status: 'discarded', finishedAt: IN, error: 'x', delivered: EMPTY, ...extra })] }],
        [],
        [],
      ).levels[0]!;
    expect(one({ resolvedAt: AFTER, resolvedBy: 'you' })).toMatchObject({ failed: 1, discarded: 0 });
    // Run before the window, cleared away inside it: nothing this week.
    expect(realWork(WINDOW, [{ id: 'hq', name: 'HQ', jobs: [job({ status: 'discarded', finishedAt: BEFORE, resolvedAt: IN, error: 'x', delivered: EMPTY })] }], [], []).levels).toEqual([]);
  });

  it('a done nobody reviewed is awaiting review, never real work', () => {
    expect(hq.promoted + hq.autoSent).toBe(3);
    const unreviewed = realWork(
      WINDOW,
      [{ id: 'hq', name: 'HQ', jobs: [job({ status: 'done', finishedAt: IN })] }],
      [],
      [],
    ).levels[0]!;
    expect(unreviewed.promoted + unreviewed.autoSent).toBe(0);
    expect(unreviewed.awaiting).toBe(1);
  });

  it('an app promote with nothing sent — a check filed, a hand folded — is not an auto-send and not real work', () => {
    expect(hq.autoSent).toBe(1);
    expect(hq.promoted + hq.autoSent).toBe(3);
  });

  it('sums what the window spent on the level, from the ledger rows inside it', () => {
    expect(hq.spentUsd).toBeCloseTo(1.75, 6);
  });

  it('lists refusals by key, in the window, on real levels only', () => {
    const chores = block.levels.find((l) => l.levelId === 'home-chores')!;
    expect(chores.refusals).toEqual({ money: 2, image: 1 });
    expect(chores).toMatchObject({ promoted: 0, autoSent: 0, discarded: 0, failed: 0, awaiting: 0, spentUsd: 0 });
    expect(block.levels.map((l) => l.levelId)).not.toContain('d-259-refusals-proof-2');
  });

  it('excludes proof and check levels by name, and says which', () => {
    expect(block.levels.map((l) => l.levelId)).toEqual(['hq', 'home-chores']);
    expect(block.excluded).toEqual(['basin-proof', 'd-259-refusals-proof-2', 'ui-check']);
  });

  it('a level the job records do not know, only the ledger or the refusals do, is still a level', () => {
    const b = realWork(WINDOW, [], [row('random', IN, 0.1)], [refusal('bootcamp', IN, 'act')]);
    expect(b.levels.map((l) => [l.levelId, l.name])).toEqual([
      ['bootcamp', 'bootcamp'],
      ['random', 'random'],
    ]);
  });

  it('formats one line per level and one total, from the same block', () => {
    const text = formatRealWork(block);
    expect(text).toContain('2026-08-17');
    expect(text).toContain('2026-08-23');
    expect(text).toMatch(/hq\s+2\s+1\s+2\s+2\s+1\s+\$1\.75/);
    expect(text).toContain('money 2, image 1');
    expect(text).toContain('excluded by name: basin-proof, d-259-refusals-proof-2, ui-check');
    expect(text).toContain('real work: 3 jobs');
  });
});
