import type { LevelPack, PackProblem, Scene, Theme, ThemeId, ThemeKey } from '@agentlings/shared';
import { BUILTIN_THEMES, WORLD_WIDTH } from '@agentlings/shared';
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

const looks = new Map<ThemeId, Look>(
  BUILTIN_THEMES.map((key) => [
    key,
    { id: key, label: THEME_LABELS[key], theme: THEMES[key], scene: SCENES[key], installed: false },
  ]),
);

/**
 * Decoded backdrop rasters by pack, loaded at boot alongside the packs
 * themselves so the level cards — drawn synchronously during render — can
 * composite them. The world does not use these: Pixi loads its own textures.
 */
const plateImages = new Map<
  ThemeId,
  { plates: HTMLImageElement[]; occlusion: HTMLImageElement | null }
>();

/** The plate files of a pack, as fetchable paths under the web root. */
export function plateUrls(look: Look): string[] {
  if (!look.installed) return [];
  return (look.scene.backdrop?.plates ?? []).map((file) => `/packs/${look.id}/${file}`);
}

/** The occlusion strip's path, when the pack carries one (v2). */
export function occlusionUrl(look: Look): string | null {
  if (!look.installed || !look.scene.backdrop?.occlusion) return null;
  return `/packs/${look.id}/${look.scene.backdrop.occlusion}`;
}

/** The plate-life loops of a pack, with their tiles as fetchable paths (v2). */
export function plateLoopSpecs(look: Look): {
  url: string;
  x: number | string;
  y: number | string;
  w: number | string;
  h: number | string;
  dx: number;
  dy: number;
}[] {
  if (!look.installed) return [];
  return (look.scene.ambient ?? []).flatMap((op) =>
    op.fx === 'plateloop'
      ? [{ url: `/packs/${look.id}/${op.file}`, x: op.x, y: op.y, w: op.w, h: op.h, dx: op.dx, dy: op.dy }]
      : [],
  );
}

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
    // Plates, decoded before the first render so a card never draws half a
    // world. A file that fails to load costs only itself: the card and the
    // world draw what did, the way a missing pack falls back to cave.
    const fetchImage = async (url: string): Promise<HTMLImageElement | null> => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
      } catch {
        return null;
      }
    };
    await Promise.all(
      [...looks.values()].filter((look) => look.installed).map(async (look) => {
        const [images, occlusion] = await Promise.all([
          Promise.all(plateUrls(look).map(fetchImage)),
          (async () => {
            const url = occlusionUrl(look);
            return url ? fetchImage(url) : null;
          })(),
        ]);
        const loaded = images.filter((img): img is HTMLImageElement => img !== null);
        if (loaded.length > 0 || occlusion) {
          plateImages.set(look.id, { plates: loaded, occlusion });
        }
      }),
    );
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
 * Paints a scene onto a canvas of a given size. The one place a scene becomes
 * an image, so the level card and the review preview cannot draw the same
 * world differently — only at different sizes.
 */
function paintTo(
  scene: Scene,
  theme: Theme,
  w: number,
  h: number,
  plates: HTMLImageElement[] = [],
  occlusion: HTMLImageElement | null = null,
): string {
  const anchors = anchorsOf(scene);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // A plate at the view width fills the frame; an overscanned one hangs half
  // its margin off each side — the rest position the live drift moves around.
  const drawPlate = (img: HTMLImageElement): void => {
    const worldW = img.naturalWidth / (img.naturalHeight / anchors.viewH);
    const sx = w / anchors.worldWidth;
    ctx.drawImage(img, (-(worldW - anchors.worldWidth) / 2) * sx, 0, worldW * sx, h);
  };

  ctx.fillStyle = css(theme.void);
  ctx.fillRect(0, 0, w, h);
  // The plates sit under everything drawScene draws — the same order the
  // world composites in (D-142), back to front.
  for (const plate of plates) drawPlate(plate);
  drawScene(canvasSurface(ctx, w / anchors.worldWidth, h / anchors.viewH, css), scene, theme, anchors);
  // The occlusion strip covers even the foreground — that is what it is.
  if (occlusion) drawPlate(occlusion);
  ctx.globalAlpha = 1;
  return canvas.toDataURL();
}

/**
 * The level card image: the level shrunk, not a sketch of it — the same scene
 * data through the same interpreter.
 *
 * A fixed 240×72 whatever the world's own shape, so a tall pack is squashed
 * into the card rather than cropped out of it. The review preview is the one
 * that keeps true proportions.
 */
export function renderThumbnail(id: ThemeId): string {
  const cached = thumbCache.get(id);
  if (cached) return cached;
  const look = lookFor(id);
  const rasters = plateImages.get(look.id);
  const url = paintTo(look.scene, look.theme, 240, 72, rasters?.plates, rasters?.occlusion ?? null);
  // Only cache a real answer. Asking for a pack's card before its pack has
  // loaded returns the fallback, and caching that would pin the cave onto
  // that level for the life of the page — the picture would stay wrong long
  // after the pack arrived. Boot loads packs before the first render so this
  // should not arise; it is one line to make sure it cannot.
  if (!lookIsMissing(id)) thumbCache.set(id, url);
  return url;
}

/**
 * A world at its true proportions — for reviewing one that is not installed.
 *
 * Unlike the card, this scales x and y together, so a 450-tall pack looks
 * 450 tall. That is the point of it: approving a world you cannot see is the
 * thing this exists to prevent, and a preview that lied about the shape would
 * be worse than none.
 *
 * Takes the scene rather than a look id, because a draft has no id yet — it
 * is not installed, and whether it ever will be is what is being decided.
 */
export function renderScenePreview(
  scene: Scene,
  theme: Theme,
  width: number,
  /** A draft's plates, fetched from its sandbox by the caller (D-143). */
  plates: HTMLImageElement[] = [],
  /** Its occlusion strip, drawn over everything (v2). */
  occlusion: HTMLImageElement | null = null,
): { url: string; height: number } {
  const height = Math.round((width * scene.viewH) / WORLD_WIDTH);
  return { url: paintTo(scene, theme, width, height, plates, occlusion), height };
}
