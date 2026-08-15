import { describe, expect, it } from 'vitest';
import { MAX_STEPS, pickForwards, splitSteps, stepBrief } from './steps';

describe('splitSteps — when it splits', () => {
  it('splits on the explicit markers, each part a sentence of its own', () => {
    expect(splitSteps('summarise the expenses csv, then telegram Brian the total')).toEqual([
      'summarise the expenses csv',
      'telegram Brian the total',
    ]);
    expect(splitSteps('list the modules with no tests and then write tests for the worst one')).toEqual([
      'list the modules with no tests',
      'write tests for the worst one',
    ]);
    expect(splitSteps('fetch the pricing page. Then draft a comparison note')).toEqual([
      'fetch the pricing page',
      'draft a comparison note',
    ]);
  });

  it('takes up to MAX_STEPS steps', () => {
    const three = splitSteps('parse the log, then chart the errors, then write a summary');
    expect(three).toHaveLength(3);
    expect(MAX_STEPS).toBe(3);
  });
});

/**
 * The markers past "then", added after the intake benchmark measured four of
 * fifty-one sentences running as one job because the user wrote the order out
 * in ordinary words instead. Each still needs a boundary in front of it, and
 * bare "and" is still not a marker.
 */
describe('splitSteps — the other ways people write a sequence', () => {
  it('splits on "after that", "next", "finally"', () => {
    expect(
      splitSteps('look up this week UF values. After that, write them into a table'),
    ).toEqual(['look up this week UF values', 'write them into a table']);
    expect(
      splitSteps('first read the PDF, next pull out the figures, finally email me a table'),
    ).toEqual(['first read the PDF', 'pull out the figures', 'email me a table']);
  });

  it('splits a hand-numbered list', () => {
    expect(
      splitSteps('1. pull the indicator figures 2. check them against SII 3. telegram me the differences'),
    ).toEqual([
      'pull the indicator figures',
      'check them against SII',
      'telegram me the differences',
    ]);
    expect(splitSteps('1) draft the note 2) send it to Ana')).toEqual([
      'draft the note',
      'send it to Ana',
    ]);
  });

  it('a number that is not a list stays one job', () => {
    // Numbers that do not open the sentence: whatever came before them is
    // instruction too, and a numbered split would drop it silently. Found by
    // mutation — the single-mark case below is refused by a different guard,
    // so it proved nothing about this one.
    // No send in the tail, so this isolates the numbered guard — the version
    // ending "2. email Ana" now splits on its send-"and" (D-182) and would
    // have stopped testing what it says it tests.
    expect(splitSteps('read the attached csv and 1. total the rows 2. check the dates')).toBeNull();
    expect(splitSteps('the plan is 1. draft the note 2. send it to Ana')).toBeNull();
    // One mark is not a list at all.
    expect(splitSteps('reduce the timeout to 1. check nothing hangs')).toBeNull();
    // Out of order, and not starting at one.
    expect(splitSteps('3. do this 7. do that')).toBeNull();
    expect(splitSteps('2. do this 1. do that')).toBeNull();
  });

  it('the words that only look like markers do not split', () => {
    expect(splitSteps('write up the next release notes')).toBeNull();
    expect(splitSteps('summarise the report after that meeting')).toBeNull();
  });
});

/**
 * The one "and" that splits (D-182). Bare "and" was refused three times and
 * still is for almost everything; what changed is that a *send* after it can
 * be told apart from a second object, and that is the split D-105 exists for.
 */
describe('splitSteps — an "and" before a send', () => {
  it('splits work from the send that follows it', () => {
    expect(splitSteps('summarise the expenses csv and telegram Brian the total')).toEqual([
      'summarise the expenses csv',
      'telegram Brian the total',
    ]);
    expect(splitSteps('write them into a table and email it to Ana')).toEqual([
      'write them into a table',
      'email it to Ana',
    ]);
  });

  it('splits inside a worded step too, not only the whole sentence', () => {
    expect(
      splitSteps('look up the UF values. After that, write them into a table and email it to Ana'),
    ).toEqual(['look up the UF values', 'write them into a table', 'email it to Ana']);
  });

  it('leaves a second object alone — the case that kept "and" out for so long', () => {
    expect(splitSteps('summarise the expenses csv and the xlsx')).toBeNull();
    expect(splitSteps('fix the failing test and the lint error')).toBeNull();
  });

  it('leaves two stages of one job alone: a verb after "and" is not enough', () => {
    // The reason the rule is "a send follows", not "a verb follows". Reading
    // and summarising is one job, and splitting it buys nothing — the second
    // step would have to be handed the first one's output to say anything.
    expect(splitSteps('read the report and summarise it')).toBeNull();
    expect(splitSteps('total the rows and chart them')).toBeNull();
  });

  it('two sends are one job on two channels, never two steps (D-179)', () => {
    expect(splitSteps('email it to Ana and telegram me the headline')).toBeNull();
    expect(splitSteps('telegram Pepo the UF and email the same figures to Ana')).toBeNull();
  });

  it('a mentioned channel is not a send — the split needs a real claim', () => {
    // `claimedChannel` is the desk's own gate, so a channel word with no verb
    // beside it splits nothing, exactly as it claims nothing (D-093).
    expect(splitSteps('summarise the expenses csv and the telegram export')).toBeNull();
  });
});

describe('splitSteps — when it refuses (the never-guess side)', () => {
  it('no marker, no split', () => {
    // "…and email me" splits now (D-182) — it is a send after an "and", the
    // one shape that can be told from a second object. Something with no send
    // in it keeps this test about what it was about.
    expect(splitSteps('summarise the expenses csv and the xlsx')).toBeNull();
    expect(splitSteps('write a note about the launch')).toBeNull();
  });

  it('a conditional before the marker is a consequence, not a sequence', () => {
    expect(splitSteps('if the tests pass, then commit the change')).toBeNull();
    expect(splitSteps('when the sync finishes, then write the report')).toBeNull();
    expect(splitSteps('unless it rains, then book the court')).toBeNull();
  });

  it('a conditional after the first marker still splits — it belongs to that step', () => {
    expect(splitSteps('parse the file, then if the totals disagree say so')).toEqual([
      'parse the file',
      'if the totals disagree say so',
    ]);
  });

  it('a torn-off fragment refuses the whole split', () => {
    expect(splitSteps('make it more robust and then some')).toBeNull();
  });

  it('more steps than the cap refuses whole — past that the box is a script', () => {
    expect(
      splitSteps('do a thing, then do more work, then do another pass, then write it up'),
    ).toBeNull();
  });
});

describe('pickForwards', () => {
  it('forwards deliverables and never the paperwork, the outbox or the patch', () => {
    const { take, leftBehind } = pickForwards([
      'RESULT.md',
      'LESSON.md',
      'APPROACH.md',
      'OUTBOX.json',
      'DIFF.patch',
      'summary.xlsx',
      'notes.md',
    ]);
    expect(take).toEqual(['summary.xlsx', 'notes.md']);
    expect(leftBehind).toEqual([]);
  });

  it('caps at the attachment limit minus the report slot, and says what stayed', () => {
    const names = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md'];
    const { take, leftBehind } = pickForwards(names);
    expect(take).toEqual(['a.md', 'b.md', 'c.md', 'd.md']);
    expect(leftBehind).toEqual(['e.md', 'f.md']);
  });

  it('never forwards a file wearing the report alias', () => {
    expect(pickForwards(['previous-step.md', 'real.md']).take).toEqual(['real.md']);
  });
});

describe('stepBrief', () => {
  it('says what came before, where its output is, and to do only this step', () => {
    const brief = stepBrief({
      previousPrompt: 'summarise the expenses csv',
      n: 2,
      of: 2,
      forwarded: ['SUMMARY.md'],
      leftBehind: [],
      hadReport: true,
    });
    expect(brief).toContain('Step 2 of 2');
    expect(brief).toContain('"summarise the expenses csv"');
    expect(brief).toContain('input/previous-step.md');
    expect(brief).toContain('SUMMARY.md');
    expect(brief).toContain('Do only this step');
  });

  it('is honest about a bare handover and about what stayed behind', () => {
    const brief = stepBrief({
      previousPrompt: 'x y',
      n: 3,
      of: 3,
      forwarded: [],
      leftBehind: ['huge.bin'],
      hadReport: false,
    });
    expect(brief).toContain('no report');
    expect(brief).toContain('no files');
    expect(brief).toContain('huge.bin');
  });
});
