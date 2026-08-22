import { describe, expect, it } from 'vitest';
import { lessonParts, memoryEntries, memorySummary, recordParts } from './profile';

/** Ash on Home Chores, 2026-08-22: three lessons and the note one discard banked (D-201). */
const memory = [
  '2026-08-21 · Pixel-level residuals in raster composition exceed geometric precision constraints (job: I want a 3D render of this design…)',
  '2026-08-21 · Verify extracted geometry by re-projecting the 3D model to plan view (job: I want a 3D render of this design…)',
  '2026-08-22 · For blueprint pairing, verify mirror symmetry in wall tilt angles before placement (job: Draw the three office blueprints…)',
];
const discards = [
  '2026-08-22 · my delivery was discarded, not what was wanted (job: Draw the three office blueprints…)',
];

describe('lessonParts', () => {
  it('splits the date, the prose and the job that taught it', () => {
    expect(lessonParts(memory[2])).toEqual({
      date: '08-22',
      text: 'For blueprint pairing, verify mirror symmetry in wall tilt angles before placement',
      job: 'Draw the three office blueprints…',
    });
  });

  it('keeps an unstamped line whole rather than guessing a tag', () => {
    expect(lessonParts('a plain line')).toEqual({ date: null, text: 'a plain line', job: null });
  });
});

describe('memoryEntries (UI.md, step 18)', () => {
  it('lists lessons and discard notes together, newest first, the note tagged', () => {
    const entries = memoryEntries(memory, discards);
    expect(entries.map((e) => [e.kind, e.date])).toEqual([
      ['lesson', '08-22'],
      ['discard', '08-22'],
      ['lesson', '08-21'],
      ['lesson', '08-21'],
    ]);
    expect(entries[1].text).toBe('my delivery was discarded, not what was wanted');
    expect(entries[1].job).toBe('Draw the three office blueprints…');
  });

  it('puts a line with no date last', () => {
    const entries = memoryEntries(['undated', ...memory], []);
    expect(entries[entries.length - 1].text).toBe('undated');
  });

  it('is empty when there is nothing to remember', () => {
    expect(memoryEntries([], [])).toEqual([]);
  });
});

describe('memorySummary', () => {
  it('counts lessons, and discard notes only when there are any', () => {
    expect(memorySummary(3, 1)).toBe('3 lessons · 1 discard note');
    expect(memorySummary(1, 0)).toBe('1 lesson');
    expect(memorySummary(0, 2)).toBe('0 lessons · 2 discard notes');
  });
});

describe('recordParts', () => {
  const line = (parts: { text: string; strong: boolean }[]) => parts.map((p) => p.text).join(' · ');

  it("reads Ash's record as runs, finished on their own, cut short, kept", () => {
    const parts = recordParts({ runs: 7, finished: 2, cut: 5 }, 4);
    expect(line(parts)).toBe('7 runs · 2 finished on their own · 5 cut short · 4 kept');
    expect(parts.map((p) => p.strong)).toEqual([true, false, true, false]);
  });

  it('speaks in the singular when there is one of something', () => {
    expect(line(recordParts({ runs: 1, finished: 1, cut: 1 }, 1))).toBe(
      '1 run · 1 finished on its own · 1 cut short · 1 kept',
    );
  });
});
