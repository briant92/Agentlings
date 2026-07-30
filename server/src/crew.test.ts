import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Agentling } from '@agentlings/shared';
import { activeCrew, crewMembers, syncRoster } from './crew';
import type { CrewSeed } from './levels';
import { MemoryStore } from './memory';

const ROSTER: CrewSeed[] = [
  { id: 'a1', name: 'Pip', color: 1, role: 'mason', jobsDone: 4, jobsFailed: 1, hiredAt: 100 },
  { id: 'a2', name: 'Dot', color: 2, role: 'scribe', jobsDone: 9, hiredAt: 200, resting: true },
];

function live(over: Partial<Agentling> & { id: string }): Agentling {
  return {
    name: 'Pip',
    color: 1,
    state: 'idle',
    x: 0,
    targetX: 0,
    role: 'mason',
    jobsDone: 0,
    jobsFailed: 0,
    ...over,
  };
}

describe('activeCrew', () => {
  it('leaves resting crew out of the sim', () => {
    expect(activeCrew(ROSTER).map((s) => s.name)).toEqual(['Pip']);
  });
});

describe('syncRoster', () => {
  it('writes the live career back over the record', () => {
    const synced = syncRoster(ROSTER, [live({ id: 'a1', jobsDone: 6, jobsFailed: 2 })]);
    expect(synced[0]).toMatchObject({ jobsDone: 6, jobsFailed: 2 });
  });

  it('leaves a resting member untouched', () => {
    const synced = syncRoster(ROSTER, [live({ id: 'a1', jobsDone: 6 })]);
    expect(synced[1]).toEqual(ROSTER[1]);
  });

  it('keeps a role or hire description changed while awake', () => {
    const synced = syncRoster(ROSTER, [
      live({ id: 'a1', role: 'scout', jobDescription: 'look into things' }),
    ]);
    expect(synced[0].role).toBe('scout');
    expect(synced[0].jobDescription).toBe('look into things');
  });

  it('never drops anyone, however the sim has changed', () => {
    expect(syncRoster(ROSTER, []).map((s) => s.id)).toEqual(['a1', 'a2']);
  });
});

describe('crewMembers', () => {
  const lessons = (name: string) => (name === 'Dot' ? 7 : 2);

  it('shows resting crew with their record intact', () => {
    const dot = crewMembers(ROSTER, [live({ id: 'a1' })], lessons)[1];
    expect(dot).toMatchObject({ name: 'Dot', resting: true, jobsDone: 9, lessons: 7, busy: false });
  });

  it('marks someone mid-job as busy', () => {
    const pip = crewMembers(ROSTER, [live({ id: 'a1', state: 'working' })], lessons)[0];
    expect(pip.busy).toBe(true);
  });

  it('is not busy while merely walking', () => {
    const pip = crewMembers(ROSTER, [live({ id: 'a1', state: 'delivering' })], lessons)[0];
    expect(pip.busy).toBe(false);
  });

  it('defaults a career that predates the roster keeping one', () => {
    const bare: CrewSeed[] = [{ id: 'a3', name: 'Fen', color: 3, role: 'worker' }];
    expect(crewMembers(bare, [], lessons)[0]).toMatchObject({
      jobsDone: 0,
      jobsFailed: 0,
      resting: false,
      hiredAt: 0,
    });
  });
});

describe('memory archive', () => {
  let dir: string;
  let memory: MemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-mem-'));
    memory = new MemoryStore(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('moves lessons aside instead of destroying them', () => {
    memory.append('Bea', 'learned something');
    const target = memory.archive('Bea', new Date('2026-07-30'));

    expect(target).toContain('bea-2026-07-30.md');
    expect(readFileSync(target!, 'utf8')).toContain('learned something');
    expect(memory.lessons('Bea')).toEqual([]); // the app has forgotten her
  });

  it('does not collide when the same name is let go twice in a day', () => {
    memory.append('Bea', 'first life');
    memory.archive('Bea', new Date('2026-07-30'));
    memory.append('Bea', 'second life');
    memory.archive('Bea', new Date('2026-07-30'));

    const archived = readdirSync(path.join(dir, 'archive'));
    expect(archived).toHaveLength(2);
  });

  it('says so when there was nothing to keep', () => {
    expect(memory.archive('Ghost')).toBeNull();
  });
});
