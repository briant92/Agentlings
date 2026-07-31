import type { ThemeKey } from '@agentlings/shared';
import { EXIT_X, SPAWN_X, WORLD_WIDTH } from '@agentlings/shared';
import { css, DB } from './palette';
import { type Anchors, canvasSurface, drawScene } from './scene';
import { SCENES } from './scenes';

/** The world the cards depict, so a thumbnail is the level shrunk, not a sketch. */
const THUMB_ANCHORS: Anchors = {
  worldWidth: WORLD_WIDTH,
  viewH: 320,
  groundY: 258,
  spawnX: SPAWN_X,
  exitX: EXIT_X,
};

/**
 * Per-theme palette, every slot drawn from the DB32 master ramp; geometry
 * stays identical across all four.
 */
export interface Theme {
  void: number;
  rock: number;
  rockLight: number;
  rockDark: number;
  rockEdge: number;
  accent: number;
  accentLight: number;
  accentDark: number;
  grass: number;
  grassDark: number;
  wood: number;
  woodDark: number;
  stoneDark: number;
  flame: number;
  flameCore: number;
  /**
   * The hover outline on anything clickable. Its own slot rather than a reuse
   * of `accentLight`, which is drawn from the same family as the rock in every
   * theme — cave's is DB.tan against DB.tan walls, so the outline half
   * vanished into the scenery it was meant to lift a sprite off. Chosen per
   * theme for contrast against that theme's rock.
   */
  hover: number;
}

export const THEMES: Record<ThemeKey, Theme> = {
  cave: {
    void: DB.ink,
    rock: DB.brown,
    rockLight: DB.tan,
    rockDark: DB.brownDark,
    rockEdge: DB.plum,
    accent: DB.bronze,
    accentLight: DB.tan,
    accentDark: DB.olive,
    grass: DB.lime,
    grassDark: DB.green,
    wood: DB.brown,
    woodDark: DB.brownDark,
    stoneDark: DB.plum,
    flame: DB.orange,
    flameCore: DB.yellow,
    hover: DB.white, // against brown rock
  },
  chalkboard: {
    void: DB.slateGreen,
    rock: DB.brownDark,
    rockLight: DB.brown,
    rockDark: DB.plum,
    rockEdge: DB.ink,
    accent: DB.paleBlue,
    accentLight: DB.white,
    accentDark: DB.steel,
    grass: DB.limeLight,
    grassDark: DB.lime,
    wood: DB.brown,
    woodDark: DB.brownDark,
    stoneDark: DB.plum,
    flame: DB.orange,
    flameCore: DB.yellow,
    hover: DB.yellow, // white is already this theme's accent
  },
  household: {
    void: DB.indigo,
    rock: DB.tan,
    rockLight: DB.sand,
    rockDark: DB.brown,
    rockEdge: DB.brownDark,
    accent: DB.paleBlue,
    accentLight: DB.white,
    accentDark: DB.steel,
    grass: DB.teal,
    grassDark: DB.green,
    wood: DB.brown,
    woodDark: DB.brownDark,
    stoneDark: DB.greyDeep,
    flame: DB.orange,
    flameCore: DB.yellow,
    hover: DB.rose, // the walls here are pale, so white would sink into them
  },
  marble: {
    void: DB.black,
    rock: DB.steel,
    rockLight: DB.paleBlue,
    rockDark: DB.grey,
    rockEdge: DB.greyDeep,
    accent: DB.bronze,
    accentLight: DB.yellow,
    accentDark: DB.olive,
    grass: DB.teal,
    grassDark: DB.green,
    wood: DB.brownDark,
    woodDark: DB.plum,
    stoneDark: DB.greyDark,
    flame: DB.orange,
    flameCore: DB.yellow,
    hover: DB.yellow, // against steel and pale blue
  },
};

export const THEME_LABELS: Record<ThemeKey, string> = {
  cave: 'Cave',
  chalkboard: 'Chalkboard',
  household: 'Household',
  marble: 'Marble & gold',
};

const thumbCache = new Map<ThemeKey, string>();

/** Tiny deterministic scene in the theme's palette — the level card image. */
export function renderThumbnail(key: ThemeKey): string {
  const cached = thumbCache.get(key);
  if (cached) return cached;
  const T = THEMES[key];
  const w = 240;
  const h = 72;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // The card is the level's own scene, drawn small. It used to be a second,
  // hand-drawn cave that showed the same picture for every theme — a preview
  // that could disagree with the thing it was previewing.
  ctx.fillStyle = css(T.void);
  ctx.fillRect(0, 0, w, h);
  drawScene(
    canvasSurface(ctx, w / THUMB_ANCHORS.worldWidth, h / THUMB_ANCHORS.viewH, css),
    SCENES[key],
    T,
    THUMB_ANCHORS,
  );
  ctx.globalAlpha = 1;

  const url = canvas.toDataURL();
  thumbCache.set(key, url);
  return url;
}
