import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  EXIT_X,
  MAX_STATIONS,
  SPAWN_X,
  STATION_BASE_X,
  STATION_SPACING,
  WORLD_WIDTH,
  type LevelPack,
  type PackProblem,
} from '@agentlings/shared';
import { COLOR_POOL } from './levels';
import { BACKDROP_COLOURS } from './quantize';
import { countColours, decodePng, separationAt, type Raster } from './raster';

/**
 * The raster half of the plate rules (D-108, D-142).
 *
 * `validateLevelPack` checks the shape — a plain filename, one plate, rim
 * set — because that is all a draft can be judged by. These checks need the
 * pack folder: whether the file is there, decodes, is the size the pack's own
 * geometry demands, and stays inside the colour budget that makes "quantized"
 * a fact rather than a hope. Run by the server on every scan and by the CLI
 * checker, so a pack the checker waves through cannot be one the loader then
 * refuses.
 */

/** Where the crew actually stand: the hatch, the five signposts, the door. */
export const STAND_POSITIONS: readonly number[] = [
  SPAWN_X,
  ...Array.from({ length: MAX_STATIONS }, (_, i) => STATION_BASE_X + i * STATION_SPACING),
  EXIT_X,
];

export function checkPlates(pack: LevelPack, dir: string): PackProblem[] {
  const problems: PackProblem[] = [];
  const plates = pack.backdrop?.plates;
  if (!plates?.length) return problems;

  for (const file of plates) {
    const at = path.join(dir, file);
    if (!existsSync(at)) {
      problems.push({
        level: 'error',
        message: `backdrop plate "${file}" is not in the pack folder`,
      });
      continue;
    }

    let plate: Raster;
    try {
      plate = decodePng(readFileSync(at));
    } catch (error) {
      problems.push({
        level: 'error',
        message: `backdrop plate "${file}" did not decode: ${(error as Error).message}`,
      });
      continue;
    }

    // The plate must match the pack's own geometry, at 1x or 2x — D-108's
    // "author at 1000×450 or 2000×900", generalised to the viewH the pack
    // actually declares. Any other size would stretch, and a stretched plate
    // moves the ground line out from under the crew.
    const scale = plate.w / WORLD_WIDTH;
    if (scale !== 1 && scale !== 2) {
      problems.push({
        level: 'error',
        message:
          `backdrop plate "${file}" is ${plate.w}×${plate.h}; its width must be ` +
          `${WORLD_WIDTH} or ${WORLD_WIDTH * 2}`,
      });
      continue;
    }
    if (plate.h !== pack.viewH * scale) {
      problems.push({
        level: 'error',
        message:
          `backdrop plate "${file}" is ${plate.w}×${plate.h}; at that width this ` +
          `pack's viewH ${pack.viewH} needs ${plate.w}×${pack.viewH * scale}`,
      });
      continue;
    }

    const colours = countColours(plate);
    if (colours > BACKDROP_COLOURS) {
      problems.push({
        level: 'error',
        message:
          `backdrop plate "${file}" has ${colours} colours; the backdrop budget is ` +
          `${BACKDROP_COLOURS} (D-108) — run \`npm run pack:quantize\` on it`,
      });
      continue;
    }

    // Legibility, measured where the crew will stand — on the plate itself,
    // before ops and scrim draw over it, so this is the floor the rim starts
    // from rather than the finished picture. Warnings, not errors: the rim is
    // required by the shape check exactly because it survives a bad band.
    for (const s of separationAt(plate, STAND_POSITIONS, pack.groundY, COLOR_POOL, scale)) {
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
 * Draws a plate under a scene render, matching how the app composites: plate
 * first, then `drawScene` over it.
 *
 * `ratio` plate-pixels per raster-pixel: 2× plates under a 1× render average
 * each 2×2 block — the same downsample D-108 blessed — and 1× plates under a
 * 2× render repeat pixels, which is what the canvas upscale does live.
 */
export function blitPlate(target: Raster, plate: Raster): void {
  const ratio = plate.w / target.w;
  for (let y = 0; y < target.h; y++) {
    for (let x = 0; x < target.w; x++) {
      const i = (y * target.w + x) * 3;
      if (ratio === 2) {
        const px = x * 2;
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
        const px = Math.min(plate.w - 1, Math.floor(x * ratio));
        const py = Math.min(plate.h - 1, Math.floor(y * ratio));
        for (let ch = 0; ch < 3; ch++) {
          target.pixels[i + ch] = plate.pixels[(py * plate.w + px) * 3 + ch];
        }
      }
    }
  }
}
