import type { Scene, SceneOp } from '../scene';

/**
 * A gilded hall, for the palette the theme list calls "Marble & gold":
 * `rock` is steel, `rockLight` pale blue, and `accent`/`accentLight` are
 * bronze and gold.
 *
 * The floor is the one shape the format could not draw directly — a
 * checkerboard is two bands of the same step, half a tile apart, which is
 * why `band` takes a `from` rather than always starting at zero.
 */

/** A fluted column: base, shaft with flutes, gilded capital. */
function column(x: number): SceneOp {
  return {
    op: 'repeat',
    at: [x],
    of: [
      // Capital.
      { op: 'rect', x: -30, y: 88, w: 60, h: 10, color: 'accent' },
      { op: 'rect', x: -30, y: 88, w: 60, h: 3, color: 'accentLight' },
      { op: 'rect', x: -25, y: 98, w: 50, h: 8, color: 'rockLight' },
      // Shaft.
      { op: 'rect', x: -20, y: 106, w: 40, h: 'groundY-124', color: 'rockLight' },
      {
        op: 'band',
        axis: 'x',
        from: -16,
        to: 18,
        step: 8,
        of: [{ op: 'rect', x: 0, y: 106, w: 2, h: 'groundY-124', color: 'rockDark', alpha: 0.5 }],
      },
      { op: 'rect', x: -20, y: 106, w: 5, h: 'groundY-124', color: 'accentLight', alpha: 0.2 },
      // Base.
      { op: 'rect', x: -26, y: 'groundY-18', w: 52, h: 10, color: 'rockLight' },
      { op: 'rect', x: -30, y: 'groundY-8', w: 60, h: 8, color: 'accent' },
      { op: 'rect', x: -30, y: 'groundY-8', w: 60, h: 2, color: 'accentLight' },
    ],
  };
}

export const MARBLE: Scene = {
  name: 'marble',
  // The gilding glints: the column capitals and keystone by name, plus
  // random spots along the gold rails the scene lays below.
  ambient: [
    {
      fx: 'glints',
      points: [
        [270, 90],
        [330, 90],
        [470, 90],
        [530, 90],
        [670, 90],
        [730, 90],
        ['exitX', 'groundY-146'],
      ],
      strips: [
        { x: 0, y: 56, w: 'worldWidth' },
        { x: 0, y: 'groundY-68', w: 'worldWidth' },
        { x: 0, y: 'groundY-2', w: 'worldWidth' },
        { x: 'exitX-46', y: 'groundY-144', w: 92 },
      ],
    },
  ],
  ops: [
    // Back wall in dressed stone, with a gold dado.
    { op: 'rect', x: 0, y: 0, w: 'worldWidth', h: 'groundY', color: 'rock' },
    {
      op: 'band',
      from: 60,
      to: 'groundY',
      step: 34,
      of: [{ op: 'rect', x: 0, y: 0, w: 'worldWidth', h: 2, color: 'rockEdge', alpha: 0.35 }],
    },
    { op: 'rect', x: 0, y: 'groundY-70', w: 'worldWidth', h: 4, color: 'accent' },
    { op: 'rect', x: 0, y: 'groundY-66', w: 'worldWidth', h: 2, color: 'accentDark' },

    // Coffered ceiling: flat, with recessed panels and a gold rail.
    { op: 'ceiling', step: 60, minY: 52, maxY: 52, fill: 'rockLight', edge: 'rockEdge' },
    {
      op: 'band',
      axis: 'x',
      from: 20,
      to: 'worldWidth-40',
      step: 74,
      of: [
        { op: 'rect', x: 0, y: 12, w: 54, h: 26, color: 'rockDark', alpha: 0.55 },
        { op: 'rect', x: 6, y: 18, w: 42, h: 14, color: 'accent', alpha: 0.35 },
      ],
    },
    { op: 'rect', x: 0, y: 54, w: 'worldWidth', h: 5, color: 'accent' },
    { op: 'rect', x: 0, y: 59, w: 'worldWidth', h: 2, color: 'accentDark' },

    // Side walls.
    { op: 'rect', x: 0, y: 0, w: 22, h: 'viewH', color: 'rock' },
    { op: 'rect', x: 'worldWidth-26', y: 0, w: 26, h: 'viewH', color: 'rock' },

    // The colonnade.
    column(300),
    column(500),
    column(700),

    // Checkerboard floor: two bands of one step, offset by half a tile.
    { op: 'rect', x: 0, y: 'groundY', w: 'worldWidth', h: 62, color: 'rockLight' },
    {
      op: 'band',
      axis: 'x',
      from: 0,
      to: 'worldWidth',
      step: 80,
      of: [{ op: 'rect', x: 0, y: 'groundY', w: 40, h: 30, color: 'rockDark' }],
    },
    {
      op: 'band',
      axis: 'x',
      from: 40,
      to: 'worldWidth',
      step: 80,
      of: [{ op: 'rect', x: 0, y: 'groundY+30', w: 40, h: 32, color: 'rockDark' }],
    },
    // Veining, which is what makes stone read as marble rather than as tile.
    {
      op: 'veins',
      x: 0,
      y: 'groundY+2',
      w: 'worldWidth',
      h: 58,
      count: 26,
      color: 'rockEdge',
      alpha: 0.35,
    },
    { op: 'rect', x: 0, y: 'groundY-4', w: 'worldWidth', h: 4, color: 'accent' },
    { op: 'rect', x: 0, y: 'groundY', w: 'worldWidth', h: 2, color: 'accentDark' },

    // A runner down the middle. Bronze and olive rather than the palette's
    // greens: this theme is called "Marble & gold", and a teal carpet on pale
    // stone reads as a blob dropped on the floor.
    { op: 'rect', x: 340, y: 'groundY+12', w: 320, h: 38, color: 'accentDark' },
    { op: 'rect', x: 348, y: 'groundY+16', w: 304, h: 30, color: 'accent', alpha: 0.55 },
    { op: 'rect', x: 366, y: 'groundY+22', w: 268, h: 16, color: 'accentDark', alpha: 0.6 },
    {
      op: 'band',
      axis: 'x',
      from: 340,
      to: 660,
      step: 40,
      of: [{ op: 'rect', x: 0, y: 'groundY+12', w: 2, h: 38, color: 'accentLight', alpha: 0.25 }],
    },

    // Crew arrive through a hatch in the coffered ceiling.
    { op: 'rect', x: 'spawnX-24', y: 52, w: 48, h: 9, color: 'accent' },
    { op: 'rect', x: 'spawnX-18', y: 61, w: 36, h: 14, color: 'stoneDark' },
    { op: 'rect', x: 'spawnX-13', y: 65, w: 26, h: 8, color: 'void' },
    {
      op: 'poly',
      points: [
        ['spawnX-18', 61],
        ['spawnX-38', 45],
        ['spawnX-32', 40],
        ['spawnX-12', 56],
      ],
      color: 'accent',
    },

    // A grand arched doorway. Sized against the colonnade rather than against
    // the cave's arch it replaced — at the old 56px it read as a mouse hole in
    // a hall with 150px columns.
    { op: 'rect', x: 'exitX-38', y: 'groundY-104', w: 76, h: 104, color: 'accent' },
    { op: 'circle', x: 'exitX', y: 'groundY-104', r: 38, color: 'accent' },
    { op: 'rect', x: 'exitX-31', y: 'groundY-100', w: 62, h: 100, color: 'rockLight' },
    { op: 'circle', x: 'exitX', y: 'groundY-100', r: 31, color: 'rockLight' },
    { op: 'rect', x: 'exitX-24', y: 'groundY-96', w: 48, h: 96, color: 'stoneDark' },
    { op: 'circle', x: 'exitX', y: 'groundY-96', r: 24, color: 'stoneDark' },
    { op: 'rect', x: 'exitX-18', y: 'groundY-92', w: 36, h: 92, color: 'void' },
    { op: 'circle', x: 'exitX', y: 'groundY-92', r: 18, color: 'void' },
    // Keystone and a gilded lintel over the arch.
    { op: 'rect', x: 'exitX-6', y: 'groundY-150', w: 12, h: 16, color: 'accentLight' },
    { op: 'rect', x: 'exitX-46', y: 'groundY-146', w: 92, h: 6, color: 'accent' },
    // Torch stands flank it; the flames themselves are drawn live.
    {
      op: 'repeat',
      at: [-27, 27],
      of: [
        { op: 'rect', x: 'exitX-2', y: 'groundY-26', w: 4, h: 26, color: 'accentDark' },
        { op: 'rect', x: 'exitX-4', y: 'groundY-30', w: 8, h: 5, color: 'accent' },
      ],
    },
  ],
};
