import { describe, expect, it } from 'vitest';
import { css, DB, nearestDb, snapToPalette } from '@agentlings/shared';

describe('nearestDb', () => {
  it('leaves a colour that is already in the palette alone', () => {
    for (const color of Object.values(DB)) {
      const [r, g, b] = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
      expect(nearestDb(r, g, b)).toBe(color);
    }
  });

  it('snaps a near miss to the entry it was almost', () => {
    // DB.lime is 6abe30; nudge each channel by a couple of steps.
    expect(nearestDb(0x6c, 0xc0, 0x32)).toBe(DB.lime);
  });

  it('sends the extremes where they belong', () => {
    expect(nearestDb(0, 0, 0)).toBe(DB.black);
    expect(nearestDb(255, 255, 255)).toBe(DB.white);
  });

  it('weights green over blue, the way the eye does', () => {
    // Equal RGB distance from lime, but the green-shifted one should win it.
    const greenish = nearestDb(0x6a, 0xc8, 0x30);
    expect(greenish).toBe(DB.lime);
  });
});

describe('snapToPalette', () => {
  it('rewrites off-palette pixels and leaves on-palette ones untouched', () => {
    const pixels = new Uint8ClampedArray([
      0x6c, 0xc0, 0x32, 255, // near-lime, should snap
      0x22, 0x20, 0x34, 255, // exactly DB.ink, should not move
    ]);
    snapToPalette(pixels);
    expect([...pixels.slice(0, 3)]).toEqual([0x6a, 0xbe, 0x30]);
    expect([...pixels.slice(4, 7)]).toEqual([0x22, 0x20, 0x34]);
  });

  it('never touches a fully transparent pixel', () => {
    // Snapping these would tint the edges of anything scaled up later.
    const pixels = new Uint8ClampedArray([9, 9, 9, 0]);
    snapToPalette(pixels);
    expect([...pixels]).toEqual([9, 9, 9, 0]);
  });

  it('is idempotent — art already in the palette survives a second pass', () => {
    const pixels = new Uint8ClampedArray([0x8f, 0x56, 0x3b, 255, 0xd9, 0xa0, 0x66, 200]);
    snapToPalette(pixels);
    const once = [...pixels];
    snapToPalette(pixels);
    expect([...pixels]).toEqual(once);
  });

  it('copes with an empty buffer', () => {
    expect(() => snapToPalette(new Uint8ClampedArray())).not.toThrow();
  });
});

describe('css', () => {
  it('pads short values so the hex is always six digits', () => {
    expect(css(DB.black)).toBe('#000000');
    expect(css(DB.lime)).toBe('#6abe30');
  });
});
