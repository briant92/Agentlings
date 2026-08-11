// Reduces an image to a backdrop-sized palette, and shows the crew standing on it.
//   npm run pack:quantize -- source.png [out.png] [--colors 128] [--no-dither]
//   npm run pack:quantize -- far.png mid.png near.png [--colors 128] [--no-dither]
//
// D-108 decided the backdrop layer carries its own palette, budgeted at 128
// and dithered, because snapping a soft-shaded render to DB32's 32 colours
// destroys it. This makes that budget a checkable fact — and it tests D-108's
// own predicted cost, which has never been measured: "flat 32-colour sprites
// on a soft-shaded render will read as pasted on".
//
// So it writes two files: the quantized image, and a `-crew` preview with
// gown-coloured stand-ins and the mandatory rim over it, at the seven places
// agentlings actually stand. Looking at the second one is the point.
//
// Given SEVERAL images it cuts ONE palette across their union and applies it
// to each — the fix the checker names when a stack of plates is inside
// budget file by file and over it together (v2: the budget is the layer's).
// Cut-outs keep their holes; each output lands beside its source as
// `<name>.<colours>.png`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EXIT_X, MAX_STATIONS, SPAWN_X, STATION_BASE_X, STATION_SPACING } from '@agentlings/shared';
import { COLOR_POOL } from '../server/src/levels';
import {
  applyPalette,
  applyPaletteA,
  BACKDROP_COLOURS,
  histogramOfA,
  meanError,
  medianCut,
  paletteFrom,
} from '../server/src/quantize';
import {
  alphaStats,
  binariseAlpha,
  countColours,
  countColoursA,
  decodePng,
  decodePngA,
  drawStandIn,
  encodePng,
  encodePngA,
  separationAt,
  surfaceOn,
} from '../server/src/raster';

const args = process.argv.slice(2);
const flag = (name: string): number => args.indexOf(name);
const colorsAt = flag('--colors');
const colours = colorsAt >= 0 ? Number(args[colorsAt + 1]) || BACKDROP_COLOURS : BACKDROP_COLOURS;
const dither = flag('--no-dither') < 0;
const positional = args.filter(
  (a, i) => !a.startsWith('--') && !(colorsAt >= 0 && i === colorsAt + 1),
);
const target = positional[0];

if (!target || !existsSync(target)) {
  console.error(
    'Usage: npm run pack:quantize -- source.png [out.png] [--colors 128] [--no-dither]\n' +
      '       npm run pack:quantize -- far.png mid.png … (one palette across all)',
  );
  process.exit(1);
}

// The joint mode: every positional is a source, one palette rules them all.
const sources = positional.filter((p) => p.toLowerCase().endsWith('.png') && existsSync(p));
if (sources.length > 1) {
  const files = sources.map((file) => {
    const raster = decodePngA(readFileSync(file));
    const snapped = binariseAlpha(raster);
    return { file, raster, snapped, before: countColoursA(raster) };
  });
  const union = new Map<number, number>();
  for (const { raster } of files) histogramOfA(raster, union);
  const palette = paletteFrom(union, colours);

  console.log(`One palette across ${files.length} files — union ${union.size} → budget ${colours}`);
  const after = new Map<number, number>();
  for (const { file, raster, snapped, before } of files) {
    const quantized = applyPaletteA(raster, palette, dither);
    histogramOfA(quantized, after);
    const stats = alphaStats(quantized);
    const out = file.replace(/\.png$/i, `.${colours}.png`);
    // Fully opaque sources go back out as plain truecolour, the shape an
    // opaque back plate is checked as; cut-outs keep their alpha.
    if (stats.transparent === 0) {
      const rgb = new Uint8ClampedArray(quantized.w * quantized.h * 3);
      for (let i = 0; i < quantized.w * quantized.h; i++) {
        rgb[i * 3] = quantized.pixels[i * 4];
        rgb[i * 3 + 1] = quantized.pixels[i * 4 + 1];
        rgb[i * 3 + 2] = quantized.pixels[i * 4 + 2];
      }
      writeFileSync(out, encodePng({ pixels: rgb, w: quantized.w, h: quantized.h }));
    } else {
      writeFileSync(out, encodePngA(quantized));
    }
    console.log(
      `  ${path.basename(file)} ${before} → ${countColoursA(quantized)} colours` +
        (snapped > 0 ? ` (${snapped} soft-alpha pixels snapped)` : '') +
        `  wrote ${out}`,
    );
  }
  console.log(`  union after: ${after.size} — point PACK.json at the new files or rename them back`);
  process.exit(0);
}

const source = decodePng(readFileSync(target));
const before = countColours(source);
const palette = medianCut(source, colours);
const quantized = applyPalette(source, palette, dither);
const after = countColours(quantized);

const out = positional[1] ?? target.replace(/\.png$/i, `.${colours}.png`);
writeFileSync(out, encodePng(quantized));

console.log(`${path.basename(target)} — ${source.w}×${source.h}`);
console.log(`  colours ${before} → ${after}   (budget ${colours}, dither ${dither ? 'on' : 'off'})`);
console.log(`  mean error ${meanError(source, quantized).toFixed(2)} of 255 per channel`);
console.log(`  wrote ${out}`);
if (after > colours) {
  console.log(`  OVER BUDGET by ${after - colours} — this would fail a backdrop check.`);
}

// The look test: the crew, on it, with the rim D-107 made mandatory. The
// ground line is assumed at the pack default rather than guessed from the
// picture — a source image has no groundY until a pack gives it one.
const groundY = Math.round(source.h * (388 / 450));
const positions = [
  SPAWN_X,
  ...Array.from({ length: MAX_STATIONS }, (_, i) => STATION_BASE_X + i * STATION_SPACING),
  EXIT_X,
].filter((x) => x < source.w);
const scale = source.w / 1000;
const separations = separationAt(quantized, positions, groundY / scale, COLOR_POOL, scale);

const preview = { pixels: quantized.pixels.slice(), w: quantized.w, h: quantized.h };
const surface = surfaceOn(preview, scale);
// A dark rim, as a pack would set: this is about whether the outline saves a
// flat sprite on a soft ground, which is the whole of D-108's predicted cost.
for (const [i, at] of positions.entries()) {
  drawStandIn(surface, at, groundY / scale, COLOR_POOL[i % COLOR_POOL.length], 0x1a1a1a);
}
const crewOut = out.replace(/\.png$/i, '-crew.png');
writeFileSync(crewOut, encodePng(preview));

console.log('');
console.log(`  Crew on it (ground line at y ${groundY}) — separation per standing place:`);
for (const s of separations) {
  const flagged = s.separation < 5 ? '  <- a gown vanishes' : s.separation < 10 ? '  <- thin' : '';
  console.log(
    `    x ${String(s.at).padStart(4)}   behind ${s.behind.toFixed(1).padStart(5)}` +
      `   nearest gown ${s.separation.toFixed(1).padStart(5)}${flagged}`,
  );
}
console.log(`  wrote ${crewOut} — look at this one.`);
