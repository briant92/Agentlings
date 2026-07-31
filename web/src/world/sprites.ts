import { Texture } from 'pixi.js';
import source from './agentling.source.json';

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

export type AgentAnim = 'walk' | 'work' | 'deliver';

const { w: W, h: H } = source.size;
const PALETTE: Record<string, string> = source.palette;
const FRAMES: Record<string, string[]> = source.frames;
const ANIMATIONS: Record<string, string[]> = source.animations;

function makeTexture(rows: string[]): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < W; x++) {
      const color = PALETTE[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

/** Paints the stand frame big and crisp onto a plain canvas (profile portrait). */
export function renderPortrait(canvas: HTMLCanvasElement, scale = 4): void {
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  FRAMES.stand.forEach((row, y) => {
    for (let x = 0; x < W; x++) {
      const color = PALETTE[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
}

export function buildAgentTextures(): Record<AgentAnim, Texture[]> {
  const cached = new Map<string, Texture>();
  const frame = (name: string): Texture => {
    let texture = cached.get(name);
    if (!texture) {
      texture = makeTexture(FRAMES[name]);
      cached.set(name, texture);
    }
    return texture;
  };
  const cycle = (name: AgentAnim): Texture[] => ANIMATIONS[name].map(frame);
  return { walk: cycle('walk'), work: cycle('work'), deliver: cycle('deliver') };
}
