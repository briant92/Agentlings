import type { ThemeKey } from '@agentlings/shared';
import { css, DB } from './palette';

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

  ctx.fillStyle = css(T.void);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = css(T.rock);
  ctx.fillRect(0, 0, w, 12);
  ctx.fillRect(0, h - 16, w, 16);
  ctx.fillStyle = css(T.rockDark);
  for (let x = 8; x < w; x += 22) {
    ctx.fillRect(x, 8, 6, 4); // jagged ceiling nubs
    ctx.fillRect(x + 10, h - 8, 5, 3); // floor speckle
  }
  ctx.fillStyle = css(T.grass);
  ctx.fillRect(0, h - 19, w, 3);
  ctx.fillStyle = css(T.grassDark);
  ctx.fillRect(0, h - 16, w, 2);
  // Distant pillars: a darker palette entry rather than alpha, so the card
  // stays strictly inside DB32.
  ctx.fillStyle = css(T.accentDark);
  ctx.fillRect(70, 20, 10, h - 39);
  ctx.fillRect(130, 20, 10, h - 39);
  ctx.fillStyle = css(T.stoneDark);
  ctx.fillRect(w - 34, h - 41, 22, 22);
  ctx.fillStyle = css(T.void);
  ctx.fillRect(w - 29, h - 33, 12, 14);
  ctx.fillStyle = css(T.flame);
  ctx.fillRect(w - 40, h - 36, 3, 5);
  ctx.fillRect(w - 9, h - 36, 3, 5);

  const url = canvas.toDataURL();
  thumbCache.set(key, url);
  return url;
}
