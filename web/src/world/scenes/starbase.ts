import type { Paint, Scene, Theme } from '../scene';
import { DB } from '../palette';

/**
 * The title screen's own backdrop: the Starbase grounds, drawn from the
 * aerial photo — Starship vertical on its transporter over the tidal flats,
 * the black glass HQ with the mark right of centre, the white wing and the
 * flag at its far end, palms lining the plaza, cars on both roads.
 * Standalone from the level scenes in `./index.ts` on purpose — decoration
 * for the boot screen, never a level a pack could select, so it does not
 * touch `ThemeKey` or the server's theme validation.
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
  // Tan rather than brown: it is the palm trunks and the Boca Chica sand.
  wood: DB.tan,
  woodDark: DB.brown,
  stoneDark: DB.greyDeep,
  flame: DB.red,
  flameCore: DB.yellow,
  hover: DB.white,
};

/** One palm: a trunk and a five-frond head scaled to its height. */
function palm(dx: number, base: number, h = 46): Scene['ops'] {
  const top = base - h;
  const s = Math.round(h * 0.45);
  return [
    { op: 'rect', x: dx - 2, y: top, w: 4, h, color: 'wood' },
    { op: 'rect', x: dx - 2, y: base - 5, w: 4, h: 5, color: 'woodDark' },
    {
      op: 'poly',
      points: [
        [dx, top],
        [dx - s, top + 4],
        [dx - 4, top + 10],
      ],
      color: 'grassDark',
    },
    {
      op: 'poly',
      points: [
        [dx, top],
        [dx + s, top + 4],
        [dx + 4, top + 10],
      ],
      color: 'grass',
    },
    {
      op: 'poly',
      points: [
        [dx, top + 2],
        [dx - s, top - Math.round(s * 0.5)],
        [dx - 2, top + 8],
      ],
      color: 'grass',
    },
    {
      op: 'poly',
      points: [
        [dx, top + 2],
        [dx + s, top - Math.round(s * 0.5)],
        [dx + 2, top + 8],
      ],
      color: 'grassDark',
    },
    {
      op: 'poly',
      points: [
        [dx, top - Math.round(s * 0.7)],
        [dx - 4, top + 4],
        [dx + 4, top + 4],
      ],
      color: 'grass',
    },
  ];
}

/** One parked car, seen side-on: body, cab, glass, two wheels. */
function car(dx: number, dy: number, w: number, body: Paint): Scene['ops'] {
  return [
    { op: 'rect', x: dx, y: dy + 3, w, h: 6, color: body },
    { op: 'rect', x: dx + 5, y: dy, w: Math.round(w * 0.55), h: 4, color: body },
    { op: 'rect', x: dx + 7, y: dy + 1, w: Math.round(w * 0.4), h: 2, color: 'rockEdge', alpha: 0.7 },
    { op: 'circle', x: dx + 5, y: dy + 9, r: 2, color: 'rockEdge' },
    { op: 'circle', x: dx + w - 5, y: dy + 9, r: 2, color: 'rockEdge' },
  ];
}

/** One small cloud: a few overlapping puffs on a flat base. */
function cloud(dx: number, dy: number, s: number): Scene['ops'] {
  return [
    { op: 'rect', x: dx - s * 2, y: dy, w: s * 4, h: Math.max(3, Math.round(s * 0.8)), color: 'accentLight', alpha: 0.9 },
    { op: 'circle', x: dx - s, y: dy, r: s, color: 'accentLight', alpha: 0.9 },
    { op: 'circle', x: dx + Math.round(s * 0.4), y: dy - Math.round(s * 0.4), r: Math.round(s * 1.2), color: 'accentLight', alpha: 0.9 },
    { op: 'circle', x: dx + s + 2, y: dy, r: s - 1, color: 'accentLight', alpha: 0.9 },
  ];
}

export const STARBASE: Scene = {
  name: 'starbase',
  viewH: 460,
  groundY: 330,
  ops: [
    // Sky, hazy near the horizon, cloud gathered mid-right as in the photo.
    { op: 'rect', x: 0, y: 0, w: 'worldWidth', h: 152, color: 'void' },
    { op: 'rect', x: 0, y: 118, w: 'worldWidth', h: 34, color: 'accentLight', alpha: 0.18 },
    { op: 'rect', x: 0, y: 140, w: 'worldWidth', h: 12, color: 'accentLight', alpha: 0.25 },
    { op: 'speckle', x: 0, y: 8, w: 'worldWidth', h: 80, count: 30, light: 'accentLight', dark: 'void' },
    ...cloud(95, 60, 6),
    ...cloud(330, 38, 7),
    ...cloud(655, 80, 13),
    ...cloud(700, 92, 9),
    ...cloud(830, 102, 10),
    ...cloud(938, 56, 7),

    // The tide behind everything: pale water, then the sand flats with
    // channels braided through them and a few marsh islets.
    { op: 'rect', x: 0, y: 149, w: 'worldWidth', h: 2, color: 'accentLight', alpha: 0.5 },
    { op: 'rect', x: 0, y: 150, w: 'worldWidth', h: 58, color: 'accent', alpha: 0.9 },
    { op: 'rect', x: 0, y: 168, w: 'worldWidth', h: 3, color: 'accentDark', alpha: 0.35 },
    { op: 'rect', x: 0, y: 182, w: 'worldWidth', h: 3, color: 'accentDark', alpha: 0.3 },
    { op: 'rect', x: 0, y: 196, w: 'worldWidth', h: 4, color: 'accentDark', alpha: 0.35 },
    { op: 'rect', x: 0, y: 208, w: 'worldWidth', h: 94, color: 'wood' },
    { op: 'speckle', x: 0, y: 210, w: 'worldWidth', h: 88, count: 26, light: 'accentLight', dark: 'woodDark' },
    {
      op: 'poly',
      points: [
        [0, 214],
        [540, 214],
        [540, 220],
        [0, 224],
      ],
      color: 'accentDark',
      alpha: 0.5,
    },
    { op: 'rect', x: 60, y: 238, w: 470, h: 7, color: 'accentDark', alpha: 0.45 },
    { op: 'rect', x: 60, y: 238, w: 470, h: 3, color: 'accent' },
    { op: 'rect', x: 0, y: 262, w: 380, h: 8, color: 'accentDark', alpha: 0.55 },
    { op: 'rect', x: 300, y: 240, w: 60, h: 8, color: 'grassDark', alpha: 0.9 },
    { op: 'rect', x: 120, y: 266, w: 44, h: 7, color: 'grassDark', alpha: 0.8 },
    { op: 'rect', x: 430, y: 222, w: 36, h: 6, color: 'grassDark', alpha: 0.7 },

    // The far road along the flats, with the two white cars from the photo.
    { op: 'rect', x: 0, y: 302, w: 'worldWidth', h: 28, color: 'stoneDark' },
    { op: 'rect', x: 0, y: 302, w: 'worldWidth', h: 2, color: 'accentLight', alpha: 0.25 },
    ...car(444, 313, 16, 'accentLight'),
    ...car(474, 313, 16, 'accentLight'),

    // Starship, vertical on its transporter: steel body, dark nose tiles,
    // forward flaps at the shoulder, rear flaps flared at the skirt.
    { op: 'rect', x: 190, y: 126, w: 48, h: 186, color: 'rockLight' },
    {
      op: 'poly',
      points: [
        [190, 126],
        [193, 102],
        [202, 88],
        [214, 82],
        [226, 88],
        [235, 102],
        [238, 126],
      ],
      color: 'rockLight',
    },
    {
      op: 'poly',
      points: [
        [202, 88],
        [214, 82],
        [226, 88],
        [221, 94],
        [207, 94],
      ],
      color: 'rockEdge',
    },
    {
      op: 'poly',
      points: [
        [193, 102],
        [202, 88],
        [207, 94],
        [198, 112],
        [193, 118],
      ],
      color: 'rockEdge',
      alpha: 0.85,
    },
    { op: 'rect', x: 190, y: 126, w: 9, h: 186, color: 'rockDark', alpha: 0.4 },
    { op: 'rect', x: 229, y: 126, w: 5, h: 186, color: 'accentLight', alpha: 0.35 },
    {
      op: 'band',
      from: 132,
      to: 308,
      step: 12,
      of: [{ op: 'rect', x: 190, y: 0, w: 48, h: 1, color: 'rockEdge', alpha: 0.25 }],
    },
    { op: 'rect', x: 213, y: 126, w: 1, h: 186, color: 'rockEdge', alpha: 0.2 },
    {
      op: 'poly',
      points: [
        [190, 138],
        [176, 146],
        [176, 164],
        [190, 170],
      ],
      color: 'rock',
    },
    {
      op: 'poly',
      points: [
        [238, 138],
        [252, 146],
        [252, 164],
        [238, 170],
      ],
      color: 'rock',
    },
    {
      op: 'poly',
      points: [
        [192, 240],
        [158, 306],
        [192, 306],
      ],
      color: 'rock',
    },
    {
      op: 'poly',
      points: [
        [192, 252],
        [170, 306],
        [192, 306],
      ],
      color: 'rockEdge',
      alpha: 0.45,
    },
    {
      op: 'poly',
      points: [
        [236, 240],
        [270, 306],
        [236, 306],
      ],
      color: 'rock',
    },
    {
      op: 'poly',
      points: [
        [236, 252],
        [258, 306],
        [236, 306],
      ],
      color: 'rockEdge',
      alpha: 0.45,
    },
    { op: 'rect', x: 190, y: 300, w: 48, h: 12, color: 'rockDark' },
    // The transporter: a low dark deck on a row of wheels.
    { op: 'rect', x: 168, y: 312, w: 92, h: 10, color: 'stoneDark' },
    { op: 'rect', x: 168, y: 312, w: 92, h: 2, color: 'rockDark' },
    {
      op: 'band',
      axis: 'x',
      from: 170,
      to: 258,
      step: 11,
      of: [{ op: 'rect', x: 0, y: 322, w: 7, h: 6, color: 'rockEdge' }],
    },
    { op: 'rect', x: 168, y: 328, w: 92, h: 2, color: 'rockEdge', alpha: 0.6 },

    // The HQ: black glass box, mullions and floor lines, sky caught in the
    // left bays, the mark right of centre with its swoosh.
    { op: 'rect', x: 545, y: 200, w: 395, h: 2, color: 'rockLight', alpha: 0.5 },
    { op: 'rect', x: 545, y: 202, w: 395, h: 4, color: 'rockDark' },
    { op: 'rect', x: 545, y: 206, w: 395, h: 124, color: 'rock' },
    {
      op: 'band',
      axis: 'x',
      from: 553,
      to: 933,
      step: 24,
      of: [{ op: 'rect', x: 0, y: 208, w: 2, h: 120, color: 'rockEdge', alpha: 0.45 }],
    },
    {
      op: 'band',
      from: 226,
      to: 326,
      step: 20,
      of: [{ op: 'rect', x: 550, y: 0, w: 386, h: 2, color: 'rockEdge', alpha: 0.4 }],
    },
    { op: 'rect', x: 550, y: 208, w: 130, h: 118, color: 'accent', alpha: 0.15 },
    {
      op: 'poly',
      points: [
        [700, 208],
        [760, 208],
        [660, 326],
        [620, 326],
      ],
      color: 'accentLight',
      alpha: 0.06,
    },
    {
      op: 'poly',
      points: [
        [676, 244],
        [693, 244],
        [748, 292],
        [731, 292],
      ],
      color: 'accentLight',
    },
    {
      op: 'poly',
      points: [
        [731, 244],
        [748, 244],
        [693, 292],
        [676, 292],
      ],
      color: 'accentLight',
    },
    {
      op: 'poly',
      points: [
        [700, 262],
        [776, 232],
        [780, 237],
        [706, 268],
      ],
      color: 'accentLight',
    },

    // The white wing at the building's far end.
    { op: 'rect', x: 938, y: 270, w: 62, h: 60, color: 'accentLight' },
    { op: 'rect', x: 938, y: 270, w: 62, h: 3, color: 'rockLight' },
    { op: 'rect', x: 938, y: 296, w: 62, h: 2, color: 'rockLight', alpha: 0.6 },
    { op: 'rect', x: 938, y: 272, w: 3, h: 58, color: 'rockLight', alpha: 0.7 },

    // The flag, flying left off its pole in front of the glass.
    { op: 'rect', x: 914, y: 238, w: 3, h: 134, color: 'accentLight' },
    { op: 'circle', x: 915, y: 236, r: 3, color: 'flameCore' },
    { op: 'rect', x: 878, y: 242, w: 36, h: 22, color: 'accentLight' },
    {
      op: 'band',
      from: 244,
      to: 264,
      step: 5,
      of: [{ op: 'rect', x: 878, y: 0, w: 36, h: 2, color: 'flame', alpha: 0.85 }],
    },
    { op: 'rect', x: 901, y: 242, w: 13, h: 10, color: 'accentDark' },

    // The lawn stops where the plaza starts; a dark hedge runs its far edge.
    { op: 'rect', x: 0, y: 'groundY', w: 560, h: 42, color: 'grass' },
    { op: 'tufts', x: 0, y: 'groundY+4', w: 556, h: 6, count: 40, height: 6, color: 'grassDark', alt: 'grass' },
    { op: 'rect', x: 40, y: 'groundY+30', w: 500, h: 8, color: 'grassDark' },
    { op: 'rect', x: 40, y: 'groundY+38', w: 500, h: 2, color: 'rockEdge', alpha: 0.4 },

    // Left of the plaza: the parking road and its row of cars.
    { op: 'rect', x: 0, y: 'groundY+42', w: 540, h: 40, color: 'stoneDark' },
    { op: 'rect', x: 0, y: 'groundY+42', w: 540, h: 2, color: 'accentLight', alpha: 0.3 },
    ...car(100, 382, 26, 'accentLight'),
    ...car(140, 382, 24, 'rock'),
    ...car(180, 382, 26, 'accentLight'),
    ...car(222, 382, 24, 'rockLight'),
    ...car(262, 382, 26, 'accentLight'),

    // The plaza in front of the HQ: pale concrete from the glass to the near
    // road, joint lines, a planting bed, the bike racks.
    { op: 'rect', x: 540, y: 'groundY', w: 460, h: 82, color: 'rockLight' },
    {
      op: 'band',
      axis: 'x',
      from: 560,
      to: 990,
      step: 36,
      of: [{ op: 'rect', x: 0, y: 'groundY', w: 1, h: 82, color: 'rockDark', alpha: 0.35 }],
    },
    { op: 'rect', x: 540, y: 'groundY+28', w: 460, h: 1, color: 'rockDark', alpha: 0.3 },
    { op: 'rect', x: 540, y: 'groundY+62', w: 460, h: 1, color: 'rockDark', alpha: 0.3 },
    { op: 'tufts', x: 590, y: 'groundY+64', w: 96, h: 6, count: 10, height: 6, color: 'grassDark', alt: 'grass' },
    {
      op: 'band',
      axis: 'x',
      from: 700,
      to: 780,
      step: 12,
      of: [{ op: 'rect', x: 0, y: 'groundY+52', w: 2, h: 8, color: 'rockEdge', alpha: 0.8 }],
    },

    // The walk: palms lining the plaza in front of the glass.
    ...palm(556, 372, 58),
    ...palm(600, 372, 50),
    ...palm(644, 372, 62),
    ...palm(688, 372, 54),
    ...palm(732, 372, 60),
    ...palm(776, 372, 52),
    ...palm(820, 372, 58),

    // The near road across the bottom, dashes and a little traffic.
    { op: 'rect', x: 0, y: 'groundY+82', w: 'worldWidth', h: 48, color: 'rockDark' },
    {
      op: 'band',
      axis: 'x',
      from: 0,
      to: 'worldWidth',
      step: 70,
      of: [{ op: 'rect', x: 0, y: 'groundY+104', w: 26, h: 3, color: 'flameCore', alpha: 0.45 }],
    },
    ...car(300, 426, 28, 'rock'),
    ...car(830, 430, 28, 'rock'),
    ...car(935, 418, 24, 'accentLight'),
    ...car(970, 432, 24, 'accentLight'),

    // The trees at the picture's left edge, nearest the camera.
    ...palm(18, 448, 58),
    ...palm(56, 456, 64),
  ],
};
