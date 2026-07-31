import { describe, expect, it } from 'vitest';
import { DB } from './palette';
import { flatten, GOWN_DARK, GOWN_LIGHT, gownFor, recolourGown, shadeOf } from './tint';

/** RGBA pixel run from a list of 0xRRGGBB colours, all fully opaque. */
function pixels(...colors: number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(colors.length * 4);
  colors.forEach((color, i) => {
    data[i * 4] = (color >> 16) & 0xff;
    data[i * 4 + 1] = (color >> 8) & 0xff;
    data[i * 4 + 2] = color & 0xff;
    data[i * 4 + 3] = 255;
  });
  return data;
}

function colorAt(data: Uint8ClampedArray, i: number): number {
  return (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
}

const PALETTE = new Set<number>(Object.values(DB));

describe('shadeOf', () => {
  it('lands on the palette', () => {
    for (const color of PALETTE) expect(PALETTE.has(shadeOf(color))).toBe(true);
  });

  it('darkens rather than lightens', () => {
    const lum = (c: number) => ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);
    for (const color of [DB.limeLight, DB.sky, DB.tan, DB.rose, DB.cyan, DB.yellow]) {
      expect(lum(shadeOf(color))).toBeLessThan(lum(color));
    }
  });
});

describe('gownFor', () => {
  it('keeps a palette colour exactly', () => {
    expect(gownFor(DB.rose).light).toBe(DB.rose);
  });

  it('snaps a colour that predates the ramp', () => {
    // One of the four original HQ crew, hired before colours came off DB32.
    const { light } = gownFor(0x7bd88f);
    expect(PALETTE.has(light)).toBe(true);
  });

  it('gives the two halves different colours', () => {
    const { light, dark } = gownFor(DB.cyan);
    expect(dark).not.toBe(light);
  });
});

describe('flatten', () => {
  it('paints every visible pixel one colour', () => {
    const data = pixels(DB.lime, DB.blue, DB.sand, DB.ink);
    flatten(data, DB.white);
    for (let i = 0; i < 4; i++) expect(colorAt(data, i)).toBe(DB.white);
  });

  it('keeps transparent pixels transparent', () => {
    const data = pixels(DB.lime, DB.blue);
    data[3] = 0;
    flatten(data, DB.white);
    expect(data[3]).toBe(0);
    expect(colorAt(data, 0)).toBe(DB.lime);
    expect(colorAt(data, 1)).toBe(DB.white);
  });
});

describe('recolourGown', () => {
  it('replaces both gown entries', () => {
    const data = pixels(GOWN_LIGHT, GOWN_DARK);
    recolourGown(data, DB.rose);
    const { light, dark } = gownFor(DB.rose);
    expect(colorAt(data, 0)).toBe(light);
    expect(colorAt(data, 1)).toBe(dark);
  });

  it('leaves hair, skin and outline alone', () => {
    const untouched = [DB.lime, DB.green, DB.sand, DB.tan, DB.ink, DB.brownDark];
    const data = pixels(...untouched);
    recolourGown(data, DB.rose);
    untouched.forEach((color, i) => expect(colorAt(data, i)).toBe(color));
  });

  it('leaves transparent pixels alone', () => {
    const data = pixels(GOWN_LIGHT);
    data[3] = 0;
    recolourGown(data, DB.rose);
    expect(colorAt(data, 0)).toBe(GOWN_LIGHT);
  });

  it('is a no-op for a sheet that uses neither gown colour', () => {
    const pack = [0x123456, 0xabcdef, 0x00ff00];
    const data = pixels(...pack);
    recolourGown(data, DB.rose);
    pack.forEach((color, i) => expect(colorAt(data, i)).toBe(color));
  });
});
