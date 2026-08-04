import { describe, expect, it } from 'vitest';
import { cellText } from './documents';

/**
 * The readers themselves are proved where they are used — `preview.test.ts`
 * shows a real .xlsx and .pptx coming back as a grid and slides, and
 * `store.test.ts` shows the same files coming back as passages. What is here
 * is the one piece of judgement they share.
 */
describe('cellText', () => {
  it('shows what the application shows', () => {
    expect(cellText({ formula: 'SUM(A1:A2)', result: 42 })).toBe('42');
    expect(cellText({ text: 'Meridian', hyperlink: 'https://example.com' })).toBe('Meridian');
    expect(cellText({ richText: [{ text: 'bold' }, { text: ' plain' }] })).toBe('bold plain');
    expect(cellText(null)).toBe('');
  });

  it('dates as a day, since that is what a spreadsheet shows', () => {
    expect(cellText(new Date(Date.UTC(2028, 2, 14)))).toBe('2028-03-14');
  });
});
