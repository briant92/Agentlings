import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_SLOTS, type LevelPack } from '@agentlings/shared';
import { COLOR_POOL } from './levels';
import { packsDir, scanPacks } from './packs';
import { blitPlate, checkPlates } from './plates';
import { encodePng, type Raster } from './raster';

const theme = Object.fromEntries(THEME_SLOTS.map((s) => [s, 0x112233]));

function pack(over: Record<string, unknown> = {}): LevelPack {
  return {
    name: 'The Amber Basin',
    provenance: 'plate painted in-repo; no third-party art',
    viewH: 450,
    groundY: 388,
    rim: 'rockEdge',
    theme,
    backdrop: { plates: ['far.png'] },
    ops: [{ op: 'rect', x: 0, y: 'groundY', w: 'worldWidth', h: 62, color: 'wood' }],
    ...over,
  } as unknown as LevelPack;
}

function png(w: number, h: number, paint: (x: number, y: number) => number): Buffer {
  const pixels = new Uint8ClampedArray(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = paint(x, y);
      const i = (y * w + x) * 3;
      pixels[i] = (c >> 16) & 0xff;
      pixels[i + 1] = (c >> 8) & 0xff;
      pixels[i + 2] = c & 0xff;
    }
  }
  return encodePng({ pixels, w, h });
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'agentlings-plates-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const errors = (p: LevelPack) =>
  checkPlates(p, dir).filter((x) => x.level === 'error').map((x) => x.message);
const warnings = (p: LevelPack) =>
  checkPlates(p, dir).filter((x) => x.level === 'warning').map((x) => x.message);

describe('checkPlates', () => {
  it('has nothing to say about a pack with no plates', () => {
    expect(checkPlates(pack({ backdrop: {} }), dir)).toEqual([]);
  });

  it('passes a dark 1x plate that fits the pack', () => {
    writeFileSync(path.join(dir, 'far.png'), png(1000, 450, () => 0x0a0a12));
    expect(checkPlates(pack(), dir)).toEqual([]);
  });

  it('passes a 2x plate — author at 2000x900 and downsample is the blessed route', () => {
    writeFileSync(path.join(dir, 'far.png'), png(2000, 900, () => 0x0a0a12));
    expect(errors(pack())).toEqual([]);
  });

  it('names a plate that is not in the folder', () => {
    expect(errors(pack())[0]).toMatch(/"far\.png" is not in the pack folder/);
  });

  it('says why a file that is not a PNG did not decode', () => {
    writeFileSync(path.join(dir, 'far.png'), 'this is prose');
    expect(errors(pack())[0]).toMatch(/did not decode: not a PNG/);
  });

  it('refuses a width that is neither 1x nor 2x of the world', () => {
    writeFileSync(path.join(dir, 'far.png'), png(800, 450, () => 0));
    expect(errors(pack())[0]).toMatch(/width must be 1000 or 2000/);
  });

  it('refuses a height that does not match the pack own viewH', () => {
    writeFileSync(path.join(dir, 'far.png'), png(1000, 300, () => 0));
    expect(errors(pack())[0]).toMatch(/viewH 450 needs 1000×450/);
  });

  it('makes the colour budget a fact: over 128 is refused, naming the count', () => {
    writeFileSync(path.join(dir, 'far.png'), png(1000, 450, (x) => (x % 200) * 0x010101));
    expect(errors(pack())[0]).toMatch(/200 colours; the backdrop budget is 128/);
  });

  it('warns where a gown would vanish against the plate', () => {
    writeFileSync(path.join(dir, 'far.png'), png(1000, 450, () => COLOR_POOL[0]));
    const said = warnings(pack());
    expect(said.length).toBeGreaterThan(0);
    expect(said[0]).toMatch(/a gown vanishes against the plate at x 80/);
  });
});

describe('scanPacks with plates', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-platepacks-'));
    mkdirSync(packsDir(root), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function install(slug: string, contents: unknown, plate?: Buffer): void {
    const folder = path.join(packsDir(root), slug);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'pack.json'), JSON.stringify(contents));
    if (plate) writeFileSync(path.join(folder, 'far.png'), plate);
  }

  it('installs a plate-bearing pack whose plate checks out', () => {
    install('amber-basin', pack(), png(1000, 450, () => 0x0a0a12));
    const { installed, rejected } = scanPacks(root);
    expect(rejected).toEqual([]);
    expect(installed.map((p) => p.slug)).toEqual(['amber-basin']);
  });

  it('rejects the pack, with the reason, when the plate is missing', () => {
    install('amber-basin', pack());
    const { installed, rejected } = scanPacks(root);
    expect(installed).toEqual([]);
    expect(rejected[0].problems.some((p) => /not in the pack folder/.test(p.message))).toBe(true);
  });
});

describe('blitPlate', () => {
  it('copies a 1x plate straight through', () => {
    const target: Raster = { pixels: new Uint8ClampedArray(2 * 1 * 3), w: 2, h: 1 };
    const plate: Raster = {
      pixels: new Uint8ClampedArray([10, 20, 30, 40, 50, 60]),
      w: 2,
      h: 1,
    };
    blitPlate(target, plate);
    expect([...target.pixels]).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('averages each 2x2 block of a 2x plate — the downsample, not a decimation', () => {
    const target: Raster = { pixels: new Uint8ClampedArray(1 * 1 * 3), w: 1, h: 1 };
    // Four pixels 0/100/100/200 grey: a decimation would answer 0 or 200.
    const plate: Raster = { pixels: new Uint8ClampedArray(4 * 3), w: 2, h: 2 };
    const greys = [0, 100, 100, 200];
    greys.forEach((g, i) => {
      plate.pixels[i * 3] = g;
      plate.pixels[i * 3 + 1] = g;
      plate.pixels[i * 3 + 2] = g;
    });
    blitPlate(target, plate);
    expect([...target.pixels]).toEqual([100, 100, 100]);
  });
});
