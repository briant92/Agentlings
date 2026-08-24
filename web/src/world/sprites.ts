import { Texture } from 'pixi.js';
import source from './agentling.source.json';
import { css } from './palette';
import { gownFor } from './tint';

/**
 * The art built into the app, used when no spritesheet is present. Frames are
 * character grids baked by scripts/bake-sprites.mjs — the same definition the
 * PNG is generated from, so the fallback can never drift from the sheet.
 *
 * 18x20 logical pixels per frame, drawn at SPRITE_SCALE in the world.
 * Original art in the spirit of the classic: big mop of hair, blue gown,
 * bare stepping feet.
 */
export const SPRITE_SCALE = 2;
/** Frame height the built-in art is drawn at; packs scale to match on screen. */
export const SPRITE_HEIGHT = 20;

export type AgentAnim = 'walk' | 'work' | 'deliver';

const { w: W, h: H } = source.size;
const PALETTE: Record<string, string> = source.palette;
const FRAMES: Record<string, string[]> = source.frames;
const ANIMATIONS: Record<string, string[]> = source.animations;

/**
 * The colour for each frame character. A tint swaps the two gown entries for
 * that agentling's own colour — by key here, where the art is still a grid of
 * characters, and by pixel value in atlas.ts where it is already a PNG.
 */
function paletteFor(tint?: number): Record<string, string> {
  if (tint === undefined) return PALETTE;
  const gown = gownFor(tint);
  return { ...PALETTE, b: css(gown.light), B: css(gown.dark) };
}

function paint(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  palette: Record<string, string>,
  scale: number,
): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < W; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
}

function makeTexture(rows: string[], palette: Record<string, string>): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  paint(canvas.getContext('2d')!, rows, palette, 1);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

/** Paints the stand frame big and crisp onto a plain canvas (profile portrait). */
export function renderPortrait(canvas: HTMLCanvasElement, scale = 4, tint?: number): void {
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paint(ctx, FRAMES.stand, paletteFor(tint), scale);
}

/** How many frames the walk cycle has, for anyone stepping through it by hand. */
export const WALK_FRAME_COUNT = ANIMATIONS.walk.length;

/** One frame of the walk cycle on a plain canvas, for a horde outside Pixi (the title screen). */
export function renderWalkFrame(canvas: HTMLCanvasElement, frame: number, scale = 3, tint?: number): void {
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const name = ANIMATIONS.walk[frame % WALK_FRAME_COUNT];
  paint(ctx, FRAMES[name], paletteFor(tint), scale);
}

function texturesWith(palette: Record<string, string>): Record<AgentAnim, Texture[]> {
  const cached = new Map<string, Texture>();
  const frame = (name: string): Texture => {
    let texture = cached.get(name);
    if (!texture) {
      texture = makeTexture(FRAMES[name], palette);
      cached.set(name, texture);
    }
    return texture;
  };
  const cycle = (name: AgentAnim): Texture[] => ANIMATIONS[name].map(frame);
  return { walk: cycle('walk'), work: cycle('work'), deliver: cycle('deliver') };
}

export function buildAgentTextures(tint?: number): Record<AgentAnim, Texture[]> {
  return texturesWith(paletteFor(tint));
}

/** The same frames as flat shapes, for the hover outline. */
export function buildSilhouetteTextures(color: number): Record<AgentAnim, Texture[]> {
  const flat = css(color);
  return texturesWith(Object.fromEntries(Object.keys(PALETTE).map((key) => [key, flat])));
}
