import type { Scene, Theme } from '../scene';
import { DB } from '../palette';

/**
 * The title screen's own backdrop: the Starbase grounds — lawn, the black
 * glass HQ, palms, a flag, parking, and Starship horizontal on its
 * transporter. Standalone from the level scenes in `./index.ts` on purpose —
 * decoration for the boot screen, never a level a pack could select, so it
 * does not touch `ThemeKey` or the server's theme validation.
 */
export const STARBASE_THEME: Theme = {
  void: DB.sky,
  rock: DB.ink,
  rockLight: DB.steel,
  rockDark: DB.greyDark,
  rockEdge: DB.black,
  accent: DB.paleBlue,
  accentLight: DB.white,
  accentDark: DB.blueDeep,
  grass: DB.limeLight,
  grassDark: DB.green,
  wood: DB.brown,
  woodDark: DB.brownDark,
  stoneDark: DB.greyDeep,
  flame: DB.red,
  flameCore: DB.yellow,
  hover: DB.white,
};

/** One palm: a trunk and three fronds, anchored at the lawn line. */
function palm(dx: number): Scene['ops'] {
  return [
    { op: 'rect', x: dx - 3, y: 'groundY-40', w: 6, h: 40, color: 'wood' },
    { op: 'rect', x: dx - 3, y: 'groundY-6', w: 6, h: 6, color: 'woodDark' },
    {
      op: 'poly',
      points: [
        [dx, 'groundY-40'],
        [dx - 18, 'groundY-52'],
        [dx - 2, 'groundY-44'],
      ],
      color: 'grassDark',
    },
    {
      op: 'poly',
      points: [
        [dx, 'groundY-40'],
        [dx + 18, 'groundY-52'],
        [dx + 2, 'groundY-44'],
      ],
      color: 'grass',
    },
    {
      op: 'poly',
      points: [
        [dx, 'groundY-40'],
        [dx, 'groundY-60'],
        [dx - 4, 'groundY-48'],
      ],
      color: 'grass',
    },
  ];
}

export const STARBASE: Scene = {
  name: 'starbase',
  viewH: 460,
  groundY: 330,
  ops: [
    // Sky, hazy near the horizon, with a scatter of cloud.
    { op: 'rect', x: 0, y: 0, w: 'worldWidth', h: 170, color: 'void' },
    { op: 'rect', x: 0, y: 120, w: 'worldWidth', h: 50, color: 'accentLight', alpha: 0.2 },
    { op: 'speckle', x: 0, y: 10, w: 'worldWidth', h: 90, count: 36, light: 'accentLight', dark: 'void' },
    // Distant marsh water at the horizon, visible left of the building.
    { op: 'rect', x: 0, y: 168, w: 'worldWidth', h: 26, color: 'accentDark', alpha: 0.8 },

    // The HQ: black glass box, a lighter wing to the right, the mark on the face.
    { op: 'rect', x: 400, y: 70, w: 420, h: 260, color: 'rock' },
    { op: 'rect', x: 400, y: 66, w: 420, h: 6, color: 'rockDark' },
    {
      op: 'band',
      axis: 'x',
      from: 410,
      to: 810,
      step: 30,
      of: [{ op: 'rect', x: 0, y: 80, w: 2, h: 240, color: 'rockEdge', alpha: 0.4 }],
    },
    {
      op: 'band',
      from: 90,
      to: 310,
      step: 40,
      of: [{ op: 'rect', x: 410, y: 0, w: 400, h: 2, color: 'rockEdge', alpha: 0.35 }],
    },
    { op: 'rect', x: 410, y: 90, w: 150, h: 220, color: 'accent', alpha: 0.15 },
    {
      op: 'poly',
      points: [
        [580, 150],
        [600, 150],
        [680, 250],
        [660, 250],
      ],
      color: 'accentLight',
    },
    {
      op: 'poly',
      points: [
        [660, 150],
        [680, 150],
        [600, 250],
        [580, 250],
      ],
      color: 'accentLight',
    },
    { op: 'rect', x: 820, y: 150, w: 160, h: 180, color: 'rockLight' },
    {
      op: 'band',
      from: 160,
      to: 320,
      step: 26,
      of: [{ op: 'rect', x: 830, y: 0, w: 140, h: 2, color: 'rockDark', alpha: 0.3 }],
    },

    // The flag, on its own pole between the lawn and the walk.
    { op: 'rect', x: 350, y: 'groundY-70', w: 3, h: 70, color: 'wood' },
    { op: 'rect', x: 353, y: 'groundY-68', w: 24, h: 16, color: 'accentLight' },
    { op: 'rect', x: 353, y: 'groundY-68', w: 8, h: 8, color: 'accentDark' },
    {
      op: 'band',
      from: 'groundY-60',
      to: 'groundY-52',
      step: 4,
      of: [{ op: 'rect', x: 361, y: 0, w: 16, h: 2, color: 'flame', alpha: 0.85 }],
    },

    // Starship, lying on its transporter along the road.
    { op: 'rect', x: 120, y: 'groundY-76', w: 380, h: 70, color: 'rockLight' },
    { op: 'rect', x: 120, y: 'groundY-41', w: 380, h: 35, color: 'rockDark', alpha: 0.3 },
    {
      op: 'band',
      axis: 'x',
      from: 130,
      to: 490,
      step: 35,
      of: [{ op: 'rect', x: 0, y: 'groundY-76', w: 2, h: 70, color: 'rockEdge', alpha: 0.3 }],
    },
    {
      op: 'poly',
      points: [
        [500, 'groundY-76'],
        [580, 'groundY-41'],
        [500, 'groundY-6'],
      ],
      color: 'rockLight',
    },
    {
      op: 'poly',
      points: [
        [500, 'groundY-41'],
        [580, 'groundY-41'],
        [500, 'groundY-6'],
      ],
      color: 'rockDark',
      alpha: 0.3,
    },
    {
      op: 'poly',
      points: [
        [460, 'groundY-76'],
        [480, 'groundY-96'],
        [500, 'groundY-76'],
      ],
      color: 'rockDark',
    },
    {
      op: 'poly',
      points: [
        [120, 'groundY-76'],
        [100, 'groundY-92'],
        [150, 'groundY-76'],
      ],
      color: 'rockDark',
    },
    { op: 'rect', x: 130, y: 'groundY-8', w: 360, h: 8, color: 'rockEdge' },
    {
      op: 'band',
      axis: 'x',
      from: 140,
      to: 480,
      step: 26,
      of: [{ op: 'rect', x: 0, y: 'groundY-4', w: 10, h: 8, color: 'rockDark' }],
    },

    // The walk: palms lining the lawn in front of the HQ.
    ...palm(600),
    ...palm(680),
    ...palm(760),
    ...palm(840),
    ...palm(920),

    // Parking, a few cars near the wing.
    { op: 'rect', x: 850, y: 'groundY-20', w: 130, h: 20, color: 'stoneDark' },
    {
      op: 'band',
      axis: 'x',
      from: 858,
      to: 970,
      step: 30,
      of: [{ op: 'rect', x: 0, y: 'groundY-16', w: 18, h: 12, color: 'rockEdge', alpha: 0.9 }],
    },

    // Lawn, then the road, then the near walk.
    { op: 'rect', x: 0, y: 'groundY', w: 'worldWidth', h: 40, color: 'grass' },
    { op: 'tufts', x: 0, y: 'groundY+4', w: 'worldWidth', h: 6, count: 70, height: 6, color: 'grassDark', alt: 'grass' },
    { op: 'rect', x: 0, y: 'groundY+40', w: 'worldWidth', h: 50, color: 'stoneDark' },
    {
      op: 'band',
      axis: 'x',
      from: 0,
      to: 'worldWidth',
      step: 60,
      of: [{ op: 'rect', x: 0, y: 'groundY+62', w: 24, h: 3, color: 'flameCore', alpha: 0.5 }],
    },
    { op: 'rect', x: 0, y: 'groundY+90', w: 'worldWidth', h: 40, color: 'rockDark' },
  ],
};
