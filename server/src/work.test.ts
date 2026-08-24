import { describe, expect, it } from 'vitest';
import type { Agentling, Job, Quote, RoleInfo } from '@agentlings/shared';
import { MatchIndex } from './match';
import {
  continuationBrief,
  forceRole,
  planWork,
  pickAgentling,
  queuedJobSpec,
  redoJobSpec,
  replyBrief,
  rosterGapNote,
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

  it('carries the matcher’s spans onto the plan', () => {
    const plan = planWork(index, ROLES, team, '/repo', 'write the documentation');
    expect(plan.spans.some((s) => s.word === 'write' && s.category === 'intent')).toBe(true);
  });

  it('carries the matcher’s typo suggestions onto the plan, beside the gaps', () => {
    const plan = planWork(index, ROLES, team, '/repo', 'write the documentaton for my project');
    expect(plan.suggestions).toContainEqual({
      word: 'documentaton',
      suggestion: 'documentation',
      distance: 1,
    });
  });
});

describe('forceRole', () => {
  it('takes the role the route named over the one the sentence matched', () => {
    const team = crew(['Pip', 'mason', 'idle'], ['Ada', 'designer', 'idle']);
    const matched = planWork(index, ROLES, team, '/repo', 'write the documentation');
    const forced = forceRole(matched, 'designer', team);
    expect(matched.role).toBe('scribe');
    expect(forced.role).toBe('designer');
    expect(forced.agentling?.name).toBe('Ada');
    expect(forced.noOneHasRole).toBe(false);
    expect(forced.confidence).toBe(1);
  });

  /**
   * The whole point of the guard. Forcing a role changes who the plan asks
   * for; it must not change who the quote is priced against, or naming a role
   * nobody holds would quote against a history that will never exist — the
   * fault `runnerRole` was written for, arriving by a new door.
   */
  it('still prices against whoever will really run it when nobody holds the role', () => {
    const team = crew(['Pip', 'mason', 'idle']);
    const forced = forceRole(planWork(index, ROLES, team, '/repo', 'draw me a world'), 'designer', team);
    expect(forced.role).toBe('designer');
    expect(forced.noOneHasRole).toBe(true);
    expect(forced.agentling?.name).toBe('Pip');
    expect(runnerRole(forced)).toBe('mason');
  });

  it('leaves the plan without a taker when there is no crew at all', () => {
    const forced = forceRole(planWork(index, ROLES, [], '/repo', 'draw me a world'), 'designer', []);
    expect(forced.agentling).toBeNull();
    expect(forced.noOneHasRole).toBe(true);
    expect(runnerRole(forced)).toBe('designer');
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

  // The same bug in the same function, for the field a discard has to quote
  // (D-201): a reply is stored on the job so the rejection can say what was
  // asked for, and a field this function does not name is a field that does
  // not exist — spreading it into the call slips past excess-property
  // checking, which is exactly how `send` was lost (D-097).
  it('carries the reply a discard will quote, and nothing when there was none', () => {
    const spec = queuedJobSpec({
      title: 'Review the plan',
      prompt: 'review the plan\n\nThe user replied: fix the alignment',
      plan: planFor('review the plan'),
      quote: quote(0.42),
      reply: 'fix the alignment',
    });
    expect(spec.reply).toBe('fix the alignment');
    expect(
      queuedJobSpec({
        title: 'Review the plan',
        prompt: 'review the plan',
        plan: planFor('review the plan'),
        quote: quote(0.42),
      }).reply,
    ).toBeUndefined();
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

  /**
   * The field this function does not name does not exist, however correct
   * every other layer is. `send` was added to the type, the route, the router
   * and the executor, and jobs still reached the queue without it — because
   * spreading it into this call slips past excess-property checking, so
   * nothing complained anywhere. Two live sessions paid to compose a message
   * the desk was already holding before it was noticed (D-097).
   */
  it('carries the send the desk already holds', () => {
    const spec = queuedJobSpec({
      title: 'Telegram to Brian',
      prompt: 'I need to send a Telegram to Brian',
      plan: planFor('I need to send a Telegram to Brian'),
      quote: quote(0),
      channels: ['telegram'],
      send: { to: 'Brian Thornton — 8633678680', words: 'A DARLE' },
    });
    expect(spec.send).toEqual({ to: 'Brian Thornton — 8633678680', words: 'A DARLE' });
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

  // The newest field through the same trap the ceiling fell into (D-033): the
  // one function that specs a job is exactly where a field silently goes
  // missing, and a send job whose channel is dropped runs as a session that
  // was never told it sends.
  it('carries the channel a send job rides on, and only then', () => {
    const plan = planFor('remind them on telegram');
    expect(
      queuedJobSpec({ title: 't', prompt: 'p', plan, quote: quote(0.1), channels: ['telegram'] })
        .channels?.[0],
    ).toBe('telegram');
    expect('channel' in queuedJobSpec({ title: 't', prompt: 'p', plan, quote: quote(0.1) })).toBe(
      false,
    );
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

  // The handover the previous run wrote is better than one composed here
  // (D-063) — and it rides as PREVIOUS-RESULT.md, since RESULT.md is each
  // leg's own to write. Pointing at the per-leg name was the first paid More
  // Time leg's whole confusion: carryForward had left RESULT.md behind, so
  // the leg read the absence as "the last run never reported" (D-146).
  it('points at the handed-over report, under the name the carry gives it', () => {
    const text = continuationBrief(noRepo);
    expect(text).toContain('PREVIOUS-RESULT.md');
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

  /**
   * The reply door said nothing at all (D-146's other seam): its legs met
   * PREVIOUS-RESULT.md only by listing the sandbox, while the More-turns
   * door pointed straight at it — two doors into one continuation behaving
   * differently for no reason anyone chose.
   */
  it('replyBrief shares the same pointer, without the ran-out framing', () => {
    const text = replyBrief();
    expect(text).toContain('PREVIOUS-RESULT.md');
    expect(text).toContain('rather than starting again');
    expect(text).not.toContain('ran out of turns');
  });
});

/**
 * "Do it properly" (D-097). Only `noRouter` should differ from the job it
 * redoes — four things silently did, and each one left the redone job unable
 * to do the work it was redoing. Tested here rather than through the route
 * for `queuedJobSpec`'s reason: route wiring is not tested, and route wiring
 * is exactly where the day's faults were.
 */
describe('redoJobSpec', () => {
  const job = (over: Partial<Job> = {}): Job => ({
    id: 'j1',
    title: 'Telegram to Brian',
    prompt: 'I need to send a Telegram to Brian',
    status: 'done',
    slot: -1,
    createdAt: 0,
    ...over,
  });

  it('switches the router off — the whole point of asking again', () => {
    expect(redoJobSpec(job(), [], 2, undefined).noRouter).toBe(true);
  });

  // Without it the redone send has no outbox contract in its brief at all,
  // so the run cannot even know it is supposed to be sending.
  it('carries the channel', () => {
    expect(redoJobSpec(job({ channels: ['telegram'] }), [], 2, undefined).channels?.[0]).toBe('telegram');
  });

  it('carries the answers the user already gave', () => {
    const spec = redoJobSpec(
      job({ clarifications: ['Who should this go to? Brian — 8633678680'] }),
      [],
      2,
      undefined,
    );
    expect(spec.clarifications).toEqual(['Who should this go to? Brian — 8633678680']);
  });

  it('carries the standing brief', () => {
    expect(redoJobSpec(job({ brief: 'keep going from what is here' }), [], 2, undefined).brief).toBe(
      'keep going from what is here',
    );
  });

  // "Summarise the attached expenses.csv" with no CSV is a job that can only
  // fail, having been paid for.
  it('carries the attached files, as bytes for the new sandbox', () => {
    const files = [{ name: 'expenses.csv', data: Buffer.from('date,category\n') }];
    expect(redoJobSpec(job(), files, 2, undefined).attachments).toEqual(files);
  });

  /**
   * The one thing that deliberately does not ride. `send` is the input the
   * shortcut consumed: carried, it would brief the run to keep the user's
   * words verbatim — which is what the free compose already did, making the
   * redo a paid way to produce the identical file.
   */
  it('drops the send, so asking properly asks for judgement', () => {
    const spec = redoJobSpec(
      job({ channels: ['telegram'], send: { to: '8633678680', words: 'A DARLE' } }),
      [],
      2,
      undefined,
    );
    expect(spec.send).toBeUndefined();
    expect(spec.channels?.[0]).toBe('telegram');
  });

  it('keeps the role that ran it, and falls back when there was none', () => {
    expect(redoJobSpec(job({ preferredRole: 'scribe' }), [], 2, 'worker').preferredRole).toBe(
      'scribe',
    );
    expect(redoJobSpec(job(), [], 2, 'worker').preferredRole).toBe('worker');
  });

  // Free work carries no ceiling; a redo is never free, so this is really a
  // guard that the quote reached the spec at all (D-027, D-049).
  it('carries the ceiling it was quoted', () => {
    expect(redoJobSpec(job(), [], 1.42, undefined).quotedUsd).toBe(1.42);
    expect(redoJobSpec(job(), [], 0, undefined).quotedUsd).toBeUndefined();
  });
});

/**
 * The chain rides the specs (D-105) — named fields, because a spread past
 * this builder is exactly how a field went missing three times in one day
 * (D-097).
 */
describe('steps ride the specs (D-105)', () => {
  const team = crew(['Pip', 'mason', 'idle']);
  const plan = planWork(index, ROLES, team, undefined, 'summarise the expenses csv');
  const quote: Quote = {
    tier: 'session',
    ceilingUsd: 0.5,
    samples: 3,
    certainty: 'high',
    wording: 'about 50c',
  };

  it('queuedJobSpec carries the remaining steps and the position', () => {
    const spec = queuedJobSpec({
      title: 'T',
      prompt: 'summarise the expenses csv',
      plan,
      quote,
      steps: ['telegram Brian the total'],
      step: { n: 1, of: 2 },
    });
    expect(spec.steps).toEqual(['telegram Brian the total']);
    expect(spec.step).toEqual({ n: 1, of: 2 });
  });

  it('redoJobSpec keeps the chain — redoing a step must not orphan its tail', () => {
    const previous = {
      title: 'T',
      prompt: 'p q',
      steps: ['write it up properly'],
      step: { n: 1, of: 2 },
    } as unknown as Job;
    const spec = redoJobSpec(previous, [], 0.5, 'mason');
    expect(spec.steps).toEqual(['write it up properly']);
    expect(spec.step).toEqual({ n: 1, of: 2 });
  });

  // The link that lets the review show one prompt as one panel (D-233) — a
  // spread past these builders is exactly how a field goes missing (D-097).
  it('both builders carry the chain link', () => {
    const spec = queuedJobSpec({
      title: 'T',
      prompt: 'telegram Brian the total',
      plan,
      quote,
      step: { n: 2, of: 2 },
      stepPrev: 'a1b2c3d4',
    });
    expect(spec.stepPrev).toBe('a1b2c3d4');
    const redone = redoJobSpec(
      { title: 'T', prompt: 'p q', step: { n: 2, of: 2 }, stepPrev: 'a1b2c3d4' } as unknown as Job,
      [],
      0.5,
      'mason',
    );
    expect(redone.stepPrev).toBe('a1b2c3d4');
  });
});

// The feed's half of the roster gap (D-200): the desk card has said it since
// D-192, but a schedule, an inbound message, a chain step or a reply queues
// with no card, and the record said nothing.
describe('rosterGapNote', () => {
  const awake = crew(['Pip', 'worker', 'idle'], ['Moss', 'designer', 'idle']);
  const roster = [
    { name: 'Pip', role: 'worker' },
    { name: 'Moss', role: 'designer' },
    { name: 'Rue', role: 'drafter', resting: true },
  ];

  it('says nothing when someone awake holds the role, or no role was named', () => {
    expect(rosterGapNote(awake, roster, 'designer')).toBeUndefined();
    expect(rosterGapNote(awake, roster, undefined)).toBeUndefined();
  });

  // The 3D-render case (7fb7a9c5): designer matched, no designer hired, a
  // worker took it at the worker's wall and the feed said nothing.
  it('names the role nobody holds and what happens instead', () => {
    expect(rosterGapNote(awake, roster, 'mason')).toBe(
      'no mason is hired here — whoever is free takes this as their own role',
    );
  });

  it('names a resting holder, because then the remedy is waking them, not hiring', () => {
    expect(rosterGapNote(awake, roster, 'drafter')).toBe(
      'your drafter Rue is resting — wake them, or whoever is free takes this as their own role',
    );
    const two = [...roster, { name: 'Kai', role: 'drafter', resting: true }];
    expect(rosterGapNote(awake, two, 'drafter')).toBe(
      'your drafters Rue and Kai are resting — wake them, or whoever is free takes this as their own role',
    );
  });
});
