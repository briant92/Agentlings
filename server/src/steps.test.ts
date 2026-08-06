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
