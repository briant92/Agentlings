import { describe, expect, it } from 'vitest';
import { createAmbience, type AmbientSurface } from './ambience';
import { DB } from './palette';
import type { Anchors, SceneMarks } from './scene';
import { THEMES } from './themes';

const ANCHORS: Anchors = {
  worldWidth: 1000,
  viewH: 320,
  groundY: 258,
  spawnX: 80,
  exitX: 940,
};

const NO_MARKS: SceneMarks = { spikeTips: [] };

interface Fill {
  kind: 'rect' | 'poly';
  x: number;
  y: number;
  color: number;
  alpha?: number;
}

/** Records what the effects draw, so they can be tested without a canvas. */
function recorder(): { surface: AmbientSurface; drawn: Fill[] } {
  const drawn: Fill[] = [];
  const catcher = (partial: Omit<Fill, 'color' | 'alpha'>) => ({
    fill: (style: number | { color: number; alpha?: number }) => {
      const color = typeof style === 'number' ? style : style.color;
      const alpha = typeof style === 'number' ? undefined : style.alpha;
      drawn.push({ ...partial, color, alpha });
      return undefined;
    },
  });
  const surface: AmbientSurface = {
    rect: (x, y) => catcher({ kind: 'rect', x, y }),
    poly: (points) => catcher({ kind: 'poly', x: points[0], y: points[1] }),
  };
  return { surface, drawn };
}

describe('drips', () => {
  it('gathers at the tip, falls, and splashes on the ground', () => {
    const amb = createAmbience([{ fx: 'drips' }], {
      anchors: ANCHORS,
      theme: THEMES.cave,
      marks: { spikeTips: [[500, 90]] },
      rng: () => 0.5,
    });
    const { surface, drawn } = recorder();

    // The whole first wait (1 + 0.5·4 = 3s) passes without a pixel.
    amb.tick(surface, 3.0, 0);
    expect(drawn.length).toBe(0);

    // Gathering: the drop hangs at the tip.
    amb.tick(surface, 0.016, 0);
    expect(drawn.length).toBe(1);
    expect(drawn[0]).toMatchObject({ x: 499, y: 90, color: DB.sky });

    // Let go: every falling streak stays on the tip's own x.
    amb.tick(surface, 1.2, 0);
    let guard = 0;
    while (drawn.every((d) => d.color !== DB.paleBlue) && guard++ < 200) {
      amb.tick(surface, 0.05, 0);
    }
    expect(drawn.filter((d) => d.color === DB.sky).every((d) => d.x === 499)).toBe(true);

    // The splash lands just above the walkway, in the lighter water colour.
    const splash = drawn.filter((d) => d.color === DB.paleBlue);
    expect(splash.length).toBeGreaterThan(0);
    expect(Math.max(...splash.map((d) => d.y))).toBe(ANCHORS.groundY - 3);
  });

  it('does nothing at all in a scene that reported no tips', () => {
    const amb = createAmbience([{ fx: 'drips' }], {
      anchors: ANCHORS,
      theme: THEMES.cave,
      marks: NO_MARKS,
      rng: () => 0.5,
    });
    const { surface, drawn } = recorder();
    for (let i = 0; i < 100; i++) amb.tick(surface, 0.1, i * 0.1);
    expect(drawn.length).toBe(0);
  });
});

describe('flyer', () => {
  it('stays home until its hour, then crosses in bat grey', () => {
    const amb = createAmbience([{ fx: 'flyer' }], {
      anchors: ANCHORS,
      theme: THEMES.cave,
      marks: NO_MARKS,
      rng: () => 0.5,
    });
    const { surface, drawn } = recorder();
    amb.tick(surface, 0.016, 0);
    amb.tick(surface, 0.016, 5);
    expect(drawn.length).toBe(0);

    // Past the scheduled hour (t = 11): body and both wings, every frame.
    amb.tick(surface, 0.016, 12);
    expect(drawn.length).toBe(3);
    expect(drawn.every((d) => d.color === DB.greyDeep)).toBe(true);
  });
});

describe('motes', () => {
  it('keeps every fleck inside its region, in the dust colour', () => {
    let s = 42;
    const rng = () => {
      s = (s * 16807) % 2147483647;
      return (s % 1000) / 1000;
    };
    const amb = createAmbience(
      [{ fx: 'motes', x: 130, y: 84, w: 600, h: 100, count: 24 }],
      { anchors: ANCHORS, theme: THEMES.chalkboard, marks: NO_MARKS, rng },
    );
    const { surface, drawn } = recorder();
    for (let i = 0; i < 120; i++) amb.tick(surface, 0.05, i * 0.05);
    expect(drawn.length).toBe(24 * 120);
    for (const d of drawn) {
      expect(d.color).toBe(THEMES.chalkboard.accentLight);
      expect(d.x).toBeGreaterThanOrEqual(127);
      expect(d.x).toBeLessThanOrEqual(733);
      expect(d.y).toBeGreaterThanOrEqual(83);
      expect(d.y).toBeLessThanOrEqual(187);
    }
  });
});

describe('beam', () => {
  it('paints the shaft, and holds the dust between its slanted edges', () => {
    const amb = createAmbience(
      [
        {
          fx: 'beam',
          topLeft: 308,
          topRight: 400,
          topY: 100,
          botLeft: 380,
          botRight: 560,
          botY: 'groundY',
          count: 4,
        },
      ],
      { anchors: ANCHORS, theme: THEMES.household, marks: NO_MARKS, rng: () => 0.5 },
    );
    const { surface, drawn } = recorder();
    amb.tick(surface, 0.016, 0);

    const shafts = drawn.filter((d) => d.kind === 'poly');
    expect(shafts.length).toBe(2);
    expect(shafts.every((d) => d.color === THEMES.household.accent)).toBe(true);

    const dust = drawn.filter((d) => d.kind === 'rect');
    expect(dust.length).toBe(4);
    for (const m of dust) {
      expect(m.y).toBeGreaterThanOrEqual(99);
      expect(m.y).toBeLessThanOrEqual(259);
      const f = (m.y - 100) / 158;
      expect(m.x).toBeGreaterThanOrEqual(308 + (380 - 308) * f - 4);
      expect(m.x).toBeLessThanOrEqual(400 + (560 - 400) * f + 4);
    }
  });
});

describe('glints', () => {
  it('sparks at a named point, turns gold, and dies inside a second', () => {
    const amb = createAmbience(
      [{ fx: 'glints', points: [[300, 90]], strips: [] }],
      { anchors: ANCHORS, theme: THEMES.marble, marks: NO_MARKS, rng: () => 0.4 },
    );
    const { surface, drawn } = recorder();

    amb.tick(surface, 0.016, 5);
    expect(drawn.length).toBe(0);

    amb.tick(surface, 0.016, 6);
    expect(drawn.some((d) => d.color === DB.white && d.x === 299)).toBe(true);

    amb.tick(surface, 0.016, 6.4);
    expect(drawn.some((d) => d.color === THEMES.marble.accentLight)).toBe(true);

    const settled = drawn.length;
    amb.tick(surface, 0.016, 7);
    expect(drawn.length).toBe(settled);
  });
});

describe('clock', () => {
  it('draws the hands at the injected time of day', () => {
    const amb = createAmbience([{ fx: 'clock', x: 830, y: 116, r: 21 }], {
      anchors: ANCHORS,
      theme: THEMES.chalkboard,
      marks: NO_MARKS,
      now: () => new Date(2026, 7, 5, 3, 0, 0),
    });
    const { surface, drawn } = recorder();
    amb.tick(surface, 0.016, 0);

    const ink = drawn.filter((d) => d.color === THEMES.chalkboard.rockEdge);
    const rose = drawn.filter((d) => d.color === DB.rose);

    // Three o'clock: the hour hand reaches right, the minute hand points up.
    expect(ink.some((d) => d.x > 830 && Math.abs(d.y - 116) <= 2)).toBe(true);
    expect(ink.some((d) => d.y < 113 && Math.abs(d.x - 830) <= 2)).toBe(true);
    // The second hand is its own colour, and at :00 it points up too.
    expect(rose.length).toBeGreaterThan(0);
    expect(rose.every((d) => Math.abs(d.x - 829) <= 1 && d.y <= 116)).toBe(true);
  });
});
