import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  EXIT_X,
  MAX_STATIONS,
  PLATE_OVERSCAN,
  SPAWN_X,
  STATION_BASE_X,
  STATION_SPACING,
  WORLD_WIDTH,
  packRasterFiles,
  type LevelPack,
  type PackProblem,
} from '@agentlings/shared';
import { COLOR_POOL } from './levels';
import { BACKDROP_COLOURS, histogramOfA } from './quantize';
import {
  alphaStats,
  bufferSurface,
  CREW_H,
  CREW_W,
  decodePngA,
  separationAt,
  type Raster,
  type RasterA,
} from './raster';

/**
 * The raster half of the plate rules (D-108, D-142, v2).
 *
 * `validateLevelPack` checks the shape — plain filenames, the stack cap, rim
 * set — because that is all a draft can be judged by. These checks need the
 * pack folder: whether each file is there, decodes, is the size the pack's
 * own geometry demands, respects the cut-out contract, keeps the occlusion
 * strip off the crew, and stays inside the colour budget that makes
 * "quantized" a fact rather than a hope. Run by the server on every scan and
 * by the CLI checker, so a pack the checker waves through cannot be one the
 * loader then refuses.
 */

/** Where the crew actually stand: the hatch, the five signposts, the door. */
export const STAND_POSITIONS: readonly number[] = [
  SPAWN_X,
  ...Array.from({ length: MAX_STATIONS }, (_, i) => STATION_BASE_X + i * STATION_SPACING),
  EXIT_X,
];

/** The signpost span, in world units — where an occlusion strip may never sit. */
const FURNITURE_LO = STATION_BASE_X - 10;
const FURNITURE_HI = STATION_BASE_X + (MAX_STATIONS - 1) * STATION_SPACING + 10;

/** A decoded raster file, with the scale its width declared. */
interface LoadedRaster {
  file: string;
  r: RasterA;
  /** 1 or 2; tiles have no scale and carry 0. */
  scale: number;
  /** True when the width carries the drift overscan. */
  overscan: boolean;
}

export function checkPlates(pack: LevelPack, dir: string): PackProblem[] {
  const problems: PackProblem[] = [];
  const error = (message: string) => problems.push({ level: 'error', message });
  const warn = (message: string) => problems.push({ level: 'warning', message });

  const plates = pack.backdrop?.plates ?? [];
  const occlusion = pack.backdrop?.occlusion;
  const depthMap = pack.backdrop?.depthMap;
  const tiles = (pack.ambient ?? []).flatMap((op) => (op.fx === 'plateloop' ? [op.file] : []));
  // The smooth finish (D-151): another medium, so the quantized-look rules —
  // binary alpha, the 128 union — do not apply. Geometry, opacity of the
  // back, and the strip's placement are registration, not look, and hold.
  const smooth = pack.backdrop?.finish === 'smooth';
  if (plates.length === 0 && !occlusion && !depthMap && tiles.length === 0) return problems;

  const load = (file: string, label: string): RasterA | null => {
    const at = path.join(dir, file);
    if (!existsSync(at)) {
      error(`${label} "${file}" is not in the pack folder`);
      return null;
    }
    try {
      return decodePngA(readFileSync(at));
    } catch (err) {
      error(`${label} "${file}" did not decode: ${(err as Error).message}`);
      return null;
    }
  };

  // A plate must match the pack's own geometry, at 1x or 2x — D-108's
  // "author at 1000×450 or 2000×900", generalised to the viewH the pack
  // declares — or carry the drift overscan on its width (v2): any other size
  // would stretch, and a stretched plate moves the ground line out from
  // under the crew. Height never carries overscan; drift is horizontal only,
  // because vertical drift slides the ground line under their feet.
  const sized = (file: string, label: string, r: RasterA): LoadedRaster | null => {
    const widths: [number, number, boolean][] = [
      [WORLD_WIDTH, 1, false],
      [WORLD_WIDTH + PLATE_OVERSCAN, 1, true],
      [WORLD_WIDTH * 2, 2, false],
      [(WORLD_WIDTH + PLATE_OVERSCAN) * 2, 2, true],
    ];
    const match = widths.find(([w]) => r.w === w);
    if (!match) {
      error(
        `${label} "${file}" is ${r.w}×${r.h}; its width must be ${WORLD_WIDTH} or ` +
          `${WORLD_WIDTH * 2} — or, for a plate that drifts, ${WORLD_WIDTH + PLATE_OVERSCAN} ` +
          `or ${(WORLD_WIDTH + PLATE_OVERSCAN) * 2} (the +${PLATE_OVERSCAN} overscan)`,
      );
      return null;
    }
    const [, scale, overscan] = match;
    if (r.h !== pack.viewH * scale) {
      error(
        `${label} "${file}" is ${r.w}×${r.h}; at that width this ` +
          `pack's viewH ${pack.viewH} needs ${r.w}×${pack.viewH * scale}`,
      );
      return null;
    }
    return { file, r, scale, overscan };
  };

  const loaded: LoadedRaster[] = [];
  const backdropStack: LoadedRaster[] = [];

  plates.forEach((file, i) => {
    const r = load(file, 'backdrop plate');
    if (!r) return;
    const ok = sized(file, 'backdrop plate', r);
    if (!ok) return;
    loaded.push(ok);
    backdropStack.push(ok);

    const stats = alphaStats(r);
    if (i === 0) {
      // The back of the stack is the picture: whatever shows through a hole
      // in it would be the page, not a plate.
      if (stats.partial + stats.transparent > 0) {
        error(
          `backdrop plate "${file}" is the back of the stack and must be fully ` +
            `opaque — ${stats.partial + stats.transparent} of its pixels are not`,
        );
      }
    } else {
      if (!smooth && stats.partial > 0) {
        error(
          `backdrop plate "${file}" carries ${stats.partial} partial-alpha pixels — ` +
            'a cut-out is on-or-off (soft edges blend into colours no palette holds); ' +
            'render it through the door with alpha, which snaps them, or snap the ' +
            `whole stack in one move: npm run pack:quantize -- ${packRasterFiles(pack).join(' ')}`,
        );
      } else if (stats.transparent === 0 && stats.partial === 0) {
        error(
          `backdrop plate "${file}" is fully opaque and would hide every plate ` +
            'behind it — a cut-out needs holes',
        );
      }
    }
  });

  if (occlusion) {
    const r = load(occlusion, 'occlusion strip');
    if (r) {
      const ok = sized(occlusion, 'occlusion strip', r);
      if (ok) {
        loaded.push(ok);
        const stats = alphaStats(r);
        if (!smooth && stats.partial > 0) {
          error(
            `occlusion strip "${occlusion}" carries ${stats.partial} partial-alpha ` +
              'pixels — a cut-out is on-or-off; render it through the door with alpha, ' +
              `or jointly: npm run pack:quantize -- ${packRasterFiles(pack).join(' ')}`,
          );
        } else if (stats.opaque === 0 && stats.partial === 0) {
          warn(`occlusion strip "${occlusion}" is fully transparent — it draws nothing`);
        } else {
          checkOcclusionPlacement(ok, pack.groundY, error);
        }
      }
    }
  }

  // The depth map (D-151): data, not picture. It must decode and sit exactly
  // on the back plate it displaces — a mismatched map would slide the
  // displacement off the forms it encodes — and it joins no colour union.
  if (depthMap) {
    const r = load(depthMap, 'depth map');
    if (r) {
      const back = backdropStack[0];
      if (!back) {
        error(`depth map "${depthMap}" has no loadable back plate to displace`);
      } else if (r.w !== back.r.w || r.h !== back.r.h) {
        error(
          `depth map "${depthMap}" is ${r.w}×${r.h}; it must match the back plate ` +
            `"${back.file}" exactly (${back.r.w}×${back.r.h})`,
        );
      }
    }
  }

  for (const file of new Set(tiles)) {
    const r = load(file, 'plate-life tile');
    if (!r) continue;
    if (r.w > 512 || r.h > 512) {
      error(
        `plate-life tile "${file}" is ${r.w}×${r.h}; a tile is at most 512×512 — ` +
          'it is a loop, not a plate',
      );
      continue;
    }
    const stats = alphaStats(r);
    if (!smooth && stats.partial > 0) {
      error(
        `plate-life tile "${file}" carries ${stats.partial} partial-alpha pixels — ` +
          'a cut-out is on-or-off; snap them before shipping: ' +
          `npm run pack:quantize -- ${packRasterFiles(pack).join(' ')}`,
      );
      continue;
    }
    loaded.push({ file, r, scale: 0, overscan: false });
  }

  // The colour budget is the *layer's*: one palette across every raster file
  // the pack stacks, because they composite into one picture (D-108, v2).
  // The smooth finish left the palette world entirely (D-151) — no budget.
  const union = new Map<number, number>();
  if (!smooth) for (const { r } of loaded) histogramOfA(r, union);
  if (union.size > BACKDROP_COLOURS) {
    if (loaded.length === 1) {
      error(
        `backdrop plate "${loaded[0].file}" has ${union.size} colours; the backdrop ` +
          `budget is ${BACKDROP_COLOURS} (D-108) — run \`npm run pack:quantize\` on it`,
      );
    } else {
      const per = loaded
        .map(({ file, r }) => `${file} ${histogramOfA(r).size}`)
        .join(', ');
      error(
        `the pack's raster files span ${union.size} colours together (${per}); the ` +
          `${BACKDROP_COLOURS} budget is the layer's, one palette across all of them ` +
          `(D-108) — quantize them jointly: npm run pack:quantize -- ${packRasterFiles(pack).join(' ')}`,
      );
    }
  }

  // Legibility, measured where the crew will stand — on the composited
  // backdrop at rest, before ops and scrim draw over it, so this is the floor
  // the rim starts from rather than the finished picture. Warnings, not
  // errors: the rim is required by the shape check exactly because it
  // survives a bad band. The occlusion strip stays out of the composite — by
  // its own rules it may never sit behind a standing place.
  if (backdropStack.length > 0 && backdropStack.length === plates.length) {
    const { raster } = bufferSurface(WORLD_WIDTH, pack.viewH, 1, 0x000000);
    for (const { r, scale, overscan } of backdropStack) {
      blitPlateA(raster, r, overscan ? (PLATE_OVERSCAN / 2) * scale : 0);
    }
    for (const s of separationAt(raster, STAND_POSITIONS, pack.groundY, COLOR_POOL, 1)) {
      if (s.separation < 5) {
        problems.push({
          level: 'warning',
          message:
            `a gown vanishes against the plate at x ${s.at} (separation ` +
            `${s.separation.toFixed(1)}) — the rim must carry it there`,
        });
      }
    }
  }
  return problems;
}

/**
 * Where an occlusion strip may be opaque: near the screen edges, never over
 * the signpost span, and never over a place the crew stand still — each
 * standing box widened by the drift margin, so no drift the renderer is
 * allowed to apply can slide the strip over someone working. Pixels above
 * the crew band are free: an arch may fill the whole top of the frame.
 */
function checkOcclusionPlacement(
  strip: LoadedRaster,
  groundY: number,
  error: (message: string) => void,
): void {
  const { r, scale, overscan } = strip;
  const margin = overscan ? PLATE_OVERSCAN / 2 : 0;
  const rest = margin * scale; // where the view starts in the plate, at rest
  const toWorldX = (px: number): number => (px - rest) / scale;

  let overFurniture = 0;
  let firstFurnitureX: number | null = null;
  const coveredStands = new Set<number>();
  const bandTop = (groundY - CREW_H) * scale;
  const bandBottom = groundY * scale;

  for (let py = 0; py < r.h; py++) {
    const inBand = py >= bandTop && py < bandBottom;
    for (let px = 0; px < r.w; px++) {
      if (r.pixels[(py * r.w + px) * 4 + 3] < 128) continue;
      const wx = toWorldX(px);
      // The whole column is furniture-checked: a strip over the signposts
      // hides the pennants and lamps whatever its height.
      if (wx > FURNITURE_LO - margin && wx < FURNITURE_HI + margin) {
        overFurniture++;
        if (firstFurnitureX === null) firstFurnitureX = Math.round(wx);
      }
      if (!inBand) continue;
      for (const at of STAND_POSITIONS) {
        if (wx > at - CREW_W / 2 - margin && wx < at + CREW_W / 2 + margin) {
          coveredStands.add(at);
        }
      }
    }
  }

  if (overFurniture > 0) {
    error(
      `occlusion strip "${strip.file}" is opaque over the signpost span ` +
        `(x ${FURNITURE_LO}–${FURNITURE_HI}${overscan ? ', widened by the drift margin' : ''}) — ` +
        `${overFurniture} pixels, first at x ≈ ${firstFurnitureX}; the strip lives at the ` +
        'screen edges, never over the furniture',
    );
  }
  for (const at of [...coveredStands].sort((a, b) => a - b)) {
    error(
      `occlusion strip "${strip.file}" covers the standing place at x ${at} — the crew ` +
        'work there, and a strip above the sprites would hide them for good',
    );
  }
}

/**
 * Draws a plate under a scene render, matching how the app composites: plate
 * first, then `drawScene` over it.
 *
 * `ratio` plate-pixels per raster-pixel: 2× plates under a 1× render average
 * each 2×2 block — the same downsample D-108 blessed — and 1× plates under a
 * 2× render repeat pixels, which is what the canvas upscale does live.
 */
export function blitPlate(target: Raster, plate: Raster, srcX = 0): void {
  // Ratio from the heights: widths may legitimately differ now — an
  // overscanned plate is wider than the view by design, and `srcX` is where
  // the visible window starts in it (the centre, at rest).
  const ratio = plate.h / target.h;
  for (let y = 0; y < target.h; y++) {
    for (let x = 0; x < target.w; x++) {
      const i = (y * target.w + x) * 3;
      if (ratio === 2) {
        const px = srcX + x * 2;
        const py = y * 2;
        for (let ch = 0; ch < 3; ch++) {
          target.pixels[i + ch] =
            (plate.pixels[(py * plate.w + px) * 3 + ch] +
              plate.pixels[(py * plate.w + px + 1) * 3 + ch] +
              plate.pixels[((py + 1) * plate.w + px) * 3 + ch] +
              plate.pixels[((py + 1) * plate.w + px + 1) * 3 + ch]) /
            4;
        }
      } else {
        const px = Math.min(plate.w - 1, srcX + Math.floor(x * ratio));
        const py = Math.min(plate.h - 1, Math.floor(y * ratio));
        for (let ch = 0; ch < 3; ch++) {
          target.pixels[i + ch] = plate.pixels[(py * plate.w + px) * 3 + ch];
        }
      }
    }
  }
}

/**
 * `blitPlate` for a cut-out: source-over with the alpha as weight, so the
 * holes leave what earlier plates put there. A 2× block averages colour and
 * coverage together — a half-covered block lands half-strength, which is the
 * same downsample the browser's linear filter performs live.
 */
export function blitPlateA(target: Raster, plate: RasterA, srcX = 0): void {
  const ratio = plate.h / target.h;
  for (let y = 0; y < target.h; y++) {
    for (let x = 0; x < target.w; x++) {
      const i = (y * target.w + x) * 3;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      if (ratio === 2) {
        const px = srcX + x * 2;
        const py = y * 2;
        for (const [ox, oy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]) {
          const j = ((py + oy) * plate.w + px + ox) * 4;
          const pa = plate.pixels[j + 3] / 255;
          r += plate.pixels[j] * pa;
          g += plate.pixels[j + 1] * pa;
          b += plate.pixels[j + 2] * pa;
          a += pa;
        }
        r /= 4;
        g /= 4;
        b /= 4;
        a /= 4;
      } else {
        const px = Math.min(plate.w - 1, srcX + Math.floor(x * ratio));
        const py = Math.min(plate.h - 1, Math.floor(y * ratio));
        const j = (py * plate.w + px) * 4;
        a = plate.pixels[j + 3] / 255;
        r = plate.pixels[j] * a;
        g = plate.pixels[j + 1] * a;
        b = plate.pixels[j + 2] * a;
      }
      if (a === 0) continue;
      target.pixels[i] = r + target.pixels[i] * (1 - a);
      target.pixels[i + 1] = g + target.pixels[i + 1] * (1 - a);
      target.pixels[i + 2] = b + target.pixels[i + 2] * (1 - a);
    }
  }
}
