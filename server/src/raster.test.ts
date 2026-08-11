import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { anchorsOf, drawScene, type Scene, type Theme } from '@agentlings/shared';
import {
  alphaStats,
  binariseAlpha,
  bufferSurface,
  countColoursA,
  CREW_H,
  CREW_W,
  decodePng,
  decodePngA,
  drawStandIn,
  encodePng,
  encodePngA,
  meanLuminance,
  relLuminance,
  separationAt,
  type Raster,
  type RasterA,
} from './raster';

/** The pixel at (x, y), as one 0xRRGGBB number. */
function at(r: Raster, x: number, y: number): number {
  const i = (y * r.w + x) * 3;
  return (r.pixels[i] << 16) | (r.pixels[i + 1] << 8) | r.pixels[i + 2];
}

const THEME = Object.fromEntries(
  [
    'void',
    'rock',
    'rockDark',
    'rockEdge',
    'grass',
    'grassDark',
    'soil',
    'soilDark',
    'stone',
    'stoneDark',
    'accent',
    'accentLight',
    'flame',
    'flameCore',
    'shadow',
    'glow',
  ].map((slot) => [slot, 0x000000]),
) as unknown as Theme;

describe('bufferSurface', () => {
  it('starts at the background colour', () => {
    const { raster } = bufferSurface(4, 3, 1, 0x102030);
    expect(raster.w).toBe(4);
    expect(raster.h).toBe(3);
    expect(at(raster, 0, 0)).toBe(0x102030);
    expect(at(raster, 3, 2)).toBe(0x102030);
  });

  it('composites alpha against what is already there rather than replacing it', () => {
    const { surface, raster } = bufferSurface(2, 2, 1, 0x000000);
    surface.rect(0, 0, 2, 2, 0xffffff, 0.5);
    // Half of white over black, not white and not black.
    expect(at(raster, 0, 0)).toBe(0x808080);
  });

  it('does not compound two half-alpha bands that tile rather than overlap', () => {
    const { surface, raster } = bufferSurface(1, 2, 1, 0x000000);
    surface.rect(0, 0, 1, 1, 0xffffff, 0.5);
    surface.rect(0, 1, 1, 1, 0xffffff, 0.5);
    expect(at(raster, 0, 0)).toBe(0x808080);
    expect(at(raster, 0, 1)).toBe(0x808080);
  });

  it('keeps a sub-pixel rect at one pixel, as the canvas surface does', () => {
    const { surface, raster } = bufferSurface(4, 4, 1, 0x000000);
    surface.rect(1, 1, 0.2, 0.2, 0xffffff);
    expect(at(raster, 1, 1)).toBe(0xffffff);
    expect(at(raster, 2, 2)).toBe(0x000000);
  });

  it('scales every primitive by the same factor', () => {
    const { surface, raster } = bufferSurface(4, 4, 2, 0x000000);
    expect(raster.w).toBe(8);
    surface.rect(0, 0, 1, 1, 0xffffff);
    expect(at(raster, 0, 0)).toBe(0xffffff);
    expect(at(raster, 1, 1)).toBe(0xffffff);
    expect(at(raster, 2, 2)).toBe(0x000000);
  });

  it('fills the inside of a polygon and nothing outside it', () => {
    const { surface, raster } = bufferSurface(10, 10, 1, 0x000000);
    surface.poly([0, 0, 9, 0, 0, 9], 0xffffff);
    expect(at(raster, 1, 1)).toBe(0xffffff);
    expect(at(raster, 8, 8)).toBe(0x000000);
  });

  it('fills a circle at the centre and not at the corner', () => {
    const { surface, raster } = bufferSurface(11, 11, 1, 0x000000);
    surface.circle(5, 5, 4, 0xffffff);
    expect(at(raster, 5, 5)).toBe(0xffffff);
    expect(at(raster, 0, 0)).toBe(0x000000);
  });

  it('draws a polyline along its points', () => {
    const { surface, raster } = bufferSurface(10, 10, 1, 0x000000);
    surface.polyline(
      [
        [1, 5],
        [8, 5],
      ],
      1,
      0xffffff,
    );
    expect(at(raster, 4, 5)).toBe(0xffffff);
    expect(at(raster, 4, 9)).toBe(0x000000);
  });

  it('ignores anything drawn outside the buffer instead of throwing', () => {
    const { surface, raster } = bufferSurface(4, 4, 1, 0x000000);
    expect(() => surface.rect(-20, -20, 5, 5, 0xffffff)).not.toThrow();
    expect(() => surface.circle(100, 100, 5, 0xffffff)).not.toThrow();
    expect(at(raster, 0, 0)).toBe(0x000000);
  });
});

describe('the same interpreter the app uses', () => {
  it('draws a scene through drawScene, scrim and all', () => {
    const scene: Scene = {
      name: 'test',
      viewH: 40,
      groundY: 30,
      ops: [{ op: 'rect', x: 0, y: 30, w: 'worldWidth', h: 10, color: 'rock' }],
      backdrop: {
        scrim: { color: 'void', alpha: 1, from: 0 },
        ops: [{ op: 'rect', x: 0, y: 0, w: 'worldWidth', h: 30, color: 'grass' }],
      },
    };
    const theme = { ...THEME, void: 0x000000, grass: 0xffffff, rock: 0xff0000 };
    const { surface, raster } = bufferSurface(1000, 40, 1, 0x000000);
    drawScene(surface, scene, theme, anchorsOf(scene));
    // The backdrop is white, the scrim is opaque black over it by the ground
    // line, and the foreground rock sits below.
    expect(at(raster, 500, 29)).toBe(0x000000);
    expect(at(raster, 500, 35)).toBe(0xff0000);
  });
});

describe('luminance', () => {
  it('runs black to white across 0–100', () => {
    expect(relLuminance(0x000000)).toBe(0);
    expect(relLuminance(0xffffff)).toBeCloseTo(100, 5);
  });

  it('weights green above red above blue, as the eye does', () => {
    expect(relLuminance(0x00ff00)).toBeGreaterThan(relLuminance(0xff0000));
    expect(relLuminance(0xff0000)).toBeGreaterThan(relLuminance(0x0000ff));
  });

  it('averages a region and clips to the raster', () => {
    const { surface, raster } = bufferSurface(10, 10, 1, 0x000000);
    surface.rect(0, 0, 10, 5, 0xffffff);
    expect(meanLuminance(raster, 0, 0, 10, 10)).toBeCloseTo(50, 0);
    // Overhanging on every side: only the white half is inside, so that is
    // all it averages.
    expect(meanLuminance(raster, -5, -5, 100, 10)).toBeCloseTo(100, 0);
    // Entirely outside is no rows at all, not a guess.
    expect(meanLuminance(raster, 0, -50, 10, 10)).toBe(0);
  });
});

describe('separationAt', () => {
  const gowns = [0x000000, 0xffffff];

  it('reports the gown that separates least, not the average', () => {
    const { surface, raster } = bufferSurface(200, 100, 1, 0x000000);
    surface.rect(0, 0, 200, 100, 0xffffff);
    const [only] = separationAt(raster, [100], 90, gowns, 1);
    expect(only.behind).toBeCloseTo(100, 0);
    // White ground: the white gown vanishes, and that is the one reported.
    expect(only.gown).toBe(0xffffff);
    expect(only.separation).toBeCloseTo(0, 1);
  });

  it('measures the band the crew actually occupy, not the whole column', () => {
    const { surface, raster } = bufferSurface(200, 100, 1, 0x000000);
    // White only well above the crew's heads.
    surface.rect(0, 0, 200, 90 - CREW_H - 5, 0xffffff);
    const [only] = separationAt(raster, [100], 90, gowns, 1);
    expect(only.behind).toBeCloseTo(0, 1);
    expect(only.gown).toBe(0x000000);
  });

  it('honours the scale, so a scaled render measures the same place', () => {
    const { surface, raster } = bufferSurface(200, 100, 2, 0x000000);
    surface.rect(0, 0, 200, 100, 0xffffff);
    const [only] = separationAt(raster, [100], 90, gowns, 2);
    expect(only.behind).toBeCloseTo(100, 0);
  });
});

describe('drawStandIn', () => {
  it('paints the gown, ringed by the rim', () => {
    const { surface, raster } = bufferSurface(100, 60, 1, 0x000000);
    drawStandIn(surface, 50, 50, 0x00ff00, 0xff0000);
    expect(at(raster, 50, 50 - CREW_H + 2)).toBe(0x00ff00);
    expect(at(raster, 50 - CREW_W / 2 - 1, 50 - CREW_H)).toBe(0xff0000);
  });

  it('leaves no ring when the pack sets no rim', () => {
    const { surface, raster } = bufferSurface(100, 60, 1, 0x000000);
    drawStandIn(surface, 50, 50, 0x00ff00);
    expect(at(raster, 50 - CREW_W / 2 - 1, 50 - CREW_H)).toBe(0x000000);
  });
});

describe('encodePng', () => {
  it('writes a PNG whose header states the real size', () => {
    const { raster } = bufferSurface(7, 5, 1, 0x000000);
    const png = encodePng(raster);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(7);
    expect(png.readUInt32BE(20)).toBe(5);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(2); // truecolour
  });

  it('carries the actual pixels, recoverable by inflating IDAT', () => {
    const { surface, raster } = bufferSurface(3, 2, 1, 0x000000);
    surface.rect(0, 0, 1, 1, 0xff8000);
    const png = encodePng(raster);
    const start = png.indexOf(Buffer.from('IDAT', 'ascii'));
    const length = png.readUInt32BE(start - 4);
    const raw = inflateSync(png.subarray(start + 4, start + 4 + length));
    // One filter byte per row, then RGB triples.
    expect(raw.length).toBe((3 * 3 + 1) * 2);
    expect(raw[0]).toBe(0);
    expect([raw[1], raw[2], raw[3]]).toEqual([0xff, 0x80, 0x00]);
  });

  it('ends with IEND', () => {
    const { raster } = bufferSurface(2, 2, 1, 0x000000);
    const png = encodePng(raster);
    expect(png.subarray(png.length - 8, png.length - 4).toString('ascii')).toBe('IEND');
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

describe('the alpha pair', () => {
  it('round-trips RGBA through encodePngA and decodePngA', () => {
    const source = stripA([
      [0xff8000, 255],
      [0x00ff00, 0],
      [0x0000ff, 120],
    ]);
    const back = decodePngA(encodePngA(source));
    expect(back.w).toBe(3);
    expect([...back.pixels]).toEqual([...source.pixels]);
  });

  it('keeps the alpha the opaque decoder composites away', () => {
    // Half-transparent white: decodePng blends it onto black; decodePngA
    // hands back the raw pixel and its coverage.
    const png = encodePngA(stripA([[0xffffff, 128]]));
    const composited = decodePng(png);
    expect(composited.pixels[0]).toBeCloseTo(128, -1);
    const kept = decodePngA(png);
    expect(kept.pixels[0]).toBe(255);
    expect(kept.pixels[3]).toBe(128);
  });

  it('binariseAlpha snaps to on-or-off, zeroes the holes, counts the partials', () => {
    const r = stripA([
      [0xffffff, 255],
      [0xffffff, 200],
      [0xffffff, 90],
      [0xffffff, 0],
    ]);
    const partial = binariseAlpha(r);
    expect(partial).toBe(2);
    expect([...r.pixels.subarray(0, 8)]).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
    // Below threshold: the whole pixel is zeroed, colour included.
    expect([...r.pixels.subarray(8, 16)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('countColoursA counts only the pixels that are there', () => {
    const r = stripA([
      [0xff0000, 255],
      [0x00ff00, 0],
      [0x0000ff, 255],
      [0xff0000, 255],
    ]);
    expect(countColoursA(r)).toBe(2);
  });

  it('alphaStats reports the three kinds', () => {
    const r = stripA([
      [0xffffff, 255],
      [0xffffff, 128],
      [0xffffff, 0],
    ]);
    expect(alphaStats(r)).toEqual({ opaque: 1, partial: 1, transparent: 1 });
  });
});
