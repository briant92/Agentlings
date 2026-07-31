import { Spritesheet, Texture } from 'pixi.js';
import { snapToPalette } from './palette';
import type { AgentAnim } from './sprites';
import { flatten, recolourGown } from './tint';

/**
 * Loads agentling art from a spritesheet — a PNG plus an Aseprite-shaped
 * atlas — so the art is data rather than code. Drop a different pair into
 * web/public/art and the crew changes with no rebuild.
 *
 * Anything loaded is snapped onto the master palette. Our own sheet is
 * already DB32 so that is a no-op for it; for a pack from outside it is what
 * makes the art look like it belongs rather than like a graft.
 *
 * The sheet is decoded exactly once and kept as pixels, because each
 * agentling needs it repainted in their own colour. Re-fetching and
 * re-snapping per crew member would do the expensive half of the work again
 * for every hire.
 */

export type Frames = Record<AgentAnim, Texture[]>;

export const ATLAS_URL = '/art/agentling.json';

interface AtlasData {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  animations?: Record<string, string[]>;
  meta: { image: string; size: { w: number; h: number }; repalette?: boolean };
}

/** The sheet's art, and the same art in any agentling's colour. */
export interface AtlasArt {
  /** The sheet as drawn, ready to use straight away. */
  base: Frames;
  /** Frame height, so a finer pack reads as more detail rather than as a giant. */
  frameHeight: number;
  /** The same frames with the gown recoloured; cached per colour. */
  tinted(color: number): Promise<Frames | null>;
  /** The same frames as flat shapes, for the hover outline. */
  silhouette(color: number): Promise<Frames | null>;
}

/**
 * Decodes the sheet and snaps it onto the palette.
 *
 * Uses createImageBitmap rather than Image.decode(): decode() never settles
 * while the tab is in the background, which would leave the crew stuck on
 * the fallback art until the tab was looked at again.
 */
async function loadPixels(url: string, repalette: boolean): Promise<ImageData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sheet image missing (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (repalette) snapToPalette(pixels.data);
  return pixels;
}

function textureFrom(pixels: ImageData): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas.getContext('2d')!.putImageData(pixels, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

/**
 * Cuts the three cycles out of a sheet, or null when one of them is missing.
 * A sheet short a cycle is worse than no sheet: half the crew would freeze
 * mid-stride. Take all three or none.
 */
async function cutFrames(pixels: ImageData, data: AtlasData): Promise<Frames | null> {
  const sheet = new Spritesheet(textureFrom(pixels), data as never);
  await sheet.parse();
  const pick = (name: AgentAnim): Texture[] | null => {
    const frames = sheet.animations[name];
    return frames && frames.length > 0 ? frames : null;
  };
  const walk = pick('walk');
  const work = pick('work');
  const deliver = pick('deliver');
  if (!walk || !work || !deliver) return null;
  return { walk, work, deliver };
}

/**
 * The sheet's art, or null when there is no usable one — the caller falls
 * back to the art built into the app.
 */
export async function loadAtlasArt(url = ATLAS_URL): Promise<AtlasArt | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as AtlasData;
    if (!data.frames || !data.meta?.image) return null;

    const imageUrl = new URL(data.meta.image, new URL(url, window.location.href)).href;
    const pixels = await loadPixels(imageUrl, data.meta.repalette !== false);
    const base = await cutFrames(pixels, data);
    if (!base) return null;

    // A repaint that fails must not take the whole crew's art with it; the
    // caller keeps drawing the untinted frames.
    const repaints = new Map<string, Promise<Frames | null>>();
    const repaint = (key: string, paint: (data: Uint8ClampedArray) => void) => {
      let pending = repaints.get(key);
      if (!pending) {
        const copy = new ImageData(
          new Uint8ClampedArray(pixels.data),
          pixels.width,
          pixels.height,
        );
        paint(copy.data);
        pending = cutFrames(copy, data).catch(() => null);
        repaints.set(key, pending);
      }
      return pending;
    };

    return {
      base,
      frameHeight: base.walk[0]?.height ?? 0,
      tinted: (color) => repaint(`tint:${color}`, (d) => recolourGown(d, color)),
      silhouette: (color) => repaint(`flat:${color}`, (d) => flatten(d, color)),
    };
  } catch {
    return null;
  }
}
