import type { LevelPack, PackProblem, Scene, Theme, ThemeId, ThemeKey } from '@agentlings/shared';
import { api } from '../api';
import { css } from './palette';
import { anchorsOf, canvasSurface, drawScene } from './scene';
import { SCENES } from './scenes';
import { THEME_LABELS, THEMES } from './themes';

/**
 * Every world a level can be set in: the four built in, plus whatever packs
 * are installed.
 *
 * One registry rather than two lookups, because everything downstream — the
 * renderer, the level card, the new-level form — wants the same pair of a
 * palette and a scene and should not care which of the two places it came
 * from.
 */
export interface Look {
  id: ThemeId;
  label: string;
  theme: Theme;
  scene: Scene;
  /** False for the four built in; true for anything dropped into packs/. */
  installed: boolean;
}

const BUILTIN: ThemeKey[] = ['cave', 'chalkboard', 'household', 'marble'];

const looks = new Map<ThemeId, Look>(
  BUILTIN.map((key) => [
    key,
    { id: key, label: THEME_LABELS[key], theme: THEMES[key], scene: SCENES[key], installed: false },
  ]),
);

/** What the app falls back to when a level names a look nothing can supply. */
const FALLBACK: ThemeKey = 'cave';

let rejected: { slug: string; problems: PackProblem[] }[] = [];

/**
 * Loads the installed packs. Called once at boot, before anything renders, so
 * every lookup afterwards is synchronous — a level card is drawn during render
 * and cannot wait on a fetch.
 *
 * Failure is not fatal. If the server cannot be reached the app still has four
 * worlds, and a level set in a pack falls back rather than refusing to open.
 */
export async function loadLooks(): Promise<void> {
  try {
    const body = await api<{
      installed: { slug: string; pack: LevelPack }[];
      rejected: { slug: string; problems: PackProblem[] }[];
    }>('/api/packs');
    rejected = body.rejected;
    for (const { slug, pack } of body.installed) {
      looks.set(slug, {
        id: slug,
        label: pack.name,
        theme: pack.theme,
        scene: pack,
        installed: true,
      });
    }
  } catch {
    // Offline, or an older server with no /api/packs. Built-ins still work.
  }
}

/**
 * The look a level is set in.
 *
 * Never throws and never returns nothing: a level whose pack was deleted, or
 * renamed, or refused by the checker still has to open. It opens in the cave,
 * the same way a broken agentling pack leaves the crew drawn in built-in art.
 */
export function lookFor(id: ThemeId): Look {
  return looks.get(id) ?? looks.get(FALLBACK)!;
}

/** Whether that look is the real one or the fallback standing in for it. */
export function lookIsMissing(id: ThemeId): boolean {
  return !looks.has(id);
}

/** Everything a new level could be set in, built-ins first. */
export function allLooks(): Look[] {
  return [...looks.values()].sort((a, b) => Number(a.installed) - Number(b.installed));
}

/** Packs that were found but refused, with the reasons — Settings shows these. */
export function rejectedPacks(): { slug: string; problems: PackProblem[] }[] {
  return rejected;
}

const thumbCache = new Map<ThemeId, string>();

/**
 * Tiny deterministic scene in the look's own palette — the level card image.
 *
 * The card is the level shrunk, not a sketch of it: the same scene data
 * through the same interpreter, scaled by the level's own height so a taller
 * pack shrinks further rather than being cropped.
 */
export function renderThumbnail(id: ThemeId): string {
  const cached = thumbCache.get(id);
  if (cached) return cached;
  const look = lookFor(id);
  const anchors = anchorsOf(look.scene);
  const w = 240;
  const h = 72;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = css(look.theme.void);
  ctx.fillRect(0, 0, w, h);
  drawScene(
    canvasSurface(ctx, w / anchors.worldWidth, h / anchors.viewH, css),
    look.scene,
    look.theme,
    anchors,
  );
  ctx.globalAlpha = 1;

  const url = canvas.toDataURL();
  thumbCache.set(id, url);
  return url;
}
