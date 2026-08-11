import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_SLOTS, type LevelPack } from '@agentlings/shared';
import { COLOR_POOL } from './levels';
import { packsDir, scanPacks } from './packs';
import { blitPlate, blitPlateA, checkPlates } from './plates';
import { encodePng, encodePngA, type Raster, type RasterA } from './raster';

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

/** An RGBA PNG: paint returns [rgb, alpha] per pixel. */
function pngA(w: number, h: number, paint: (x: number, y: number) => [number, number]): Buffer {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [c, a] = paint(x, y);
      const i = (y * w + x) * 4;
      pixels[i] = (c >> 16) & 0xff;
      pixels[i + 1] = (c >> 8) & 0xff;
      pixels[i + 2] = c & 0xff;
      pixels[i + 3] = a;
    }
  }
  return encodePngA({ pixels, w, h });
}

describe('checkPlates v2 — the stack', () => {
  const dark = 0x0a0a12;
  const backPng = () => png(1000, 450, () => dark);

  it('accepts an opaque back plate with an overscanned cut-out above it', () => {
    writeFileSync(path.join(dir, 'far.png'), backPng());
    // A drifting mid: opaque ridge across the top, holes everywhere else.
    writeFileSync(
      path.join(dir, 'mid.png'),
      pngA(1060, 450, (_x, y) => (y < 80 ? [0x101018, 255] : [0, 0])),
    );
    expect(errors(pack({ backdrop: { plates: ['far.png', 'mid.png'] } }))).toEqual([]);
  });

  it('accepts the overscan widths and names them when the width is wrong', () => {
    writeFileSync(path.join(dir, 'far.png'), png(1030, 450, () => dark));
    expect(errors(pack())[0]).toMatch(/1060/);
    expect(errors(pack())[0]).toMatch(/2120/);
  });

  it('refuses a back plate that is not fully opaque', () => {
    writeFileSync(
      path.join(dir, 'far.png'),
      pngA(1000, 450, (x) => (x === 0 ? [0, 0] : [dark, 255])),
    );
    expect(errors(pack())[0]).toMatch(/back of the stack and must be fully opaque/);
  });

  it('refuses an upper plate with no holes', () => {
    writeFileSync(path.join(dir, 'far.png'), backPng());
    writeFileSync(path.join(dir, 'mid.png'), pngA(1000, 450, () => [0x101018, 255]));
    expect(errors(pack({ backdrop: { plates: ['far.png', 'mid.png'] } }))[0]).toMatch(
      /fully opaque and would hide every plate behind it/,
    );
  });

  it('refuses an upper plate with soft edges, naming the door fix', () => {
    writeFileSync(path.join(dir, 'far.png'), backPng());
    writeFileSync(
      path.join(dir, 'mid.png'),
      pngA(1000, 450, (x) => (x < 100 ? [0x101018, 140] : [0, 0])),
    );
    expect(errors(pack({ backdrop: { plates: ['far.png', 'mid.png'] } }))[0]).toMatch(
      /partial-alpha/,
    );
  });

  it('budgets the layer, not the file: two plates within budget can be over together', () => {
    writeFileSync(path.join(dir, 'far.png'), png(1000, 450, (x) => (x % 100) * 0x010101));
    writeFileSync(
      path.join(dir, 'mid.png'),
      pngA(1000, 450, (x, y) =>
        y < 80 ? [((x % 100) + 100) * 0x010101, 255] : [0, 0],
      ),
    );
    const said = errors(pack({ backdrop: { plates: ['far.png', 'mid.png'] } }));
    expect(said[0]).toMatch(/span 200 colours together/);
    expect(said[0]).toMatch(/quantize them jointly/);
    expect(said[0]).toMatch(/far\.png 100, mid\.png 100/);
  });
});

describe('checkPlates v2 — the occlusion strip', () => {
  const dark = 0x0a0a12;
  const withStrip = (file = 'near.png') =>
    pack({ backdrop: { plates: ['far.png'], occlusion: file } });
  beforeEach(() => {
    writeFileSync(path.join(dir, 'far.png'), png(1000, 450, () => dark));
  });

  it('accepts a cut-out hugging the screen edge above the crew band', () => {
    writeFileSync(
      path.join(dir, 'near.png'),
      pngA(1000, 450, (x, y) => (x < 40 && y < 300 ? [0x05050a, 255] : [0, 0])),
    );
    expect(errors(withStrip())).toEqual([]);
  });

  it('refuses opacity over the signpost span', () => {
    writeFileSync(
      path.join(dir, 'near.png'),
      pngA(1000, 450, (x, y) => (x === 500 && y === 10 ? [0x05050a, 255] : [0, 0])),
    );
    expect(errors(withStrip())[0]).toMatch(/over the signpost span/);
  });

  it('refuses covering a standing place in the crew band', () => {
    writeFileSync(
      path.join(dir, 'near.png'),
      pngA(1000, 450, (x, y) => (x === 80 && y === 375 ? [0x05050a, 255] : [0, 0])),
    );
    expect(errors(withStrip())[0]).toMatch(/standing place at x 80/);
  });

  it('widens the forbidden span by the drift margin only when the strip drifts', () => {
    // World x 210 sits between the spawn box and the signposts: legal for a
    // pinned strip, inside the widened span for a drifting one.
    writeFileSync(
      path.join(dir, 'near.png'),
      pngA(1000, 450, (x, y) => (x === 210 && y === 10 ? [0x05050a, 255] : [0, 0])),
    );
    expect(errors(withStrip())).toEqual([]);

    writeFileSync(
      path.join(dir, 'drift.png'),
      pngA(1060, 450, (x, y) => (x === 240 && y === 10 ? [0x05050a, 255] : [0, 0])),
    );
    expect(errors(withStrip('drift.png'))[0]).toMatch(/widened by the drift margin/);
  });

  it('warns, not errors, on a strip that draws nothing', () => {
    writeFileSync(path.join(dir, 'near.png'), pngA(1000, 450, () => [0, 0]));
    expect(errors(withStrip())).toEqual([]);
    expect(warnings(withStrip())[0]).toMatch(/fully transparent — it draws nothing/);
  });
});

describe('checkPlates v2 — plate-life tiles', () => {
  const loop = (file = 'falls.png') =>
    pack({
      backdrop: { plates: ['far.png'] },
      ambient: [{ fx: 'plateloop', file, x: 100, y: 100, w: 32, h: 64, dx: 0, dy: 24 }],
    });
  beforeEach(() => {
    writeFileSync(path.join(dir, 'far.png'), png(1000, 450, () => 0x0a0a12));
  });

  it('accepts a small opaque tile', () => {
    writeFileSync(path.join(dir, 'falls.png'), png(32, 64, () => 0x123845));
    expect(errors(loop())).toEqual([]);
  });

  it('names a missing tile', () => {
    expect(errors(loop())[0]).toMatch(/plate-life tile "falls\.png" is not in the pack folder/);
  });

  it('caps a tile at 512', () => {
    writeFileSync(path.join(dir, 'falls.png'), png(600, 64, () => 0x123845));
    expect(errors(loop())[0]).toMatch(/at most 512×512/);
  });

  it('counts tile colours against the layer budget', () => {
    writeFileSync(path.join(dir, 'far.png'), png(1000, 450, (x) => (x % 100) * 0x010101));
    writeFileSync(path.join(dir, 'falls.png'), png(512, 1, (x) => (x % 40) * 0x010101 + 0xa00000));
    const said = errors(loop());
    expect(said[0]).toMatch(/span 140 colours together/);
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

  it('reads from srcX, so an overscanned plate blits its centre window', () => {
    const target: Raster = { pixels: new Uint8ClampedArray(2 * 1 * 3), w: 2, h: 1 };
    // A 4-wide plate for a 2-wide view: the visible window starts at 1.
    const plate: Raster = {
      pixels: new Uint8ClampedArray([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]),
      w: 4,
      h: 1,
    };
    blitPlate(target, plate, 1);
    expect([...target.pixels]).toEqual([2, 2, 2, 3, 3, 3]);
  });
});

describe('blitPlateA', () => {
  const rgba = (px: [number, number][]): RasterA => {
    const pixels = new Uint8ClampedArray(px.length * 4);
    px.forEach(([c, a], i) => {
      pixels[i * 4] = (c >> 16) & 0xff;
      pixels[i * 4 + 1] = (c >> 8) & 0xff;
      pixels[i * 4 + 2] = c & 0xff;
      pixels[i * 4 + 3] = a;
    });
    return { pixels, w: px.length, h: 1 };
  };

  it('lays opaque pixels over and lets holes show what is beneath', () => {
    const target: Raster = { pixels: new Uint8ClampedArray([200, 0, 0, 200, 0, 0]), w: 2, h: 1 };
    blitPlateA(
      target,
      rgba([
        [0x0000ff, 255],
        [0x00ff00, 0],
      ]),
    );
    expect([...target.pixels.subarray(0, 3)]).toEqual([0, 0, 255]);
    // The hole: the red beneath survives untouched.
    expect([...target.pixels.subarray(3, 6)]).toEqual([200, 0, 0]);
  });

  it('downsamples a 2x cut-out by coverage: a half-covered block lands half-strength', () => {
    const target: Raster = { pixels: new Uint8ClampedArray(3), w: 1, h: 1 };
    const plate: RasterA = { pixels: new Uint8ClampedArray(4 * 4), w: 2, h: 2 };
    // Two white opaque pixels, two holes.
    for (const i of [0, 1]) {
      plate.pixels[i * 4] = 255;
      plate.pixels[i * 4 + 1] = 255;
      plate.pixels[i * 4 + 2] = 255;
      plate.pixels[i * 4 + 3] = 255;
    }
    blitPlateA(target, plate);
    expect([...target.pixels]).toEqual([128, 128, 128]);
  });

  it('honours srcX like its opaque sibling', () => {
    const target: Raster = { pixels: new Uint8ClampedArray(3), w: 1, h: 1 };
    blitPlateA(
      target,
      rgba([
        [0xff0000, 255],
        [0x00ff00, 255],
      ]),
      1,
    );
    expect([...target.pixels]).toEqual([0, 255, 0]);
  });
});
