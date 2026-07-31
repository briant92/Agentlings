import { describe, expect, it } from 'vitest';
import type { Agentling, RoleInfo } from '@agentlings/shared';
import { MatchIndex } from './match';
import { planWork, pickAgentling, runnerRole, titleFrom } from './work';

const ROLES: RoleInfo[] = [
  {
    name: 'mason',
    description: 'Builder — implements and refactors code inside the sandbox',
    tools: [],
    skills: [],
  },
  {
    name: 'scribe',
    description: 'Documentation and writing — turns work into words',
    tools: [],
    skills: ['concise-reports'],
  },
];

const index = new MatchIndex(
  ROLES.map((r) => ({ ...r, prompt: r.description })),
  [],
);

function crew(...specs: [string, string, Agentling['state']][]): Agentling[] {
  return specs.map(([name, role, state], i) => ({
    id: `a${i}`,
    name,
    color: 0,
    state,
    x: 0,
    targetX: 0,
    role,
    jobsDone: 0,
    jobsFailed: 0,
  }));
}

describe('titleFrom', () => {
  it('uses the user’s own words', () => {
    expect(titleFrom('add tests for the payment module')).toBe(
      'Add tests for the payment module',
    );
  });

  it('cuts at the first clause', () => {
    expect(titleFrom('update the README, then tell me what changed')).toBe('Update the README');
  });

  it('truncates long sentences at a word boundary', () => {
    const title = titleFrom(
      'go through every single file in the repository and write documentation for all of it',
    );
    expect(title.length).toBeLessThanOrEqual(54);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toMatch(/\s…$/);
  });

  it('drops trailing punctuation and collapses whitespace', () => {
    expect(titleFrom('  fix   the   build.  ')).toBe('Fix the build');
  });

  it('never returns empty', () => {
    expect(titleFrom('   ')).toBe('Untitled job');
  });
});

describe('pickAgentling', () => {
  it('prefers an idle holder of the matched role', () => {
    const team = crew(['Pip', 'mason', 'idle'], ['Dot', 'scribe', 'working'], ['Bea', 'scribe', 'idle']);
    expect(pickAgentling(team, 'scribe')?.name).toBe('Bea');
  });

  it('falls back to a busy holder over an idle stranger', () => {
    const team = crew(['Pip', 'mason', 'idle'], ['Dot', 'scribe', 'working']);
    expect(pickAgentling(team, 'scribe')?.name).toBe('Dot');
  });

  it('falls back to anyone idle when nobody holds the role', () => {
    const team = crew(['Pip', 'mason', 'working'], ['Dot', 'worker', 'idle']);
    expect(pickAgentling(team, 'scribe')?.name).toBe('Dot');
  });

  it('returns null for an empty crew', () => {
    expect(pickAgentling([], 'scribe')).toBeNull();
  });
});

describe('planWork', () => {
  const team = crew(['Pip', 'mason', 'idle'], ['Dot', 'scribe', 'idle']);

  it('routes writing work to the scribe', () => {
    const plan = planWork(index, ROLES, team, '/repo', 'write the documentation for my project');
    expect(plan.role).toBe('scribe');
    expect(plan.agentling?.name).toBe('Dot');
    expect(plan.title).toBe('Write the documentation for my project');
    expect(plan.noOneHasRole).toBe(false);
  });

  it('routes code work to the mason', () => {
    const plan = planWork(index, ROLES, team, '/repo', 'fix the bugs in my code');
    expect(plan.role).toBe('mason');
    expect(plan.agentling?.name).toBe('Pip');
  });

  it('flags work whose specialist was never hired', () => {
    const masonsOnly = crew(['Pip', 'mason', 'idle']);
    const plan = planWork(index, ROLES, masonsOnly, '/repo', 'write the documentation');
    expect(plan.role).toBe('scribe');
    expect(plan.noOneHasRole).toBe(true);
    expect(plan.agentling?.name).toBe('Pip'); // still gets done
  });

  it('asks for a project folder only until the level has been asked', () => {
    expect(planWork(index, ROLES, team, undefined, 'fix the build').needsRepo).toBe(true);
    // '' is a recorded "no folder", not an unanswered question.
    expect(planWork(index, ROLES, team, '', 'fix the build').needsRepo).toBe(false);
    const set = planWork(index, ROLES, team, '/repo', 'fix the build');
    expect(set.needsRepo).toBe(false);
    expect(set.repoPath).toBe('/repo');
  });

  it('still queues work it cannot classify, with the gaps named', () => {
    const plan = planWork(index, ROLES, team, '/repo', 'pull the numbers out of my PDFs');
    expect(plan.role).toBeNull();
    expect(plan.agentling).not.toBeNull();
    expect(plan.gaps).toContain('pdfs');
  });
});

describe('runnerRole', () => {
  const team = crew(['Pip', 'mason', 'idle'], ['Dot', 'scribe', 'idle']);

  it('is the matched role when somebody actually holds it', () => {
    const plan = planWork(index, ROLES, team, '/repo', 'write the documentation for my project');
    expect(plan.role).toBe('scribe');
    expect(runnerRole(plan)).toBe('scribe');
  });

  // The latent bug: a job matched to a role nobody holds is taken by whoever
  // is free and runs as their role, but was priced and filed as the absent
  // specialist — building a history for work that never happened while robbing
  // the role that really did it.
  it('is the role that will take the work when nobody holds the match', () => {
    const masonsOnly = crew(['Pip', 'mason', 'idle']);
    const plan = planWork(index, ROLES, masonsOnly, '/repo', 'write the documentation');
    expect(plan.noOneHasRole).toBe(true);
    expect(plan.role).toBe('scribe');
    expect(runnerRole(plan)).toBe('mason'); // Pip is who actually does it
  });

  it('keeps the matched role when there is no crew to take it', () => {
    const plan = planWork(index, ROLES, [], '/repo', 'write the documentation');
    expect(plan.agentling).toBeNull();
    expect(runnerRole(plan)).toBe('scribe');
  });

  it('stays null for work nothing matched, rather than inventing a class', () => {
    const plan = planWork(index, ROLES, team, '/repo', 'pull the numbers out of my PDFs');
    expect(plan.role).toBeNull();
    expect(runnerRole(plan)).toBeNull();
  });
});
