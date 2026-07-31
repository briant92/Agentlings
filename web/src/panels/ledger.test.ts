import { describe, expect, it } from 'vitest';
import type { CrewMember, Job } from '@agentlings/shared';
import { entriesFor, outcomeOf, producedBy, tally } from './ledger';

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    title: 'Add tests',
    prompt: 'add tests',
    status: 'done',
    slot: -1,
    createdAt: 0,
    finishedAt: 1000,
    ...over,
  };
}

function member(over: Partial<CrewMember> = {}): CrewMember {
  return {
    id: 'a1',
    name: 'Pip',
    color: 0x6abe30,
    role: 'worker',
    jobsDone: 1,
    jobsFailed: 0,
    hiredAt: 0,
    resting: false,
    busy: false,
    lessons: 0,
    ...over,
  };
}

describe('outcomeOf', () => {
  it('groups by what the user still has to do about it', () => {
    expect(outcomeOf('done')).toBe('to review');
    expect(outcomeOf('partial')).toBe('to review');
    expect(outcomeOf('promoted')).toBe('kept');
    expect(outcomeOf('discarded')).toBe('closed');
    expect(outcomeOf('failed')).toBe('closed');
  });

  it('excludes work that has not finished', () => {
    expect(outcomeOf('queued')).toBeNull();
    expect(outcomeOf('running')).toBeNull();
  });
});

describe('producedBy', () => {
  it('counts a diff', () => {
    const changes = { files: 3, added: 40, removed: 2, names: [] };
    expect(producedBy(job({ changes }))).toBe('3 files · +40 −2');
    expect(producedBy(job({ changes: { ...changes, files: 1 } }))).toBe('1 file · +40 −2');
  });

  it('calls a report a report rather than nothing', () => {
    expect(producedBy(job({ summary: 'A favicon is…' }))).toBe('a written answer');
  });

  it('gives the reason a failure left nothing', () => {
    expect(producedBy(job({ status: 'failed', error: 'cancelled' }))).toBe('cancelled');
  });

  it('says so plainly when there is genuinely nothing', () => {
    expect(producedBy(job({ changes: { files: 0, added: 0, removed: 0, names: [] } }))).toBe(
      'nothing on disk',
    );
  });
});

describe('entriesFor', () => {
  it('leaves live work to the terminal', () => {
    const jobs = [job({ id: 'a', status: 'queued' }), job({ id: 'b', status: 'running' })];
    expect(entriesFor(jobs, [])).toEqual([]);
  });

  it('puts the newest first', () => {
    const jobs = [
      job({ id: 'old', finishedAt: 100 }),
      job({ id: 'new', finishedAt: 900 }),
      job({ id: 'mid', finishedAt: 500 }),
    ];
    expect(entriesFor(jobs, []).map((e) => e.job.id)).toEqual(['new', 'mid', 'old']);
  });

  it('names who did it', () => {
    const [entry] = entriesFor([job({ assignedTo: 'a1' })], [member()]);
    expect(entry.who).toBe('Pip');
  });

  it('still credits someone who has left the crew', () => {
    const [entry] = entriesFor([job({ assignedTo: 'a9' })], [member()]);
    expect(entry.who).toBe('a9');
  });

  it('shows a dash when nobody ever picked it up', () => {
    expect(entriesFor([job()], [])[0].who).toBe('—');
  });

  it('reports a cost only when money was actually spent', () => {
    const free = entriesFor([job({ meter: { routed: true, costUsd: 0 } })], [])[0];
    const paid = entriesFor([job({ meter: { costUsd: 0.13 } })], [])[0];
    const unmeasured = entriesFor([job({ meter: { costUnknown: true } })], [])[0];
    expect(free.costUsd).toBeNull();
    expect(paid.costUsd).toBe(0.13);
    expect(unmeasured.costUsd).toBeNull();
  });
});

describe('tally', () => {
  it('counts what still needs the user, and what it all cost', () => {
    const jobs = [
      job({ id: '1', status: 'done', meter: { costUsd: 0.1 } }),
      job({ id: '2', status: 'partial', meter: { costUsd: 0.2 } }),
      job({ id: '3', status: 'promoted', meter: { costUsd: 0.3 } }),
      job({ id: '4', status: 'running' }),
    ];
    const totals = tally(entriesFor(jobs, []));
    expect(totals.jobs).toBe(3);
    expect(totals.toReview).toBe(2);
    expect(totals.costUsd).toBeCloseTo(0.6, 5);
  });

  it('counts unmeasured runs rather than folding them in as zero', () => {
    const jobs = [
      job({ id: '1', status: 'done', meter: { costUsd: 0.1 } }),
      job({ id: '2', status: 'failed', meter: { costUnknown: true } }),
      job({ id: '3', status: 'failed', meter: { costUnknown: true } }),
    ];
    const totals = tally(entriesFor(jobs, []));
    expect(totals.costUsd).toBeCloseTo(0.1, 5);
    expect(totals.unmeasured).toBe(2);
  });
});
