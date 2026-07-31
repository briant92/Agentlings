import { describe, expect, it } from 'vitest';
import type { Agentling, Job, JobEvent, WorldState } from '@agentlings/shared';
import { activityFor, crewActivity, latestProgress } from './activity';

function agentling(over: Partial<Agentling> = {}): Agentling {
  return {
    id: 'a1',
    name: 'Pip',
    color: 0x6abe30,
    state: 'idle',
    x: 100,
    targetX: 100,
    role: 'worker',
    jobsDone: 0,
    jobsFailed: 0,
    ...over,
  };
}

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    title: 'Add tests for formatUsd',
    prompt: 'add tests',
    status: 'running',
    slot: 0,
    createdAt: 0,
    ...over,
  };
}

function progress(jobId: string, detail: string, id = 1): JobEvent {
  return { id, at: 0, type: 'progress', jobId, title: 't', detail };
}

describe('latestProgress', () => {
  it('keeps only the newest line per job', () => {
    const latest = latestProgress([
      progress('j1', 'cloning C:\\repo', 1),
      progress('j1', 'reading src/ledger.ts', 2),
      progress('j2', 'reading https://example.com', 3),
    ]);
    expect(latest.get('j1')).toBe('reading src/ledger.ts');
    expect(latest.get('j2')).toBe('reading https://example.com');
  });

  it('ignores everything that is not progress', () => {
    const events: JobEvent[] = [
      { id: 1, at: 0, type: 'started', jobId: 'j1', title: 't' },
      { id: 2, at: 0, type: 'done', jobId: 'j1', title: 't', detail: 'all done' },
    ];
    expect(latestProgress(events).size).toBe(0);
  });
});

describe('activityFor', () => {
  const jobs = [job()];

  it('shows the real progress line while working', () => {
    const a = agentling({ state: 'working', jobId: 'j1' });
    const result = activityFor(a, jobs, latestProgress([progress('j1', 'reading src/ledger.ts')]));
    expect(result).toEqual({
      state: 'working',
      title: 'Add tests for formatUsd',
      detail: 'reading src/ledger.ts',
    });
  });

  it('still says something before the first progress line arrives', () => {
    const a = agentling({ state: 'working', jobId: 'j1' });
    expect(activityFor(a, jobs, new Map()).detail).toBe('getting started');
  });

  it('separates the walk out from the walk back', () => {
    const out = activityFor(agentling({ state: 'walking', jobId: 'j1' }), jobs, new Map());
    const back = activityFor(agentling({ state: 'delivering', jobId: 'j1' }), jobs, new Map());
    expect(out.state).toBe('walking');
    expect(back.state).toBe('delivering');
    expect(out.detail).not.toBe(back.detail);
  });

  it('carries no job title when idle', () => {
    const result = activityFor(agentling(), jobs, new Map());
    expect(result.state).toBe('idle');
    expect(result.title).toBeUndefined();
  });

  it('survives a jobId whose job is no longer in the list', () => {
    const a = agentling({ state: 'working', jobId: 'gone' });
    expect(activityFor(a, jobs, new Map())).toEqual({ state: 'working', detail: 'getting started' });
  });
});

describe('crewActivity', () => {
  it('is empty before the first frame arrives', () => {
    expect(crewActivity(null, [])).toEqual([]);
  });

  it('keeps the order the world sends, one entry per agentling', () => {
    const world: WorldState = {
      tick: 1,
      agentlings: [agentling(), agentling({ id: 'a2', name: 'Bramble' })],
      jobs: [job()],
    };
    const rows = crewActivity(world, []);
    expect(rows.map((r) => r.agentling.name)).toEqual(['Pip', 'Bramble']);
  });
});
