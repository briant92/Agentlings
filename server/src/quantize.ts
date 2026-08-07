import type { Raster } from './raster';

/**
 * Reducing an image to a fixed palette, so a raster backdrop can be a
 * checkable fact rather than a hope (D-108).
 *
 * The decision that makes this necessary: DB32 governs everything drawn from
 * theme slots — crew, props, scene ops — and **the backdrop layer carries its
 * own palette, budgeted at 128 and dithered**. Snapping a soft-shaded render
 * to 32 colours destroys it; the look D-108 is chasing lives in a hundred-odd
 * shades with dithering between them.
 *
 * Median cut rather than octree or k-means: it is deterministic, it needs no
 * tuning, and a palette that changes between runs would make the budget
 * unverifiable — the whole point is that `pack:check` can assert a number.
 */

/** The budget D-108 set for a backdrop layer. */
export const BACKDROP_COLOURS = 128;

interface Box {
  colours: { rgb: [number, number, number]; count: number }[];
  min: [number, number, number];
  max: [number, number, number];
}

function bounds(colours: Box['colours']): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [255, 255, 255];
  const max: [number, number, number] = [0, 0, 0];
  for (const { rgb } of colours) {
    for (let c = 0; c < 3; c++) {
      if (rgb[c] < min[c]) min[c] = rgb[c];
      if (rgb[c] > max[c]) max[c] = rgb[c];
    }
  }
  return { min, max };
}

/**
 * A palette of at most `max` colours, chosen by median cut.
 *
 * Boxes are split on the axis they are widest in, at the weighted median, and
 * the box chosen to split next is the one with the largest volume × pixel
 * count. Weighting by count matters on exactly the images this is for: a dawn
 * sky is most of the frame and a handful of bright specular pixels are not,
 * and splitting purely on volume spends the budget on the specks.
 */
export function medianCut(raster: Raster, max = BACKDROP_COLOURS): number[] {
  const histogram = new Map<number, number>();
  for (let i = 0; i < raster.w * raster.h; i++) {
    const key =
      (raster.pixels[i * 3] << 16) | (raster.pixels[i * 3 + 1] << 8) | raster.pixels[i * 3 + 2];
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  const colours = [...histogram].map(([key, count]) => ({
    rgb: [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff] as [number, number, number],
    count,
  }));
  if (colours.length <= max) return colours.map((c) => (c.rgb[0] << 16) | (c.rgb[1] << 8) | c.rgb[2]);

  let boxes: Box[] = [{ colours, ...bounds(colours) }];
  while (boxes.length < max) {
    let pick = -1;
    let best = 0;
    for (const [i, box] of boxes.entries()) {
      if (box.colours.length < 2) continue;
      const volume =
        (box.max[0] - box.min[0] + 1) * (box.max[1] - box.min[1] + 1) * (box.max[2] - box.min[2] + 1);
      const weight = volume * box.colours.reduce((a, c) => a + c.count, 0);
      if (weight > best) {
        best = weight;
        pick = i;
      }
    }
    if (pick < 0) break; // every box is a single colour: the image has fewer than `max`
    const box = boxes[pick];
    const axis = [0, 1, 2].reduce((a, c) =>
      box.max[c] - box.min[c] > box.max[a] - box.min[a] ? c : a,
    );
    const sorted = [...box.colours].sort((a, b) => a.rgb[axis] - b.rgb[axis]);
    const total = sorted.reduce((a, c) => a + c.count, 0);
    let running = 0;
    let cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      running += sorted[i].count;
      if (running * 2 >= total) {
        cut = i + 1;
        break;
      }
      cut = i + 2;
    }
    // Both halves must be non-empty. When the *last* colour along the axis
    // holds more than half the pixels — a big flat sky, which is most of what
    // this tool is for — the running total never reaches the median until the
    // final step and `cut` lands past the end. That produced an empty box
    // whose average is 0/0, rounding to #000000, and since a box of one
    // colour never splits again it stayed in the palette: measured on the
    // glasshouse render, **101 of 128 entries were black**, and the budget
    // spent 28 real colours while claiming 128.
    cut = Math.min(Math.max(cut, 1), sorted.length - 1);
    const left = sorted.slice(0, cut);
    const right = sorted.slice(cut);
    boxes = [
      ...boxes.slice(0, pick),
      { colours: left, ...bounds(left) },
      { colours: right, ...bounds(right) },
      ...boxes.slice(pick + 1),
    ];
  }

  return boxes.map((box) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const { rgb, count } of box.colours) {
      r += rgb[0] * count;
      g += rgb[1] * count;
      b += rgb[2] * count;
      n += count;
    }
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  });
}

/** The palette entry closest to a colour, by squared distance in RGB. */
export function nearest(palette: readonly number[], r: number, g: number, b: number): number {
  let best = palette[0] ?? 0;
  let bestD = Infinity;
  for (const entry of palette) {
    const dr = ((entry >> 16) & 0xff) - r;
    const dg = ((entry >> 8) & 0xff) - g;
    const db = (entry & 0xff) - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = entry;
      if (d === 0) break;
    }
  }
  return best;
}

/**
 * The image redrawn in the palette, optionally dithered.
 *
 * Floyd–Steinberg, because the budget is what makes dithering necessary:
 * 128 flat shades across a soft gradient bands visibly, and spreading each
 * pixel's error into its neighbours is what buys back the gradient. D-108
 * specified "budgeted at 128 and dithered" as one thing, not two.
 */
export function applyPalette(raster: Raster, palette: readonly number[], dither = true): Raster {
  const out = new Uint8ClampedArray(raster.pixels.length);
  // Error is carried in full precision alongside the image; writing it back
  // into the 0–255 buffer would clip it away and defeat the diffusion.
  const error = new Float32Array(raster.pixels.length);

  for (let y = 0; y < raster.h; y++) {
    for (let x = 0; x < raster.w; x++) {
      const i = (y * raster.w + x) * 3;
      const r = raster.pixels[i] + (dither ? error[i] : 0);
      const g = raster.pixels[i + 1] + (dither ? error[i + 1] : 0);
      const b = raster.pixels[i + 2] + (dither ? error[i + 2] : 0);
      const picked = nearest(palette, r, g, b);
      out[i] = (picked >> 16) & 0xff;
      out[i + 1] = (picked >> 8) & 0xff;
      out[i + 2] = picked & 0xff;
      if (!dither) continue;
      const de = [r - out[i], g - out[i + 1], b - out[i + 2]];
      const spread = (dx: number, dy: number, share: number): void => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= raster.w || ny >= raster.h) return;
        const j = (ny * raster.w + nx) * 3;
        for (let c = 0; c < 3; c++) error[j + c] += de[c] * share;
      };
      spread(1, 0, 7 / 16);
      spread(-1, 1, 3 / 16);
      spread(0, 1, 5 / 16);
      spread(1, 1, 1 / 16);
    }
  }
  return { pixels: out, w: raster.w, h: raster.h };
}

/**
 * Mean per-channel error between two rasters of the same size, 0–255.
 *
 * The number that says whether the budget cost anything. An impression that
 * "it still looks fine" is exactly what this project keeps catching itself
 * out on, so quantizing reports a figure that can be compared run to run.
 */
export function meanError(a: Raster, b: Raster): number {
  if (a.w !== b.w || a.h !== b.h) throw new Error('rasters differ in size');
  let total = 0;
  for (let i = 0; i < a.pixels.length; i++) total += Math.abs(a.pixels[i] - b.pixels[i]);
  return total / a.pixels.length;
}
