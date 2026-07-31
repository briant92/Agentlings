import { Spritesheet, Texture } from 'pixi.js';
import { snapToPalette } from './palette';
import type { AgentAnim } from './sprites';

/**
 * Loads agentling art from a spritesheet — a PNG plus an Aseprite-shaped
 * atlas — so the art is data rather than code. Drop a different pair into
 * web/public/art and the crew changes with no rebuild.
 *
 * Anything loaded is snapped onto the master palette. Our own sheet is
 * already DB32 so that is a no-op for it; for a pack from outside it is what
 * makes the art look like it belongs rather than like a graft.
 */

export const ATLAS_URL = '/art/agentling.json';

interface AtlasData {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  animations?: Record<string, string[]>;
  meta: { image: string; size: { w: number; h: number }; repalette?: boolean };
}

/**
 * Decodes the sheet, snaps it, and hands back a nearest-neighbour texture.
 *
 * Uses createImageBitmap rather than Image.decode(): decode() never settles
 * while the tab is in the background, which would leave the crew stuck on
 * the fallback art until the tab was looked at again.
 */
async function paletteSnappedTexture(url: string, repalette: boolean): Promise<Texture> {
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

  if (repalette) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    snapToPalette(pixels.data);
    ctx.putImageData(pixels, 0, 0);
  }

  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

/**
 * The animation frames from the sheet, or null when there is no usable one —
 * the caller falls back to the art built into the app.
 */
export async function loadAtlasTextures(
  url = ATLAS_URL,
): Promise<Record<AgentAnim, Texture[]> | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as AtlasData;
    if (!data.frames || !data.meta?.image) return null;

    const imageUrl = new URL(data.meta.image, new URL(url, window.location.href)).href;
    const texture = await paletteSnappedTexture(imageUrl, data.meta.repalette !== false);

    const sheet = new Spritesheet(texture, data as never);
    await sheet.parse();

    const pick = (name: AgentAnim): Texture[] | null => {
      const frames = sheet.animations[name];
      return frames && frames.length > 0 ? frames : null;
    };
    const walk = pick('walk');
    const work = pick('work');
    const deliver = pick('deliver');
    // A sheet missing a cycle is worse than no sheet: half the crew would
    // freeze mid-stride. Take all three or none.
    if (!walk || !work || !deliver) return null;
    return { walk, work, deliver };
  } catch {
    return null;
  }
}
