import { describe, expect, it } from 'vitest';
import { CLIP_CHARS, clip, trimToCeiling } from './doorreply';

/**
 * The mechanism two written-here doors share (D-266's Buk, D-267's SII).
 *
 * Each door's own test still holds *its* key, ceiling and words — what is
 * tested here is only the part that would otherwise have been written twice,
 * which is the whole reason this module exists (D-030).
 */
describe('clip', () => {
  it('leaves words a person would read alone', () => {
    expect(clip('  no_authorize  ')).toBe('no_authorize');
    expect(clip('')).toBe('');
  });

  it('cuts at the ceiling and shows that it did', () => {
    const said = clip('x'.repeat(CLIP_CHARS + 50));
    expect(said).toHaveLength(CLIP_CHARS + 1);
    expect(said.endsWith('…')).toBe(true);
  });

  it('takes a ceiling of its own where a door wants one', () => {
    expect(clip('abcdef', 3)).toBe('abc…');
  });
});

describe('trimToCeiling', () => {
  const rows = (n: number, width = 200) =>
    Array.from({ length: n }, (_, i) => ({ id: i, pad: 'X'.repeat(width) }));
  const note = (kept: number, total: number) => `kept ${kept} of ${total}`;

  it('passes a reply that fits through untouched', () => {
    const body = { data: rows(2) };
    expect(JSON.parse(trimToCeiling(body, { ceiling: 40_000, path: ['data'], note }))).toEqual(body);
  });

  it('drops whole records and states the loss', () => {
    const text = trimToCeiling({ data: rows(500) }, { ceiling: 40_000, path: ['data'], note });
    const parsed = JSON.parse(text) as { data: { id: number; pad: string }[]; trimmed: string };
    expect(text.length).toBeLessThanOrEqual(40_000);
    expect(parsed.data.length).toBeGreaterThan(0);
    expect(parsed.data.length).toBeLessThan(500);
    expect(parsed.trimmed).toBe(`kept ${parsed.data.length} of 500`);
    // Whole records, never a cut one.
    for (const row of parsed.data) expect(row.pad).toHaveLength(200);
  });

  it('keeps as many records as actually fit, not a round number of them', () => {
    // The binary search earns its place here: one more record must not fit.
    const text = trimToCeiling({ data: rows(400) }, { ceiling: 20_000, path: ['data'], note });
    const kept = (JSON.parse(text) as { data: unknown[] }).data.length;
    const oneMore = trimToCeiling(
      { data: rows(400).slice(0, kept + 1) },
      { ceiling: Number.MAX_SAFE_INTEGER, path: ['data'], note },
    );
    expect(text.length).toBeLessThanOrEqual(20_000);
    expect(oneMore.length).toBeGreaterThan(20_000);
  });

  it('reaches records nested under a path', () => {
    const parsed = JSON.parse(
      trimToCeiling({ asked: 'x', sii: { pagination: 1, data: rows(500) } }, { ceiling: 40_000, path: ['sii', 'data'], note }),
    ) as { asked: string; sii: { pagination: number; data: unknown[] } };
    expect(parsed.asked).toBe('x');
    // Everything beside the records survives the trim.
    expect(parsed.sii.pagination).toBe(1);
    expect(parsed.sii.data.length).toBeLessThan(500);
  });

  /**
   * The two doors want opposite things here, and both are deliberate: Buk has
   * always handed such a reply back byte-for-byte (#18's own test asserts it),
   * and the SII door says why it could not trim, because its row key is the
   * client's reading of an undocumented facade rather than a measurement.
   */
  it('hands back an untrimmable reply exactly as it came when no words are given', () => {
    const odd = { note: 'y'.repeat(50_000) };
    expect(trimToCeiling(odd, { ceiling: 40_000, path: ['data'], note })).toBe(JSON.stringify(odd, null, 2));
  });

  it('says why it could not trim when words are given', () => {
    const odd = { note: 'y'.repeat(50_000) };
    const parsed = JSON.parse(
      trimToCeiling(odd, { ceiling: 40_000, path: ['data'], note, untrimmable: (chars) => `${chars} characters, no list` }),
    ) as { note: string; trimmed: string };
    expect(parsed.note).toBe(odd.note);
    expect(parsed.trimmed).toMatch(/^\d+ characters, no list$/);
  });

  it('treats a path that leads to something other than a list as no list at all', () => {
    for (const body of [
      { data: 'not a list' },
      { data: null },
      { sii: { data: rows(300) } }, // the right rows, at the wrong path
      {},
    ]) {
      const padded = { ...body, pad: 'z'.repeat(50_000) };
      expect(trimToCeiling(padded, { ceiling: 40_000, path: ['data'], note })).toBe(
        JSON.stringify(padded, null, 2),
      );
    }
  });
});
