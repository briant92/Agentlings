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
    expect(splitSteps('read the attached csv and 1. total the rows 2. email Ana')).toBeNull();
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

describe('splitSteps — when it refuses (the never-guess side)', () => {
  it('no marker, no split', () => {
    expect(splitSteps('summarise the expenses csv and email me')).toBeNull();
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
