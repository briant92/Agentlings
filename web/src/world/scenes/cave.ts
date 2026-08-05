import type { Scene, SceneOp } from '../scene';

/**
 * The original cave, transcribed op for op from the Pixi calls it replaced.
 *
 * Visuals phase 3 decided to keep the built-in art, so this file is the proof
 * the format can hold it: nothing here is a simplification of what was drawn
 * before. The one difference is the noise — each op now draws from its own
 * seed, so the speckle and vines fall in different places than they did. The
 * grain is different; the cave is the same cave.
 */

/** A grassy mound: five rects, sized around its centre. */
function mound(x: number, w: number, h: number): SceneOp[] {
  const left = x - w / 2;
  return [
    { op: 'rect', x: left, y: `groundY-${h}`, w, h, color: 'rock' },
    { op: 'rect', x: left + 5, y: `groundY-${h + 4}`, w: w - 10, h: 4, color: 'rock' },
    { op: 'rect', x: left + 5, y: `groundY-${h + 6}`, w: w - 10, h: 2, color: 'grass' },
    { op: 'rect', x: left, y: `groundY-${h + 2}`, w, h: 2, color: 'grass' },
    { op: 'rect', x: left, y: `groundY-${h}`, w, h: 2, color: 'grassDark' },
  ];
}

/** One row of the floor's dithered shade band. */
function ditherRow(row: number): SceneOp {
  return {
    op: 'band',
    axis: 'x',
    from: 24,
    to: 'worldWidth-26',
    step: 6,
    of: [
      {
        op: 'rect',
        x: (row % 2) * 3,
        y: `groundY+${7 + row * 3}`,
        w: 3,
        h: 3,
        color: 'rockDark',
        alpha: 0.4,
      },
    ],
  };
}

export const CAVE: Scene = {
  name: 'cave',
  // Water off the stalactites the ceiling actually grew, and a rare bat.
  ambient: [{ fx: 'drips' }, { fx: 'flyer' }],
  ops: [
    // Distant accent pillars: capital, banded shaft, base.
    {
      op: 'repeat',
      at: [310, 490, 670],
      of: [
        { op: 'rect', x: -26, y: 100, w: 52, h: 8, color: 'accent', alpha: 0.5 },
        { op: 'rect', x: -22, y: 108, w: 44, h: 8, color: 'accent', alpha: 0.5 },
        { op: 'rect', x: -17, y: 116, w: 34, h: 'groundY-116', color: 'accent', alpha: 0.45 },
        { op: 'rect', x: -10, y: 116, w: 8, h: 'groundY-116', color: 'accentLight', alpha: 0.4 },
        {
          op: 'band',
          from: 140,
          to: 'groundY-20',
          step: 26,
          of: [{ op: 'rect', x: -17, y: 0, w: 34, h: 3, color: 'accentDark', alpha: 0.4 }],
        },
        { op: 'rect', x: -22, y: 'groundY-12', w: 44, h: 12, color: 'accent', alpha: 0.5 },
      ],
    },

    // Ceiling: rock mass with a jagged underside, flattened above the hatch,
    // stalactites at the deep points and hanging vines elsewhere.
    {
      op: 'ceiling',
      step: 60,
      minY: 50,
      maxY: 84,
      flatNear: { at: 'spawnX', within: 50, y: 62 },
      fill: 'rock',
      edge: 'rockEdge',
      hang: {
        clearOf: [
          { at: 'spawnX', within: 60 },
          { at: 'exitX', within: 40 },
        ],
        spike: { chance: 0.3, below: 66, color: 'rock', tip: 'rockDark' },
        vine: { chance: 0.4, min: 16, max: 42, color: 'grassDark', tip: 'grass' },
      },
    },
    {
      op: 'speckle',
      x: 0,
      y: 0,
      w: 'worldWidth',
      h: 42,
      count: 150,
      light: 'rockLight',
      dark: 'rockDark',
    },
    {
      op: 'veins',
      x: 20,
      y: 6,
      w: 'worldWidth-40',
      h: 30,
      count: 14,
      color: 'rockEdge',
      alpha: 0.8,
    },

    // Side walls.
    { op: 'rect', x: 0, y: 0, w: 22, h: 'viewH', color: 'rock' },
    { op: 'rect', x: 'worldWidth-26', y: 0, w: 26, h: 'viewH', color: 'rock' },
    {
      op: 'speckle',
      x: 0,
      y: 60,
      w: 20,
      h: 260,
      count: 30,
      light: 'rockLight',
      dark: 'rockDark',
    },
    {
      op: 'speckle',
      x: 'worldWidth-24',
      y: 60,
      w: 22,
      h: 260,
      count: 30,
      light: 'rockLight',
      dark: 'rockDark',
    },

    // Low grassy mounds along the back of the walkway.
    ...mound(185, 64, 10),
    ...mound(555, 44, 8),
    ...mound(865, 52, 12),

    // Floor slab: fringe, dithered shade band, mineral veins.
    { op: 'rect', x: 0, y: 'groundY+2', w: 'worldWidth', h: 60, color: 'rock' },
    {
      op: 'speckle',
      x: 0,
      y: 'groundY+8',
      w: 'worldWidth',
      h: 52,
      count: 130,
      light: 'rockLight',
      dark: 'rockDark',
    },
    {
      op: 'veins',
      x: 20,
      y: 'groundY+10',
      w: 'worldWidth-40',
      h: 42,
      count: 10,
      color: 'rockEdge',
      alpha: 0.8,
    },
    ditherRow(0),
    ditherRow(1),
    ditherRow(2),
    { op: 'rect', x: 0, y: 'groundY-3', w: 'worldWidth', h: 6, color: 'grass' },
    { op: 'rect', x: 0, y: 'groundY+3', w: 'worldWidth', h: 3, color: 'grassDark' },
    {
      op: 'tufts',
      x: 24,
      y: 'groundY-6',
      w: 'worldWidth-52',
      h: 0,
      count: 90,
      height: 4,
      color: 'grass',
      alt: 'grassDark',
    },

    // Entrance hatch: slatted wooden box with a propped-open lid.
    {
      op: 'poly',
      points: [
        ['spawnX-18', 64],
        ['spawnX-36', 46],
        ['spawnX-30', 41],
        ['spawnX-12', 59],
      ],
      color: 'wood',
    },
    {
      op: 'poly',
      points: [
        ['spawnX-33', 46],
        ['spawnX-27', 40],
        ['spawnX-25', 42],
        ['spawnX-31', 48],
      ],
      color: 'woodDark',
    },
    { op: 'rect', x: 'spawnX-18', y: 62, w: 36, h: 14, color: 'wood' },
    { op: 'rect', x: 'spawnX-18', y: 62, w: 36, h: 3, color: 'woodDark' },
    {
      op: 'repeat',
      at: [-8, 2, 12],
      of: [{ op: 'rect', x: 'spawnX', y: 65, w: 2, h: 11, color: 'woodDark', alpha: 0.8 }],
    },
    { op: 'rect', x: 'spawnX-13', y: 67, w: 26, h: 7, color: 'void' },

    // Exit: stone arch with grout lines and torch stands.
    { op: 'rect', x: 'exitX-18', y: 'groundY-40', w: 36, h: 40, color: 'stoneDark' },
    { op: 'circle', x: 'exitX', y: 'groundY-38', r: 18, color: 'stoneDark' },
    { op: 'rect', x: 'exitX-18', y: 'groundY-28', w: 36, h: 2, color: 'rockEdge', alpha: 0.8 },
    { op: 'rect', x: 'exitX-18', y: 'groundY-14', w: 36, h: 2, color: 'rockEdge', alpha: 0.8 },
    { op: 'rect', x: 'exitX-2', y: 'groundY-52', w: 4, h: 8, color: 'rockEdge', alpha: 0.8 },
    { op: 'rect', x: 'exitX-10', y: 'groundY-32', w: 20, h: 32, color: 'void' },
    { op: 'circle', x: 'exitX', y: 'groundY-32', r: 10, color: 'void' },
    {
      op: 'repeat',
      at: [-27, 27],
      of: [
        { op: 'rect', x: 'exitX-2', y: 'groundY-26', w: 4, h: 26, color: 'woodDark' },
        { op: 'rect', x: 'exitX-4', y: 'groundY-30', w: 8, h: 5, color: 'stoneDark' },
      ],
    },
  ],
};
