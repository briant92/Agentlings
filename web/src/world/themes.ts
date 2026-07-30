import type { ThemeKey } from '@agentlings/shared';

/** Hand-tuned palette per level theme; geometry stays identical across all. */
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
    void: 0x0e1038,
    rock: 0x9a5a22,
    rockLight: 0xc8842e,
    rockDark: 0x6e3a12,
    rockEdge: 0x46220a,
    accent: 0xc8a000,
    accentLight: 0xe8cc50,
    accentDark: 0x8a6e00,
    grass: 0x00a800,
    grassDark: 0x006e00,
    wood: 0x8a5a28,
    woodDark: 0x5a3a18,
    stoneDark: 0x4a2f14,
    flame: 0xffa030,
    flameCore: 0xffd050,
  },
  chalkboard: {
    void: 0x14342a,
    rock: 0x7a3a2a,
    rockLight: 0x9a5040,
    rockDark: 0x56281c,
    rockEdge: 0x351812,
    accent: 0xe8e8e0,
    accentLight: 0xffffff,
    accentDark: 0xb8b8ac,
    grass: 0x55a83a,
    grassDark: 0x3a7828,
    wood: 0x8a5a28,
    woodDark: 0x5a3a18,
    stoneDark: 0x3a2a20,
    flame: 0xffa030,
    flameCore: 0xffd050,
  },
  household: {
    void: 0x22303f,
    rock: 0x8a6a4a,
    rockLight: 0xb89a6a,
    rockDark: 0x5e462c,
    rockEdge: 0x3a2c1e,
    accent: 0xe8e8e0,
    accentLight: 0xffffff,
    accentDark: 0xa8b0b8,
    grass: 0x2ab89a,
    grassDark: 0x17806b,
    wood: 0x9a6a3a,
    woodDark: 0x6a4622,
    stoneDark: 0x4a3a2a,
    flame: 0xffa030,
    flameCore: 0xffd050,
  },
  marble: {
    void: 0x0c2420,
    rock: 0x6a6e7a,
    rockLight: 0x9a9eaa,
    rockDark: 0x464a54,
    rockEdge: 0x2a2c34,
    accent: 0xc8a000,
    accentLight: 0xe8cc50,
    accentDark: 0x8a6e00,
    grass: 0x1d9e75,
    grassDark: 0x0f6e56,
    wood: 0x6a5030,
    woodDark: 0x46341e,
    stoneDark: 0x34363e,
    flame: 0xffa030,
    flameCore: 0xffd050,
  },
};

export const THEME_LABELS: Record<ThemeKey, string> = {
  cave: 'Cave',
  chalkboard: 'Chalkboard',
  household: 'Household',
  marble: 'Marble & gold',
};

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

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
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = css(T.accent);
  ctx.fillRect(70, 20, 10, h - 39);
  ctx.fillRect(130, 20, 10, h - 39);
  ctx.globalAlpha = 1;
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
