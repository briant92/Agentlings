import type { ThemeKey } from '@agentlings/shared';
import { EXIT_X, SPAWN_X, WORLD_WIDTH } from '@agentlings/shared';
import { describe, expect, it } from 'vitest';
import { CAVE } from './scenes/cave';
import { SCENES } from './scenes';
import { anchorsOf, drawScene, resolveCoord, type Anchors, type Scene, type Surface } from './scene';
import { THEMES } from './themes';

const ANCHORS: Anchors = {
  worldWidth: 1000,
  viewH: 320,
  groundY: 258,
  spawnX: 80,
  exitX: 940,
};

interface Drawn {
  kind: 'rect' | 'circle' | 'poly' | 'polyline';
  args: number[];
  color: number;
  alpha?: number;
}

/** Records what a scene draws, so the format can be tested without a canvas. */
function recorder(): { surface: Surface; drawn: Drawn[] } {
  const drawn: Drawn[] = [];
  const surface: Surface = {
    rect: (x, y, w, h, color, alpha) => drawn.push({ kind: 'rect', args: [x, y, w, h], color, alpha }),
    circle: (x, y, r, color, alpha) => drawn.push({ kind: 'circle', args: [x, y, r], color, alpha }),
    poly: (points, color, alpha) => drawn.push({ kind: 'poly', args: points, color, alpha }),
    polyline: (points, width, color) =>
      drawn.push({ kind: 'polyline', args: points.flat(), color }),
  };
  return { surface, drawn };
}

/**
 * The op-level tests are about what a shape draws, not about how tall the
 * world is — ANCHORS is what positions them either way — so they hand over
 * ops alone and the world's size is filled in here. A scene must still
 * declare `viewH` and `groundY`; this is the one place they are boilerplate.
 */
function render(scene: Omit<Scene, 'viewH' | 'groundY'>, theme = THEMES.cave): Drawn[] {
  const { surface, drawn } = recorder();
  drawScene(surface, { viewH: ANCHORS.viewH, groundY: ANCHORS.groundY, ...scene }, theme, ANCHORS);
  return drawn;
}

describe('resolveCoord', () => {
  it('passes plain numbers through', () => {
    expect(resolveCoord(42, ANCHORS)).toBe(42);
  });

  it('reads an anchor by name', () => {
    expect(resolveCoord('groundY', ANCHORS)).toBe(258);
  });

  it('applies an offset in either direction', () => {
    expect(resolveCoord('groundY-40', ANCHORS)).toBe(218);
    expect(resolveCoord('groundY+12', ANCHORS)).toBe(270);
    expect(resolveCoord('worldWidth-26', ANCHORS)).toBe(974);
  });

  it('tolerates the spaces a human leaves in', () => {
    expect(resolveCoord(' groundY - 40 ', ANCHORS)).toBe(218);
  });

  // A silent zero here would put terrain in the wrong place with no clue why.
  it('refuses an unknown anchor rather than guessing', () => {
    expect(() => resolveCoord('cellarY-10', ANCHORS)).toThrow(/unknown anchor/);
  });

  it('refuses anything that is not anchor-and-offset', () => {
    expect(() => resolveCoord('groundY*2', ANCHORS)).toThrow(/bad coordinate/);
    expect(() => resolveCoord('groundY-spawnX', ANCHORS)).toThrow(/bad coordinate/);
  });
});

describe('drawing a scene', () => {
  it('turns a colour name into the theme’s number', () => {
    const drawn = render({ ops: [{ op: 'rect', x: 0, y: 0, w: 4, h: 4, color: 'grass' }], name: 't' });
    expect(drawn[0].color).toBe(THEMES.cave.grass);
  });

  it('paints the same shape differently for a different theme', () => {
    const op = { op: 'rect' as const, x: 0, y: 0, w: 4, h: 4, color: 'grass' as const };
    const cave = render({ name: 't', ops: [op] }, THEMES.cave)[0].color;
    const house = render({ name: 't', ops: [op] }, THEMES.household)[0].color;
    expect(cave).not.toBe(house);
  });

  it('repeats children at each offset', () => {
    const drawn = render({
      name: 't',
      ops: [{ op: 'repeat', at: [100, 200], of: [{ op: 'rect', x: 5, y: 0, w: 1, h: 1, color: 'rock' }] }],
    });
    expect(drawn.map((d) => d.args[0])).toEqual([105, 205]);
  });

  it('bands down the y axis, and across the x axis when asked', () => {
    const child = { op: 'rect' as const, x: 0, y: 0, w: 1, h: 1, color: 'rock' as const };
    const down = render({ name: 't', ops: [{ op: 'band', from: 0, to: 30, step: 10, of: [child] }] });
    expect(down.map((d) => d.args[1])).toEqual([0, 10, 20]);

    const across = render({
      name: 't',
      ops: [{ op: 'band', axis: 'x', from: 0, to: 30, step: 10, of: [child] }],
    });
    expect(across.map((d) => d.args[0])).toEqual([0, 10, 20]);
  });

  it('draws the same picture every time, and a different one per seed', () => {
    const speckle: Omit<Scene, 'viewH' | 'groundY'> = {
      name: 't',
      ops: [{ op: 'speckle', x: 0, y: 0, w: 100, h: 100, count: 20, light: 'rockLight', dark: 'rockDark' }],
    };
    const a = render(speckle);
    const b = render(speckle);
    expect(a).toEqual(b);

    const { surface, drawn } = recorder();
    drawScene(surface, speckle, THEMES.cave, ANCHORS, 12345);
    expect(drawn).not.toEqual(a);
  });

  // Authoring means adding and removing ops constantly; if that reshuffled
  // every other op's grain, the format would be unusable to work in.
  it('keeps an op’s grain when another op is inserted before it', () => {
    const flecks = {
      op: 'speckle' as const,
      x: 0,
      y: 0,
      w: 50,
      h: 50,
      count: 10,
      light: 'rockLight' as const,
      dark: 'rockDark' as const,
    };
    const solo = render({ name: 't', ops: [{ op: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'rock' }, flecks] });
    const withExtra = render({
      name: 't',
      ops: [{ op: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'rock' }, flecks, { op: 'rect', x: 9, y: 9, w: 1, h: 1, color: 'rock' }],
    });
    expect(withExtra.slice(0, solo.length)).toEqual(solo);
  });

  // The entrance must never be buried, however the rest of the lid falls.
  it('holds the ceiling flat near the anchor and lets it jag elsewhere', () => {
    const drawn = render({
      name: 't',
      ops: [
        {
          op: 'ceiling',
          step: 100,
          minY: 50,
          maxY: 84,
          flatNear: { at: 'spawnX', within: 120, y: 62 },
          fill: 'rock',
          edge: 'rockEdge',
        },
      ],
    });
    const line = drawn.find((d) => d.kind === 'polyline')!;
    const points: [number, number][] = [];
    for (let i = 0; i < line.args.length; i += 2) points.push([line.args[i], line.args[i + 1]]);

    const near = points.filter(([x]) => Math.abs(x - ANCHORS.spawnX) < 120);
    const far = points.filter(([x]) => Math.abs(x - ANCHORS.spawnX) >= 120);
    expect(near.length).toBeGreaterThan(0);
    expect(near.every(([, y]) => y === 62)).toBe(true);
    expect(far.some(([, y]) => y !== 62)).toBe(true);
    expect(far.every(([, y]) => y >= 50 && y <= 84)).toBe(true);
  });
});

describe('scene marks', () => {
  it('reports the stalactite tips the cave hangs, the same every draw', () => {
    const a = drawScene(recorder().surface, CAVE, THEMES.cave, ANCHORS);
    const b = drawScene(recorder().surface, CAVE, THEMES.cave, ANCHORS);
    expect(a.spikeTips.length).toBeGreaterThan(0);
    expect(a.spikeTips).toEqual(b.spikeTips);
  });

  // A tip is 14 below a ceiling edge that must sit under the spike bar (66)
  // and above the ceiling's own maxY (84) — anywhere else and the drips
  // would fall from empty air.
  it('puts every tip where a stalactite can actually be', () => {
    const { spikeTips } = drawScene(recorder().surface, CAVE, THEMES.cave, ANCHORS);
    for (const [x, y] of spikeTips) {
      // Clear of both side walls, the hatch, and the exit arch.
      expect(x).toBeGreaterThan(22);
      expect(x).toBeLessThan(ANCHORS.worldWidth - 26);
      expect(y).toBeGreaterThan(80);
      expect(y).toBeLessThan(98);
      expect(Math.abs(x - ANCHORS.spawnX)).toBeGreaterThanOrEqual(60);
      expect(Math.abs(x - ANCHORS.exitX)).toBeGreaterThanOrEqual(40);
    }
  });

  it('reports no tips for the indoor scenes', () => {
    for (const key of ['household', 'chalkboard', 'marble'] as ThemeKey[]) {
      const marks = drawScene(recorder().surface, SCENES[key], THEMES[key], ANCHORS);
      expect(marks.spikeTips, key).toEqual([]);
    }
  });
});

describe('the shipped scenes', () => {
  const keys = Object.keys(SCENES) as ThemeKey[];

  it('gives every theme a scene of its own', () => {
    expect(keys).toEqual(expect.arrayContaining(['cave', 'household', 'chalkboard', 'marble']));
    const names = keys.map((k) => SCENES[k].name);
    expect(new Set(names).size).toBe(keys.length);
  });

  it('draws each one without a single unknown anchor or colour', () => {
    for (const key of keys) {
      expect(() => render(SCENES[key], THEMES[key]), key).not.toThrow();
      expect(render(SCENES[key], THEMES[key]).length, key).toBeGreaterThan(100);
    }
  });

  // The fault this format exists to fix: four themes, one picture.
  it('draws a different picture for every theme', () => {
    const shapes = keys.map((key) =>
      JSON.stringify(render(SCENES[key], THEMES.cave).map((d) => [d.kind, d.args])),
    );
    expect(new Set(shapes).size).toBe(keys.length);
  });

  it('hangs nothing from a ceiling that is indoors', () => {
    for (const key of ['household', 'chalkboard', 'marble'] as ThemeKey[]) {
      const ceiling = SCENES[key].ops.find((op) => op.op === 'ceiling');
      expect(ceiling, key).toBeDefined();
      expect(ceiling && 'hang' in ceiling ? ceiling.hang : undefined, key).toBeUndefined();
    }
  });

  it('keeps the cave hanging things, since that is what a cave is', () => {
    const ceiling = CAVE.ops.find((op) => op.op === 'ceiling');
    expect(ceiling && 'hang' in ceiling ? ceiling.hang : undefined).toBeDefined();
  });

  it('produces only real numbers, whatever the seed does', () => {
    for (const key of keys) {
      for (const d of render(SCENES[key], THEMES[key])) {
        for (const value of d.args) expect(Number.isFinite(value), key).toBe(true);
      }
    }
  });

  it('reaches the floor and the walls in every scene', () => {
    for (const key of keys) {
      const drawn = render(SCENES[key], THEMES[key]);
      const widest = Math.max(...drawn.map((d) => (d.kind === 'rect' ? d.args[2] : 0)));
      expect(widest, key).toBeGreaterThanOrEqual(ANCHORS.worldWidth);
      const lowest = Math.max(...drawn.map((d) => (d.kind === 'rect' ? d.args[1] : 0)));
      expect(lowest, key).toBeGreaterThanOrEqual(ANCHORS.groundY);
    }
  });
});

describe('anchorsOf', () => {
  it('takes the height and ground line from the scene, x from the sim', () => {
    const scene: Scene = { name: 'tall', viewH: 450, groundY: 388, ops: [] };
    expect(anchorsOf(scene)).toEqual({
      worldWidth: WORLD_WIDTH,
      viewH: 450,
      groundY: 388,
      spawnX: SPAWN_X,
      exitX: EXIT_X,
    });
  });

  it('leaves every built-in level exactly where it already was', () => {
    // Written as literals rather than as the constants they came from: these
    // four numbers were hard-coded in the renderer before a scene could own
    // them, and the point of the test is that moving them changed nothing. A
    // scene quietly disagreeing would relocate a whole level's furniture.
    for (const key of Object.keys(SCENES) as ThemeKey[]) {
      expect(anchorsOf(SCENES[key]), key).toEqual({
        worldWidth: 1000,
        viewH: 320,
        groundY: 258,
        spawnX: 80,
        exitX: 940,
      });
    }
  });
});
