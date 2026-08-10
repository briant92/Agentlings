import { describe, expect, it } from 'vitest';
import { cutNotice } from './cut';

const nothing = { hasWorldDraft: false, patchedFiles: 0, files: null };

describe('cutNotice', () => {
  it('is null for a run no limit stopped — real failures keep their red', () => {
    expect(cutNotice({ ...nothing })).toBeNull();
    expect(
      cutNotice({ hasWorldDraft: true, patchedFiles: 2, files: [{ name: 'RESULT.md', bytes: 9 }] }),
    ).toBeNull();
  });

  it('names the limit that struck, and the turn it struck at', () => {
    expect(cutNotice({ ...nothing, timedOut: true, turns: 23 })).toBe(
      'The clock ended this run at turn 23.',
    );
    expect(cutNotice({ ...nothing, outOfTurns: true, turns: 24 })).toBe(
      'The turn budget ended this run at turn 24.',
    );
    // No streamed turn count — the clause drops rather than guesses.
    expect(cutNotice({ ...nothing, timedOut: true })).toBe('The clock ended this run.');
  });

  it('turns win when both limits are stamped — the carry-on label precedent', () => {
    expect(cutNotice({ ...nothing, outOfTurns: true, timedOut: true, turns: 5 })).toBe(
      'The turn budget ended this run at turn 5.',
    );
  });

  it('says a substantive delivery in the same breath as the cut', () => {
    expect(
      cutNotice({
        outOfTurns: true,
        turns: 21,
        hasWorldDraft: true,
        patchedFiles: 0,
        files: [
          { name: 'PACK.json', bytes: 24_000 },
          { name: 'RESULT.md', bytes: 1_200 },
        ],
      }),
    ).toBe(
      'The turn budget ended this run at turn 21 — below is everything it wrote, including a world draft and its RESULT.md account.',
    );
    expect(
      cutNotice({ ...nothing, timedOut: true, turns: 9, patchedFiles: 3, files: [] }),
    ).toBe(
      'The clock ended this run at turn 9 — below is everything it wrote, including a patch to 3 files.',
    );
    expect(cutNotice({ ...nothing, outOfTurns: true, patchedFiles: 1, files: [] })).toBe(
      'The turn budget ended this run — below is everything it wrote, including a patch to 1 file.',
    );
  });

  it('plain files get the plain sentence; an empty or unloaded sandbox promises nothing', () => {
    expect(
      cutNotice({ ...nothing, outOfTurns: true, turns: 4, files: [{ name: 'notes.txt', bytes: 2 }] }),
    ).toBe('The turn budget ended this run at turn 4 — below is everything it wrote.');
    expect(cutNotice({ ...nothing, timedOut: true, turns: 2, files: [] })).toBe(
      'The clock ended this run at turn 2.',
    );
    expect(cutNotice({ ...nothing, timedOut: true, turns: 2 })).toBe(
      'The clock ended this run at turn 2.',
    );
  });
});
