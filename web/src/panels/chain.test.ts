import { describe, expect, it } from 'vitest';
import type { Delivery, Job } from '@agentlings/shared';
import { chainOf, groupDeliveries, hasNextStep, runningNextStep } from './chain';

function mkJob(id: string, extra: Partial<Job> = {}): Job {
  return {
    id,
    title: id,
    prompt: id,
    status: 'done',
    slot: 0,
    createdAt: 0,
    ...extra,
  };
}

function mkRow(jobId: string, extra: Partial<Delivery> = {}): Delivery {
  return {
    jobId,
    title: jobId,
    who: 'pip',
    at: 0,
    status: 'done',
    outcome: 'to review',
    costUsd: null,
    files: [],
    ...extra,
  };
}

describe('chainOf', () => {
  const s1 = mkJob('s1', { step: { n: 1, of: 3 }, steps: ['b', 'c'] });
  const s2 = mkJob('s2', { step: { n: 2, of: 3 }, steps: ['c'], stepPrev: 's1' });
  const s3 = mkJob('s3', { step: { n: 3, of: 3 }, stepPrev: 's2' });
  const lone = mkJob('lone');
  const jobs = [lone, s3, s1, s2];

  it('finds the whole chain from any member, step 1 first', () => {
    for (const member of [s1, s2, s3]) {
      expect(chainOf(jobs, member).map((j) => j.id)).toEqual(['s1', 's2', 's3']);
    }
  });

  it('a job with no step is its own chain of one', () => {
    expect(chainOf(jobs, lone)).toEqual([lone]);
  });

  it('truncates rather than guesses when a link points at nothing listed', () => {
    // s1 gone — the walk back stops, the walk forward still finds s3.
    expect(chainOf([s2, s3], s2).map((j) => j.id)).toEqual(['s2', 's3']);
  });

  it('a cycle cannot loop it', () => {
    const a = mkJob('a', { step: { n: 1, of: 2 }, stepPrev: 'b' });
    const b = mkJob('b', { step: { n: 2, of: 2 }, stepPrev: 'a' });
    expect(chainOf([a, b], a).map((j) => j.id)).toEqual(['b', 'a']);
  });
});

describe('hasNextStep', () => {
  it('true only for a step something was queued from', () => {
    const jobs = [mkJob('s1'), mkJob('s2', { stepPrev: 's1' })];
    expect(hasNextStep(jobs, 's1')).toBe(true);
    expect(hasNextStep(jobs, 's2')).toBe(false);
  });
});

describe('groupDeliveries', () => {
  it('one card per chain, at its newest member, members in step order', () => {
    // Inbox order: newest first — s2 delivered after the unrelated row.
    const rows = [
      mkRow('s2', { step: { n: 2, of: 2 }, stepPrev: 's1' }),
      mkRow('other'),
      mkRow('s1', { step: { n: 1, of: 2 } }),
    ];
    const groups = groupDeliveries(rows);
    expect(groups.map((g) => g.map((r) => r.jobId))).toEqual([['s1', 's2'], ['other']]);
  });

  it('a member whose sibling fell off the cap stands alone', () => {
    const rows = [mkRow('s2', { step: { n: 2, of: 2 }, stepPrev: 's1' })];
    expect(groupDeliveries(rows).map((g) => g.map((r) => r.jobId))).toEqual([['s2']]);
  });
});

describe('runningNextStep', () => {
  it('names the queued or running successor and nothing settled', () => {
    const queued = mkJob('s2', { status: 'queued', stepPrev: 's1' });
    expect(runningNextStep([queued], 's1')?.id).toBe('s2');
    expect(runningNextStep([mkJob('s2', { status: 'done', stepPrev: 's1' })], 's1')).toBeUndefined();
    expect(runningNextStep(undefined, 's1')).toBeUndefined();
  });
});
