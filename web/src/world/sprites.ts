import { Texture } from 'pixi.js';

/**
 * Hand-authored pixel-art frames for the agentlings, stored as character
 * grids and baked into nearest-neighbor textures at startup. 18x20 logical
 * pixels per frame, rendered at SPRITE_SCALE in the world. Original art in
 * the spirit of the classic: big mop of hair, blue gown, bare stepping feet.
 */
export const SPRITE_SCALE = 2;

const W = 18;
const H = 20;

const PALETTE: Record<string, string> = {
  k: '#14141e', // eye / outline
  g: '#35c435', // hair
  G: '#1e8c1e', // hair shade
  s: '#f0e0d0', // skin / feet
  S: '#c09878', // skin shade
  b: '#4650ff', // gown
  B: '#2c34b4', // gown shade
  f: '#202030', // legs
  p: '#d8b830', // parcel
  P: '#a88820', // parcel shade
  h: '#7a4a20', // pickaxe handle
  m: '#9aa0b0', // pickaxe head
};

// Facing right; the renderer flips with a negative x-scale.
// Stand pose — also the passing frame of the walk cycle and the portrait.
const BASE = [
  '..................',
  '.....gggggg.......',
  '....gggggggg......',
  '...gggggggggg.....',
  '...gGggggggggg....',
  '...gGgggggggg.....',
  '....Gggggssss.....',
  '....Gggggsssks....',
  '.....GgggsssS.....',
  '......ggsssS......',
  '.....bbbbbbb......',
  '.....bbbbbbbs.....',
  '.....bbbbbbbs.....',
  '.....bbbbbbb......',
  '.....bbbbbBB......',
  '.....bbbbbBB......',
  '.....bbbbbbB......',
  '.......ff.........',
  '.......ss.........',
  '......ssss........',
];

function withRows(base: string[], patch: Record<number, string>): string[] {
  return base.map((row, i) => patch[i] ?? row);
}

// Classic 4-frame gait: contact (legs split) → down (body drops a pixel)
// → passing (stand) → high (opposite split).
const WALK_CONTACT = withRows(BASE, {
  17: '......ff.ff.......',
  18: '.....ss...ss......',
  19: '....ss.....ss.....',
});

const WALK_HIGH = withRows(BASE, {
  17: '......ff.ff.......',
  18: '......ss..ss......',
  19: '.....ss....ss.....',
});

const WALK_DOWN = [
  '..................',
  ...BASE.slice(0, 16),
  '......ffff........',
  '......ss.ss.......',
  '.....ss...ss......',
];

// Three-frame pickaxe swing: raised → mid → struck.
const WORK_RAISED = withRows(BASE, {
  8: '.....GgggsssS..mm.',
  9: '......ggsssS...hm.',
  10: '.....bbbbbbb..h...',
  11: '.....bbbbbbbsh....',
});

const WORK_MID = withRows(BASE, {
  11: '.....bbbbbbbs..m..',
  12: '.....bbbbbbbshhhm.',
});

const WORK_STRUCK = withRows(BASE, {
  13: '.....bbbbbbb.h....',
  14: '.....bbbbbBB..h...',
  15: '.....bbbbbBB...hm.',
  16: '.....bbbbbbB...mm.',
});

// Delivery walk: the result carried overhead, two-step gait underneath.
const DELIVER_TOP = [
  '.....ppppppp......',
  '....spPPPPPps.....',
  '.....ppppppp......',
];

const DELIVER_BODY = [...BASE.slice(2, 10), ...BASE.slice(10, 17)];

const DELIVER_A = [
  ...DELIVER_TOP,
  ...DELIVER_BODY,
  '.....ss...ss......',
  '....ss.....ss.....',
];

const DELIVER_B = [
  ...DELIVER_TOP,
  ...DELIVER_BODY,
  '......ss..ss......',
  '.....ss....ss.....',
];

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

/** Paints the stand frame big and crisp onto a plain canvas (profile portrait). */
export function renderPortrait(canvas: HTMLCanvasElement, scale = 4): void {
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  BASE.forEach((row, y) => {
    for (let x = 0; x < W; x++) {
      const color = PALETTE[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
}

export type AgentAnim = 'walk' | 'work' | 'deliver';

export function buildAgentTextures(): Record<AgentAnim, Texture[]> {
  return {
    walk: [
      makeTexture(WALK_CONTACT),
      makeTexture(WALK_DOWN),
      makeTexture(BASE),
      makeTexture(WALK_HIGH),
    ],
    work: [
      makeTexture(WORK_RAISED),
      makeTexture(WORK_MID),
      makeTexture(WORK_STRUCK),
      makeTexture(WORK_MID),
    ],
    deliver: [makeTexture(DELIVER_A), makeTexture(DELIVER_B)],
  };
}
