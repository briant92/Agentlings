import type { Scene, SceneOp } from '../scene';

/**
 * A classroom, built around the one thing the palette already is: `void` is
 * slate green, so the board is the backdrop rather than something drawn on
 * it, and `accentLight` is white, which is chalk.
 *
 * Written entirely in the scene format with no new idioms, which was the
 * point of the format — a second and third room should be authoring, not
 * engineering.
 */

/** A desk with its bench, seen side on. */
function desk(x: number): SceneOp {
  return {
    op: 'repeat',
    at: [x],
    of: [
      { op: 'rect', x: -34, y: 'groundY-40', w: 68, h: 6, color: 'wood' },
      { op: 'rect', x: -34, y: 'groundY-34', w: 68, h: 3, color: 'woodDark' },
      { op: 'rect', x: -30, y: 'groundY-34', w: 5, h: 34, color: 'woodDark' },
      { op: 'rect', x: 25, y: 'groundY-34', w: 5, h: 34, color: 'woodDark' },
      // The bench in front of it.
      { op: 'rect', x: -26, y: 'groundY-20', w: 52, h: 5, color: 'wood' },
      { op: 'rect', x: -22, y: 'groundY-15', w: 4, h: 15, color: 'woodDark' },
      { op: 'rect', x: 18, y: 'groundY-15', w: 4, h: 15, color: 'woodDark' },
      // A page left open on the desk.
      { op: 'rect', x: -12, y: 'groundY-44', w: 22, h: 4, color: 'accentLight', alpha: 0.85 },
    ],
  };
}

/** A stick of chalk lying in the rail. */
function chalk(x: number, len: number): SceneOp {
  return { op: 'rect', x, y: 'groundY-96', w: len, h: 4, color: 'accentLight' };
}

/** A sum or a scribble, in the loose way chalk actually lands. */
function chalkMarks(x: number, y: number, widths: number[]): SceneOp[] {
  return widths.map((w, i) => ({
    op: 'rect',
    x: x + (i % 2) * 6,
    y: y + i * 11,
    w,
    h: 3,
    color: 'accentLight',
    alpha: 0.75,
  }));
}

export const CHALKBOARD: Scene = {
  name: 'chalkboard',
  // Chalk dust hanging in front of the board, and the clock telling the
  // real time — the classroom clock you watch, watching back.
  ambient: [
    { fx: 'motes', x: 130, y: 84, w: 600, h: 100, count: 24 },
    { fx: 'clock', x: 830, y: 116, r: 21 },
  ],
  ops: [
    // Panelled wall behind everything.
    { op: 'rect', x: 0, y: 0, w: 'worldWidth', h: 'groundY', color: 'rock' },
    {
      op: 'band',
      axis: 'x',
      from: 0,
      to: 'worldWidth',
      step: 64,
      of: [{ op: 'rect', x: 0, y: 60, w: 3, h: 190, color: 'woodDark', alpha: 0.5 }],
    },

    // Ceiling: flat plaster, nothing hanging from it.
    { op: 'ceiling', step: 60, minY: 44, maxY: 44, fill: 'rockLight', edge: 'rockEdge' },
    { op: 'rect', x: 0, y: 46, w: 'worldWidth', h: 4, color: 'woodDark' },

    // Side walls.
    { op: 'rect', x: 0, y: 0, w: 22, h: 'viewH', color: 'rock' },
    { op: 'rect', x: 'worldWidth-26', y: 0, w: 26, h: 'viewH', color: 'rock' },

    // The board itself: a wooden frame around the level's own void colour,
    // which is already slate green.
    { op: 'rect', x: 120, y: 74, w: 620, h: 126, color: 'wood' },
    { op: 'rect', x: 126, y: 80, w: 608, h: 114, color: 'void' },
    // Dust never quite wiped off.
    {
      op: 'speckle',
      x: 130,
      y: 84,
      w: 600,
      h: 106,
      count: 80,
      light: 'accentLight',
      dark: 'accent',
    },
    ...chalkMarks(160, 96, [70, 52, 88, 44]),
    ...chalkMarks(360, 104, [96, 64, 40]),
    ...chalkMarks(560, 92, [58, 84, 50, 72]),

    // Chalk rail along the bottom of the board, with chalk in it.
    { op: 'rect', x: 120, y: 'groundY-100', w: 620, h: 8, color: 'wood' },
    { op: 'rect', x: 120, y: 'groundY-92', w: 620, h: 3, color: 'woodDark' },
    chalk(150, 22),
    chalk(182, 14),
    chalk(230, 18),
    chalk(600, 20),
    chalk(640, 12),
    // The eraser.
    { op: 'rect', x: 430, y: 'groundY-102', w: 30, h: 10, color: 'accentDark' },
    { op: 'rect', x: 430, y: 'groundY-96', w: 30, h: 4, color: 'woodDark' },

    // A clock, because every classroom has one you are watching. The hands
    // are not painted here — the ambient clock draws them live, at the
    // actual time of day.
    { op: 'circle', x: 830, y: 116, r: 26, color: 'wood' },
    { op: 'circle', x: 830, y: 116, r: 21, color: 'accentLight' },

    // Floorboards and skirting.
    { op: 'rect', x: 0, y: 'groundY-12', w: 'worldWidth', h: 12, color: 'wood' },
    { op: 'rect', x: 0, y: 'groundY-14', w: 'worldWidth', h: 2, color: 'woodDark' },
    { op: 'rect', x: 0, y: 'groundY', w: 'worldWidth', h: 62, color: 'rockLight' },
    {
      op: 'band',
      axis: 'x',
      from: 0,
      to: 'worldWidth',
      step: 52,
      of: [{ op: 'rect', x: 0, y: 'groundY', w: 2, h: 62, color: 'woodDark', alpha: 0.4 }],
    },
    {
      op: 'speckle',
      x: 0,
      y: 'groundY+2',
      w: 'worldWidth',
      h: 58,
      count: 60,
      light: 'wood',
      dark: 'woodDark',
    },
    // Chalk dust that made it to the floor.
    {
      op: 'tufts',
      x: 130,
      y: 'groundY+2',
      w: 610,
      h: 0,
      count: 40,
      height: 2,
      color: 'accentLight',
      alpha: 0.4,
    },

    // Desks, so the room below the board is a classroom rather than a floor.
    desk(210),
    desk(420),
    desk(630),

    // Crew drop through a ceiling hatch.
    { op: 'rect', x: 'spawnX-22', y: 44, w: 44, h: 8, color: 'wood' },
    { op: 'rect', x: 'spawnX-18', y: 52, w: 36, h: 14, color: 'woodDark' },
    { op: 'rect', x: 'spawnX-13', y: 56, w: 26, h: 8, color: 'void' },
    {
      op: 'poly',
      points: [
        ['spawnX-18', 52],
        ['spawnX-38', 36],
        ['spawnX-32', 31],
        ['spawnX-12', 47],
      ],
      color: 'wood',
    },

    // Classroom door with a wired-glass pane.
    { op: 'rect', x: 'exitX-26', y: 'groundY-78', w: 52, h: 78, color: 'wood' },
    { op: 'rect', x: 'exitX-21', y: 'groundY-73', w: 42, h: 73, color: 'woodDark' },
    { op: 'rect', x: 'exitX-15', y: 'groundY-66', w: 30, h: 26, color: 'accent', alpha: 0.6 },
    {
      op: 'band',
      axis: 'x',
      from: 'exitX-15',
      to: 'exitX+15',
      step: 8,
      of: [{ op: 'rect', x: 0, y: 'groundY-66', w: 1, h: 26, color: 'rockEdge', alpha: 0.5 }],
    },
    { op: 'rect', x: 'exitX+10', y: 'groundY-40', w: 5, h: 5, color: 'accentLight' },
    { op: 'rect', x: 'exitX-28', y: 'groundY-82', w: 56, h: 5, color: 'stoneDark' },
  ],
};
