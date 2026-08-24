import { describe, expect, it } from 'vitest';
import type { WorkSpan } from '@agentlings/shared';
import {
  acceptGhost,
  gapClass,
  ghostFor,
  paintClass,
  paintPieces,
  usableSpans,
} from './workSpans';

const span = (start: number, end: number, word: string, category: WorkSpan['category']): WorkSpan => ({
  start,
  end,
  word,
  category,
});

describe('usableSpans', () => {
  const spans = [span(0, 9, 'Reasearch', 'gap-suggestion'), span(14, 18, 'code', 'domain')];

  it('passes spans through when the plan matches the box', () => {
    expect(usableSpans('Reasearch the code', 'Reasearch the code', spans)).toEqual(spans);
  });

  it('shifts offsets by the leading whitespace the server trimmed away', () => {
    const shifted = usableSpans('  Reasearch the code', 'Reasearch the code', spans);
    expect(shifted.map((s) => [s.start, s.end])).toEqual([
      [2, 11],
      [16, 20],
    ]);
    expect('  Reasearch the code'.slice(shifted[0].start, shifted[0].end)).toBe('Reasearch');
  });

  it('paints nothing while the plan lags the keystrokes', () => {
    expect(usableSpans('Reasearch the code now', 'Reasearch the code', spans)).toEqual([]);
    expect(usableSpans('Reasearch the code', 'Reasearch the code', undefined)).toEqual([]);
  });

  it('drops a span whose characters are not where it claims', () => {
    const drifted = [span(0, 9, 'Zzzzzzzzz', 'gap')];
    expect(usableSpans('Reasearch the code', 'Reasearch the code', drifted)).toEqual([]);
  });
});

describe('paintPieces', () => {
  it('cuts the sentence losslessly around the spans', () => {
    const text = 'Reasearch the code';
    const pieces = paintPieces(text, [
      span(0, 9, 'Reasearch', 'gap-suggestion'),
      span(14, 18, 'code', 'domain'),
    ]);
    expect(pieces.map((p) => p.text).join('')).toBe(text);
    expect(pieces).toEqual([
      { text: 'Reasearch', category: 'gap-suggestion' },
      { text: ' the ' },
      { text: 'code', category: 'domain' },
    ]);
  });

  it('a plain sentence is one bare piece — no highlight noise', () => {
    expect(paintPieces('hello there', [])).toEqual([{ text: 'hello there' }]);
  });

  it('maps a category to its overlay class, and bare runs to none', () => {
    expect(paintClass('channel-verb')).toBe('wi-channel-verb');
    expect(paintClass(undefined)).toBeUndefined();
  });
});

describe('ghostFor', () => {
  const spans = [span(0, 7, 'sumarry', 'gap-suggestion'), span(8, 12, 'code', 'domain')];
  const suggestions = [{ word: 'sumarry', suggestion: 'summary', distance: 2 }];

  it('offers the ghost while the caret is in or just past the word', () => {
    for (const caret of [0, 3, 7]) {
      expect(ghostFor(caret, spans, suggestions)).toEqual({
        start: 0,
        end: 7,
        suggestion: 'summary',
      });
    }
  });

  it('offers nothing once the caret has moved on', () => {
    expect(ghostFor(9, spans, suggestions)).toBeNull();
  });

  it('a span without its suggestion, or no suggestions at all, offers nothing', () => {
    expect(ghostFor(3, spans, [])).toBeNull();
    expect(ghostFor(3, spans, undefined)).toBeNull();
    expect(ghostFor(10, [span(8, 12, 'code', 'domain')], suggestions)).toBeNull();
  });

  it('matches the suggestion case-blind, the way the matcher lowered it', () => {
    expect(
      ghostFor(3, [span(0, 7, 'Sumarry', 'gap-suggestion')], suggestions)?.suggestion,
    ).toBe('summary');
  });
});

describe('acceptGhost', () => {
  it('splices the fix in place of the flagged word and parks the caret after it', () => {
    const took = acceptGhost('a sumarry please', { start: 2, end: 9, suggestion: 'summary' });
    expect(took.next).toBe('a summary please');
    expect(took.caret).toBe(9);
  });
});

describe('gapClass', () => {
  const suggestions = [
    { word: 'sumarry', suggestion: 'summary', distance: 2 },
    { word: 'send', suggestion: 'end', distance: 1 },
  ];

  it('a gap with a fix wears the suggestion colour, a bare one the dim grey', () => {
    expect(gapClass('sumarry', [], suggestions)).toBe('wi-gap-suggestion');
    expect(gapClass('pdfs', [], suggestions)).toBe('wi-gap');
    expect(gapClass('pdfs', undefined, undefined)).toBe('wi-gap');
  });

  it('a gap the channel detectors claimed keeps the channel colour, fix ignored', () => {
    // "send" is a catalog gap with a distance-1 near-miss ("end") and the
    // send verb at once; the merged spans already preferred the channel
    // reading, and the line must not contradict them.
    const spans = [span(0, 4, 'send', 'channel-verb')];
    expect(gapClass('send', spans, suggestions)).toBe('wi-channel-verb');
  });
});
