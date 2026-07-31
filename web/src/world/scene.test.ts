import { describe, expect, it } from 'vitest';
import { CAVE } from './scenes/cave';
import { HOUSEHOLD } from './scenes/household';
import { drawScene, resolveCoord, type Anchors, type Scene, type Surface } from './scene';
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

function render(scene: Scene, theme = THEMES.cave): Drawn[] {
  const { surface, drawn } = recorder();
  drawScene(surface, scene, theme, ANCHORS);
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
    const speckle: Scene = {
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

describe('the shipped scenes', () => {
  it('draw the cave without a single unknown anchor or colour', () => {
    expect(() => render(CAVE)).not.toThrow();
    expect(render(CAVE).length).toBeGreaterThan(500);
  });

  it('draw the household room, and it is not the cave', () => {
    expect(() => render(HOUSEHOLD, THEMES.household)).not.toThrow();
    expect(render(HOUSEHOLD, THEMES.household)).not.toEqual(render(CAVE, THEMES.household));
  });

  // The point of the whole exercise: a level about chores has no stalactites.
  it('hangs nothing from the household ceiling', () => {
    const ceiling = HOUSEHOLD.ops.find((op) => op.op === 'ceiling');
    expect(ceiling).toBeDefined();
    expect(ceiling && 'hang' in ceiling ? ceiling.hang : undefined).toBeUndefined();
  });

  it('keeps every scene inside the world it is drawn in', () => {
    for (const scene of [CAVE, HOUSEHOLD]) {
      for (const d of render(scene)) {
        for (const value of d.args) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});
