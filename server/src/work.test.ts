import { describe, expect, it } from 'vitest';
import type { Agentling, Quote, RoleInfo } from '@agentlings/shared';
import { MatchIndex } from './match';
import {
  continuationBrief,
  planWork,
  pickAgentling,
  queuedJobSpec,
  runnerRole,
  titleFrom,
} from './work';

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

  /**
   * Not an invented class — the class this work is about to be *filed* under.
   * The matcher declining is not the job going unrun: somebody picks it up and
   * the ledger records their role, so pricing it under `null` looks up a class
   * no row carries and finds nothing at all.
   *
   * Measured on the economic-indicators job: matched at 0.24, below the bar, so
   * every one of six quotes fell through to the tier average and said "first
   * time doing this" — while all six runs were recorded under `worker`. The
   * third form of one fault: D-026 and D-029 fixed the class being wrong,
   * `quoteClass` fixed it being the wrong field, this is it being absent.
   */
  it('is the role that will take the work when the matcher names nobody', () => {
    const plan = planWork(index, ROLES, team, '/repo', 'pull the numbers out of my PDFs');
    expect(plan.role).toBeNull();
    expect(plan.agentling).not.toBeNull();
    expect(runnerRole(plan)).toBe(plan.agentling?.role);
  });

  // With nobody to take it there is genuinely nothing to price under, and a
  // guess here would be an invented class rather than an observed one.
  it('stays null when nothing matched and no crew could take it either', () => {
    const plan = planWork(index, ROLES, [], '/repo', 'pull the numbers out of my PDFs');
    expect(plan.role).toBeNull();
    expect(runnerRole(plan)).toBeNull();
  });
});

describe('queuedJobSpec', () => {
  const team = crew(['Pip', 'mason', 'idle'], ['Nib', 'scribe', 'idle']);
  const planFor = (text: string, repoPath?: string) =>
    planWork(index, ROLES, team, repoPath, text);
  const quote = (ceilingUsd: number): Quote => ({
    tier: 'session',
    ceilingUsd,
    samples: 0,
    certainty: 'estimated',
    wording: '',
  });

  // The bug this exists for: POST /jobs queued work with quotedUsd undefined,
  // so turnsForBudget never bound and the run fell back to the role's cap —
  // an unquoted way into a system whose cost story is that the quote binds
  // before the money moves.
  it('always carries the ceiling it was quoted', () => {
    const spec = queuedJobSpec({
      title: 'Write it up',
      prompt: 'write the documentation',
      plan: planFor('write the documentation'),
      quote: quote(0.42),
    });
    expect(spec.quotedUsd).toBe(0.42);
  });

  // Not the same as carrying none by accident: quoteFor returns a zero ceiling
  // only for the tiers that never spend, and every paying tier is bounded
  // below at a cent.
  it('carries no ceiling for work that is free', () => {
    const spec = queuedJobSpec({
      title: 'Say hi',
      prompt: 'say hi',
      plan: planFor('say hi'),
      quote: quote(0),
    });
    expect(spec.quotedUsd).toBeUndefined();
  });

  it('settles the role rather than leaving it to whoever is free', () => {
    const spec = queuedJobSpec({
      title: 'Write it up',
      prompt: 'write the documentation',
      plan: planFor('write the documentation'),
      quote: quote(0.1),
    });
    expect(spec.preferredRole).toBe('scribe');
  });

  it('leaves the role unset when nothing matched, rather than inventing one', () => {
    const spec = queuedJobSpec({
      title: 'Numbers',
      prompt: 'pull the numbers out of my PDFs',
      plan: planFor('pull the numbers out of my PDFs'),
      quote: quote(0.1),
    });
    expect(spec.preferredRole).toBeUndefined();
  });

  // The caller's repository, never the plan's. POST /jobs takes none unless
  // given one, and a spec that quietly substituted the level's would hand
  // every job a clone it never used to get.
  it('takes the repository it was handed, not the one the plan saw', () => {
    const plan = planFor('write the documentation', '/level/repo');
    expect(queuedJobSpec({ title: 't', prompt: 'p', plan, quote: quote(0.1) }).repoPath)
      .toBeUndefined();
    expect(
      queuedJobSpec({ title: 't', prompt: 'p', repoPath: '/mine', plan, quote: quote(0.1) })
        .repoPath,
    ).toBe('/mine');
  });

  it('keeps the title it was given, and passes tools through only when there are some', () => {
    const plan = planFor('write the documentation');
    expect(queuedJobSpec({ title: 'Exactly this', prompt: 'p', plan, quote: quote(0.1) }).title)
      .toBe('Exactly this');
    expect(queuedJobSpec({ title: 't', prompt: 'p', plan, quote: quote(0.1) }).tools)
      .toBeUndefined();
    expect(
      queuedJobSpec({ title: 't', prompt: 'p', tools: ['web'], plan, quote: quote(0.1) }).tools,
    ).toEqual(['web']);
  });
});

/**
 * Stage 2 of the fix for job 97b95f10's whole family: a run that is cut off
 * mid-job should be picked up, not re-run and not made smaller by the user.
 */
describe('continuationBrief', () => {
  const noRepo = {};

  // The brief and the prompt travel separately: a recipe is keyed on
  // normalise(prompt), so a brief folded into the prompt gave a continuation a
  // different key from the job it continues — it banked recipes under compound
  // keys nobody would match, and its runs joined no priced history (D-074).
  it('never carries the request — the job keeps its own prompt', () => {
    expect(continuationBrief({ repoPath: undefined })).not.toContain('summarise');
  });

  // The handover the previous run wrote is better than one composed here, and
  // it is already on disk in the sandbox this job carries forward (D-063).
  it('points at the handover rather than repeating it', () => {
    const text = continuationBrief(noRepo);
    expect(text).toContain('RESULT.md');
    expect(text).toContain('what is still missing');
    expect(text).toContain('rather than starting again');
  });

  it('says what is already there, and that differs by shape', () => {
    expect(continuationBrief(noRepo)).toContain('anything you produced is already here');
    expect(continuationBrief({ repoPath: '/some/repo' })).toContain(
      'the clone already carries the changes',
    );
  });

  // It must ask for the same discipline the first run was given, or the second
  // one saves its write-up for an ending it may not reach either.
  it('asks the next run to keep RESULT.md updated too', () => {
    expect(continuationBrief(noRepo)).toContain('keep RESULT.md updated');
  });
});
