import { describe, expect, it } from 'vitest';
import type { CrewMember } from '@agentlings/shared';
import { abilitySummary, abilityUse, heldBy, heldSummary, leash, shortModel } from './library';

function member(over: Partial<CrewMember>): CrewMember {
  return {
    id: 'a1',
    name: 'Pip',
    color: 0,
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

describe('heldBy', () => {
  const crew = [
    member({ id: 'a1', name: 'Pip', role: 'worker' }),
    member({ id: 'a2', name: 'Dot', role: 'worker', resting: true }),
    member({ id: 'a3', name: 'Ash', role: 'drafter' }),
  ];

  it('names everyone holding a role, resting or not', () => {
    const held = heldBy(crew);
    expect(held.get('worker')).toEqual(['Pip', 'Dot']);
    expect(held.get('drafter')).toEqual(['Ash']);
    expect(held.get('clerk')).toBeUndefined();
  });

  it('sums the header: held on the level, held by nobody', () => {
    const roles = [{ name: 'worker' }, { name: 'drafter' }, { name: 'clerk' }, { name: 'mason' }];
    expect(heldSummary(roles, heldBy(crew), 'Home Chores')).toBe(
      '2 held on Home Chores · 2 held by nobody',
    );
    expect(heldSummary(roles.slice(0, 2), heldBy(crew), 'Home Chores')).toBe('2 held on Home Chores');
  });
});

describe('leash', () => {
  it('reads the role file, and says nothing when the role sets nothing', () => {
    expect(leash({ maxTurns: 35, timeoutMinutes: 25, maxCostUsd: 5 })).toBe(
      '35 turns · 25 min · up to $5',
    );
    expect(leash({ maxTurns: 6, model: 'claude-haiku-4-5-20251001' })).toBe('6 turns · haiku');
    expect(leash({})).toBe('');
  });

  it('shortens a model id to its family', () => {
    expect(shortModel('claude-sonnet-5')).toBe('sonnet');
    expect(shortModel('something-else')).toBe('something-else');
  });
});

describe('abilityUse', () => {
  const roles = [
    { skills: ['concise-reports', 'cite-sources'] },
    { skills: ['concise-reports'] },
    { skills: ['concise-reports', 'plan-geometry'] },
  ];
  const skills = [{ name: 'plan-geometry' }, { name: 'concise-reports' }, { name: 'ponytail' }, { name: 'cite-sources' }];

  it('counts the jobs that list each ability, most used first, zero included', () => {
    expect(abilityUse(roles, skills)).toEqual([
      { name: 'concise-reports', jobs: 3 },
      { name: 'cite-sources', jobs: 1 },
      { name: 'plan-geometry', jobs: 1 },
      { name: 'ponytail', jobs: 0 },
    ]);
  });

  it('sums the header: the most used, and the ones no job lists', () => {
    expect(abilitySummary(abilityUse(roles, skills))).toBe('concise-reports on 3 jobs · ponytail on none');
    expect(abilitySummary([{ name: 'x', jobs: 1 }])).toBe('x on 1 job');
    expect(abilitySummary([])).toBe('');
  });
});
