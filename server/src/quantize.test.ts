import { describe, expect, it } from 'vitest';
import {
  applyPalette,
  applyPaletteA,
  BACKDROP_COLOURS,
  histogramOfA,
  meanError,
  medianCut,
  nearest,
  paletteFrom,
} from './quantize';
import { countColours, type Raster, type RasterA } from './raster';

/** A raster from a list of colours, laid out left to right, one row. */
function strip(colours: number[]): Raster {
  const pixels = new Uint8ClampedArray(colours.length * 3);
  colours.forEach((c, i) => {
    pixels[i * 3] = (c >> 16) & 0xff;
    pixels[i * 3 + 1] = (c >> 8) & 0xff;
    pixels[i * 3 + 2] = c & 0xff;
  });
  return { pixels, w: colours.length, h: 1 };
}

/** A smooth horizontal ramp — the shape a backdrop actually has. */
function gradient(w: number, h: number): Raster {
  const pixels = new Uint8ClampedArray(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      pixels[i] = Math.round((x / (w - 1)) * 255);
      pixels[i + 1] = Math.round((y / (h - 1)) * 255);
      pixels[i + 2] = 128;
    }
  }
  return { pixels, w, h };
}

/** Averaged over n×n blocks — a stand-in for looking at it from a distance. */
function blocks(r: Raster, n: number): Raster {
  const w = Math.floor(r.w / n);
  const h = Math.floor(r.h / n);
  const pixels = new Uint8ClampedArray(w * h * 3);
  for (let by = 0; by < h; by++) {
    for (let bx = 0; bx < w; bx++) {
      const acc = [0, 0, 0];
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = ((by * n + y) * r.w + bx * n + x) * 3;
          for (let c = 0; c < 3; c++) acc[c] += r.pixels[i + c];
        }
      }
      for (let c = 0; c < 3; c++) pixels[(by * w + bx) * 3 + c] = acc[c] / (n * n);
    }
  }
  return { pixels, w, h };
}

describe('medianCut', () => {
  it('keeps every colour when the image has fewer than the budget', () => {
    const palette = medianCut(strip([0xff0000, 0x00ff00, 0x0000ff]), 16);
    expect(palette.sort()).toEqual([0x0000ff, 0x00ff00, 0xff0000].sort());
  });

  it('spends the whole budget on an image with plenty of colours', () => {
    const palette = medianCut(gradient(64, 64), 32);
    expect(palette.length).toBe(32);
    expect(new Set(palette).size).toBe(32);
  });

  /**
   * The regression, found by measuring rather than by reading. When the last
   * colour along the split axis holds more than half the pixels — a big flat
   * sky, which is most of what this is for — the running total only reaches
   * the median on the final step, `cut` lands past the end, and the right-hand
   * box comes out empty. Its average is 0/0, which rounds to #000000, and a
   * one-colour box never splits again, so it stays in the palette forever.
   *
   * Measured on a real render: **101 of 128 entries were black**, the output
   * used 28 colours while the budget claimed 128, and the mean error was 8.80
   * where the fix gives 1.10.
   */
  it('never invents a colour the image does not contain', () => {
    // One colour high on the red axis, holding well over half the pixels.
    const dominant = 0xff0000;
    const colours = [dominant, dominant, dominant, dominant, dominant, 0x102030, 0x203040, 0x304050];
    const palette = medianCut(strip(colours), 4);
    const source = new Set(colours);
    for (const entry of palette) {
      expect(source.has(entry), `#${entry.toString(16).padStart(6, '0')} is not in the image`).toBe(
        true,
      );
    }
    expect(palette).not.toContain(0x000000);
  });

  it('never returns more entries than the budget', () => {
    for (const budget of [2, 7, 64, BACKDROP_COLOURS]) {
      expect(medianCut(gradient(40, 40), budget).length).toBeLessThanOrEqual(budget);
    }
  });
});

describe('nearest', () => {
  it('picks the closest palette entry', () => {
    expect(nearest([0x000000, 0xffffff], 250, 250, 250)).toBe(0xffffff);
    expect(nearest([0x000000, 0xffffff], 5, 5, 5)).toBe(0x000000);
  });

  it('measures distance per channel, not by luminance', () => {
    // Pure red and pure green are near-identical in luminance terms but far
    // apart as colours; a backdrop quantized by luminance would go grey.
    expect(nearest([0xff0000, 0x00ff00], 250, 10, 10)).toBe(0xff0000);
  });
});

describe('applyPalette', () => {
  it('emits nothing outside the palette', () => {
    const src = gradient(32, 32);
    const palette = medianCut(src, 8);
    for (const dither of [false, true]) {
      const out = applyPalette(src, palette, dither);
      const allowed = new Set(palette);
      for (let i = 0; i < out.w * out.h; i++) {
        const c = (out.pixels[i * 3] << 16) | (out.pixels[i * 3 + 1] << 8) | out.pixels[i * 3 + 2];
        expect(allowed.has(c)).toBe(true);
      }
    }
  });

  it('honours the budget as a countable fact', () => {
    const src = gradient(50, 50);
    expect(countColours(applyPalette(src, medianCut(src, 16), true))).toBeLessThanOrEqual(16);
  });

  /**
   * What dithering actually trades, measured rather than assumed — my first
   * version of this test asserted the opposite and failed, which is the point.
   *
   * Floyd–Steinberg makes each *pixel* worse: it deliberately pushes a pixel
   * past its true value to carry the residue into its neighbours. What it buys
   * is the *local average*, which is what an eye sees at any distance from the
   * screen. On a smooth ramp cut to 8 colours: per-pixel error 16.15 → 18.12,
   * and 4×4 block error 15.87 → 10.05.
   *
   * D-108 specified "budgeted at 128 and dithered" as one thing, and this is
   * why the two halves are one decision.
   */
  it('makes each pixel worse and the local average much better', () => {
    const src = gradient(80, 80);
    const palette = medianCut(src, 8);
    const flat = applyPalette(src, palette, false);
    const dithered = applyPalette(src, palette, true);

    expect(meanError(src, dithered)).toBeGreaterThan(meanError(src, flat));
    expect(meanError(blocks(src, 4), blocks(dithered, 4))).toBeLessThan(
      meanError(blocks(src, 4), blocks(flat, 4)),
    );
  });

  it('leaves an image that already fits its palette alone', () => {
    const src = strip([0xff0000, 0x00ff00, 0x0000ff]);
    const out = applyPalette(src, medianCut(src, 8), false);
    expect([...out.pixels]).toEqual([...src.pixels]);
  });
});

/** An RGBA raster from [rgb, alpha] pairs, one row. */
function stripA(px: [number, number][]): RasterA {
  const pixels = new Uint8ClampedArray(px.length * 4);
  px.forEach(([c, a], i) => {
    pixels[i * 4] = (c >> 16) & 0xff;
    pixels[i * 4 + 1] = (c >> 8) & 0xff;
    pixels[i * 4 + 2] = c & 0xff;
    pixels[i * 4 + 3] = a;
  });
  return { pixels, w: px.length, h: 1 };
}

describe('the alpha half', () => {
  it('histogramOfA skips the holes and accumulates across files', () => {
    const a = stripA([
      [0xff0000, 255],
      [0x00ff00, 0],
    ]);
    const b = stripA([
      [0xff0000, 255],
      [0x0000ff, 255],
    ]);
    const union = histogramOfA(b, histogramOfA(a));
    // Green was a hole, so the union is red (twice) and blue — the layer's
    // real palette across both files.
    expect([...union.keys()].sort((a, b) => a - b)).toEqual([0x0000ff, 0xff0000]);
    expect(union.get(0xff0000)).toBe(2);
    expect(paletteFrom(union, 8).sort((a, b) => a - b)).toEqual([0x0000ff, 0xff0000]);
  });

  it('applyPaletteA quantizes the pixels and leaves the holes as holes', () => {
    const src = stripA([
      [0xfa0505, 255],
      [0x123456, 0],
      [0x05fa05, 255],
    ]);
    const out = applyPaletteA(src, [0xff0000, 0x00ff00], true);
    expect([...out.pixels.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...out.pixels.subarray(4, 8)]).toEqual([0, 0, 0, 0]);
    expect([...out.pixels.subarray(8, 12)]).toEqual([0, 255, 0, 255]);
  });

  it('never diffuses error across a hole', () => {
    // Grey that must round down, against a black-or-white palette. With an
    // opaque neighbour the pushed-out error brightens it to white; with a
    // hole between them the far pixel must stay black — a hole has no colour
    // to owe or collect.
    const palette = [0x000000, 0xffffff];
    const joined = applyPaletteA(
      stripA([
        [0x646464, 255],
        [0x646464, 255],
      ]),
      palette,
      true,
    );
    expect([...joined.pixels.subarray(4, 8)]).toEqual([255, 255, 255, 255]);

    const cut = applyPaletteA(
      stripA([
        [0x646464, 255],
        [0x646464, 0],
        [0x646464, 255],
      ]),
      palette,
      true,
    );
    expect([...cut.pixels.subarray(4, 8)]).toEqual([0, 0, 0, 0]);
    expect([...cut.pixels.subarray(8, 12)]).toEqual([0, 0, 0, 255]);
  });
});

describe('meanError', () => {
  it('is zero for an identical raster and rises with difference', () => {
    const src = gradient(20, 20);
    expect(meanError(src, src)).toBe(0);
    expect(meanError(src, applyPalette(src, medianCut(src, 2), false))).toBeGreaterThan(0);
  });

  it('falls as the budget rises', () => {
    const src = gradient(60, 60);
    const coarse = meanError(src, applyPalette(src, medianCut(src, 4), true));
    const fine = meanError(src, applyPalette(src, medianCut(src, 64), true));
    expect(fine).toBeLessThan(coarse);
  });

  it('refuses to compare rasters of different sizes', () => {
    expect(() => meanError(gradient(4, 4), gradient(5, 5))).toThrow(/differ in size/);
  });
});
