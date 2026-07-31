import type { Scene, SceneOp } from '../scene';

/**
 * A room, which is what a level about chores should look like.
 *
 * This is the scene that justifies the format. The geometry used to be a cave
 * whatever the theme said, so Home Chores rendered stalactites and hanging
 * vines in beige. Nothing here is drawn by different code — only by different
 * data: the ceiling is flat plaster with a picture rail instead of rock, the
 * pillars are a doorway and shelving, and the floor is boards rather than
 * mineral-veined stone.
 */

/** A shelf unit: uprights, shelves, and a few things standing on them. */
function shelf(x: number, w: number, top: number): SceneOp[] {
  const shelves: SceneOp[] = [];
  for (let i = 0; i < 3; i++) {
    const y = top + 26 + i * 30;
    shelves.push({ op: 'rect', x, y, w, h: 4, color: 'wood' });
    shelves.push({ op: 'rect', x, y: y + 4, w, h: 2, color: 'woodDark' });
    // Objects on the shelf, alternating so the two units do not match.
    shelves.push({ op: 'rect', x: x + 6 + i * 4, y: y - 10, w: 8, h: 10, color: 'accent' });
    shelves.push({
      op: 'rect',
      x: x + w - 18 - i * 3,
      y: y - 7,
      w: 6,
      h: 7,
      color: 'accentLight',
    });
  }
  return [
    { op: 'rect', x, y: top, w: 4, h: 'groundY', color: 'woodDark' },
    { op: 'rect', x: x + w - 4, y: top, w: 4, h: 'groundY', color: 'woodDark' },
    { op: 'rect', x, y: top, w, h: 6, color: 'wood' },
    ...shelves,
  ];
}

export const HOUSEHOLD: Scene = {
  name: 'household',
  ops: [
    // Back wall, papered, with a dado rail low down.
    { op: 'rect', x: 0, y: 0, w: 'worldWidth', h: 'groundY', color: 'void' },
    {
      op: 'band',
      axis: 'x',
      from: 0,
      to: 'worldWidth',
      step: 14,
      of: [{ op: 'rect', x: 0, y: 40, w: 2, h: 200, color: 'accentDark', alpha: 0.18 }],
    },
    { op: 'rect', x: 0, y: 'groundY-64', w: 'worldWidth', h: 3, color: 'accentDark', alpha: 0.5 },

    // Ceiling: flat plaster with a picture rail. Same idiom as the cave's
    // rock lid, told to be straight and to hang nothing from itself.
    {
      op: 'ceiling',
      step: 60,
      minY: 48,
      maxY: 48,
      fill: 'rock',
      edge: 'rockEdge',
    },
    { op: 'rect', x: 0, y: 50, w: 'worldWidth', h: 4, color: 'wood' },
    { op: 'rect', x: 0, y: 54, w: 'worldWidth', h: 2, color: 'woodDark' },

    // Side walls.
    { op: 'rect', x: 0, y: 0, w: 22, h: 'viewH', color: 'rock' },
    { op: 'rect', x: 'worldWidth-26', y: 0, w: 26, h: 'viewH', color: 'rock' },

    // A window, because a room has one.
    { op: 'rect', x: 300, y: 96, w: 108, h: 84, color: 'woodDark' },
    { op: 'rect', x: 304, y: 100, w: 100, h: 76, color: 'accentLight', alpha: 0.55 },
    { op: 'rect', x: 352, y: 100, w: 4, h: 76, color: 'woodDark' },
    { op: 'rect', x: 304, y: 134, w: 100, h: 4, color: 'woodDark' },
    { op: 'rect', x: 296, y: 92, w: 116, h: 6, color: 'wood' },

    // Shelving where the cave had pillars.
    ...shelf(520, 78, 104),
    ...shelf(660, 62, 120),

    // Skirting board and floorboards.
    { op: 'rect', x: 0, y: 'groundY-10', w: 'worldWidth', h: 10, color: 'wood' },
    { op: 'rect', x: 0, y: 'groundY-12', w: 'worldWidth', h: 2, color: 'woodDark' },
    { op: 'rect', x: 0, y: 'groundY', w: 'worldWidth', h: 62, color: 'rock' },
    {
      op: 'band',
      axis: 'x',
      from: 0,
      to: 'worldWidth',
      step: 46,
      of: [{ op: 'rect', x: 0, y: 'groundY', w: 2, h: 62, color: 'woodDark', alpha: 0.45 }],
    },
    { op: 'rect', x: 0, y: 'groundY+16', w: 'worldWidth', h: 2, color: 'rockDark', alpha: 0.35 },
    { op: 'rect', x: 0, y: 'groundY+38', w: 'worldWidth', h: 2, color: 'rockDark', alpha: 0.35 },
    {
      op: 'speckle',
      x: 0,
      y: 'groundY+2',
      w: 'worldWidth',
      h: 58,
      count: 70,
      light: 'rockLight',
      dark: 'rockDark',
    },

    // A rug, so the floor is not one flat plane.
    { op: 'rect', x: 150, y: 'groundY+8', w: 220, h: 34, color: 'grassDark' },
    { op: 'rect', x: 156, y: 'groundY+12', w: 208, h: 26, color: 'grass', alpha: 0.8 },
    { op: 'rect', x: 168, y: 'groundY+18', w: 184, h: 14, color: 'grassDark', alpha: 0.6 },

    // The hatch becomes a loft door in the ceiling — crew still drop in.
    { op: 'rect', x: 'spawnX-22', y: 48, w: 44, h: 8, color: 'wood' },
    { op: 'rect', x: 'spawnX-18', y: 56, w: 36, h: 14, color: 'woodDark' },
    { op: 'rect', x: 'spawnX-13', y: 60, w: 26, h: 8, color: 'void' },
    {
      op: 'poly',
      points: [
        ['spawnX-18', 56],
        ['spawnX-38', 40],
        ['spawnX-32', 35],
        ['spawnX-12', 51],
      ],
      color: 'wood',
    },

    // The exit becomes a panelled door with a handle.
    { op: 'rect', x: 'exitX-24', y: 'groundY-72', w: 48, h: 72, color: 'wood' },
    { op: 'rect', x: 'exitX-20', y: 'groundY-68', w: 40, h: 68, color: 'woodDark' },
    { op: 'rect', x: 'exitX-15', y: 'groundY-62', w: 30, h: 24, color: 'wood' },
    { op: 'rect', x: 'exitX-15', y: 'groundY-32', w: 30, h: 24, color: 'wood' },
    { op: 'rect', x: 'exitX+9', y: 'groundY-38', w: 5, h: 5, color: 'accentLight' },
    { op: 'rect', x: 'exitX-26', y: 'groundY-76', w: 52, h: 5, color: 'stoneDark' },
  ],
};
