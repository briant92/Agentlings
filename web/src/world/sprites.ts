import { Texture } from 'pixi.js';

/**
 * Hand-authored pixel-art frames for the agentlings, stored as character
 * grids and baked into nearest-neighbor textures at startup. 18x20 logical
 * pixels per frame, rendered at SPRITE_SCALE in the world.
 */
export const SPRITE_SCALE = 2;

const W = 18;
const H = 20;

const PALETTE: Record<string, string> = {
  k: '#14141e', // eye / outline
  g: '#35c435', // hair
  G: '#1e8c1e', // hair shade
  s: '#f0e0d0', // skin
  S: '#c09878', // skin shade
  b: '#4650ff', // robe
  B: '#2c34b4', // robe shade
  f: '#202030', // legs / feet
  p: '#d8b830', // parcel
  P: '#a88820', // parcel shade
  h: '#7a4a20', // pickaxe handle
  m: '#9aa0b0', // pickaxe head
};

// Facing right; the renderer flips with a negative x-scale.
const IDLE = [
  '..................',
  '..................',
  '......ggggg.......',
  '.....ggggggg......',
  '....gggggggg......',
  '....gGggggggg.....',
  '....ggggggggg.....',
  '....gGgggsssss....',
  '....gggggsssks....',
  '.....GggggsssS....',
  '......ggssSS......',
  '.....bbbbbbbb.....',
  '....sbbbbbbbbs....',
  '....sbbbbbbbbs....',
  '.....bbbbbbbb.....',
  '.....bbbbbbBB.....',
  '.....bbbbbbBB.....',
  '......ff..ff......',
  '......ff..ff......',
  '.....fff..fff.....',
];

function withRows(base: string[], patch: Record<number, string>): string[] {
  return base.map((row, i) => patch[i] ?? row);
}

const WALK_OPEN = withRows(IDLE, {
  17: '.....ff....ff.....',
  18: '....ff......ff....',
  19: '...fff......fff...',
});

const WALK_SHUFFLE = withRows(IDLE, {
  17: '.....ff...ff......',
  18: '.....ff...ff......',
  19: '....fff...fff.....',
});

const WORK_RAISED = withRows(IDLE, {
  7: '....gGgggsssss.mm.',
  8: '....gggggsssks..mm',
  9: '.....GggggsssS.h..',
  10: '......ggssSS..h...',
  11: '.....bbbbbbbbh....',
});

const WORK_SWUNG = withRows(IDLE, {
  13: '....sbbbbbbbbsh...',
  14: '.....bbbbbbbb.h...',
  15: '.....bbbbbbBB..hm.',
  16: '.....bbbbbbBB.mm..',
});

const DELIVER_TOP = [
  '......pppppp......',
  '.....spPPPPps.....',
  '......pppppp......',
];

const DELIVER_OPEN = [...DELIVER_TOP, ...IDLE.slice(3, 17), ...WALK_OPEN.slice(17)];
const DELIVER_SHUFFLE = [...DELIVER_TOP, ...IDLE.slice(3, 17), ...WALK_SHUFFLE.slice(17)];

function makeTexture(rows: string[]): Texture {
  if (rows.length !== H || rows.some((r) => r.length !== W)) {
    throw new Error(`sprite grid must be ${W}x${H}`);
  }
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

/** Paints the idle frame big and crisp onto a plain canvas (profile portrait). */
export function renderPortrait(canvas: HTMLCanvasElement, scale = 4): void {
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  IDLE.forEach((row, y) => {
    for (let x = 0; x < W; x++) {
      const color = PALETTE[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
}

export type AgentAnim = 'idle' | 'walk' | 'work' | 'deliver';

export function buildAgentTextures(): Record<AgentAnim, Texture[]> {
  const idle = makeTexture(IDLE);
  return {
    idle: [idle],
    walk: [makeTexture(WALK_OPEN), idle, makeTexture(WALK_SHUFFLE), idle],
    work: [makeTexture(WORK_RAISED), makeTexture(WORK_SWUNG)],
    deliver: [makeTexture(DELIVER_OPEN), makeTexture(DELIVER_SHUFFLE)],
  };
}
