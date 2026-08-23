import { describe, expect, it } from 'vitest';
import { GRADE_CLASS, WORLD_MARK, hintText, shortReason, worldTally } from './jobboard';

describe('the world half of the positions board', () => {
  it('marks and classes cover the three grades, mapped onto the hand pips', () => {
    expect(WORLD_MARK).toEqual({ covered: '✓', partial: '◐', uncovered: '✕' });
    expect(GRADE_CLASS).toEqual({ covered: 'y', partial: 'p', uncovered: 'n' });
  });

  it('tallies as counts, never a percentage', () => {
    const line = worldTally({ covered: 17, partial: 10, uncovered: 1 });
    expect(line).toBe('covered 17 · partly 10 · not 1');
    expect(line).not.toMatch(/%/);
  });

  it('shows the readable half of a grader reason, and a dashless one whole', () => {
    expect(
      shortReason({ reasons: ['write: reports — Scribe writes and maintains documentation.'] }),
    ).toBe('Scribe writes and maintains documentation.');
    const lexical = 'the words reach scribe at 0.68 (docs) but no recorded power vouches for the duty';
    expect(shortReason({ reasons: [lexical] })).toBe(lexical);
    expect(shortReason({ reasons: [] })).toBe('');
  });

  it('writes the hire hint with counts and the word measured, and stays quiet on nothing', () => {
    expect(
      hintText({
        title: 'Bookkeeping, Accounting, and Auditing Clerks',
        role: 'analyst',
        counts: { covered: 17, partial: 10, uncovered: 1 },
        line: '',
      }),
    ).toBe('the world\'s posting "Bookkeeping, Accounting, and Auditing Clerks" — analyst covers 17 of 28 duties, measured');
    expect(
      hintText({ title: 'Dancers', role: null, counts: { covered: 0, partial: 0, uncovered: 4 }, line: '' }),
    ).toBe('the world\'s posting "Dancers" — 0 of 4 duties covered, measured');
    expect(hintText(null)).toBeNull();
    expect(hintText({ title: 'X', role: null, counts: { covered: 0, partial: 0, uncovered: 0 }, line: '' })).toBeNull();
  });
});
