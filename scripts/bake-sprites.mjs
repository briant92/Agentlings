// Bakes the agentling's hand-authored frames into a spritesheet: a PNG plus
// an Aseprite-shaped atlas. Run with `node scripts/bake-sprites.mjs`.
//
// The character grids below are the master copy of our own art. Everything
// downstream — the runtime fallback JSON and the PNG the loader prefers — is
// generated from here, so there is one definition rather than three.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const W = 18;
const H = 20;

/** Every colour is a DB32 entry; the world draws from the same ramp. */
const PALETTE = {
  k: '#222034', // eye / outline
  g: '#6abe30', // hair
  G: '#4b692f', // hair shade
  s: '#eec39a', // skin / feet
  S: '#d9a066', // skin shade
  b: '#5b6ee1', // gown
  B: '#3f3f74', // gown shade
  f: '#222034', // legs
  p: '#d9a066', // parcel
  P: '#8a6f30', // parcel shade
  h: '#663931', // pickaxe handle
  m: '#9badb7', // pickaxe head
};

// Facing right; the renderer flips with a negative x-scale.
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

const withRows = (base, patch) => base.map((row, i) => patch[i] ?? row);

const FRAMES = {
  'stand': BASE,
  'walk-contact': withRows(BASE, {
    17: '......ff.ff.......',
    18: '.....ss...ss......',
    19: '....ss.....ss.....',
  }),
  'walk-down': [
    '..................',
    ...BASE.slice(0, 16),
    '......ffff........',
    '......ss.ss.......',
    '.....ss...ss......',
  ],
  'walk-high': withRows(BASE, {
    17: '......ff.ff.......',
    18: '......ss..ss......',
    19: '.....ss....ss.....',
  }),
  'work-raised': withRows(BASE, {
    8: '.....GgggsssS..mm.',
    9: '......ggsssS...hm.',
    10: '.....bbbbbbb..h...',
    11: '.....bbbbbbbsh....',
  }),
  'work-mid': withRows(BASE, {
    11: '.....bbbbbbbs..m..',
    12: '.....bbbbbbbshhhm.',
  }),
  'work-struck': withRows(BASE, {
    13: '.....bbbbbbb.h....',
    14: '.....bbbbbBB..h...',
    15: '.....bbbbbBB...hm.',
    16: '.....bbbbbbB...mm.',
  }),
  'deliver-a': [
    '.....ppppppp......',
    '....spPPPPPps.....',
    '.....ppppppp......',
    ...BASE.slice(2, 17),
    '.....ss...ss......',
    '....ss.....ss.....',
  ],
  'deliver-b': [
    '.....ppppppp......',
    '....spPPPPPps.....',
    '.....ppppppp......',
    ...BASE.slice(2, 17),
    '......ss..ss......',
    '.....ss....ss.....',
  ],
};

/**
 * Cycles name their frames rather than spanning a range, because ours reuse
 * frames — the pickaxe passes through "mid" on the way out and back.
 */
const ANIMATIONS = {
  walk: ['walk-contact', 'walk-down', 'stand', 'walk-high'],
  work: ['work-raised', 'work-mid', 'work-struck', 'work-mid'],
  deliver: ['deliver-a', 'deliver-b'],
};

for (const [name, rows] of Object.entries(FRAMES)) {
  if (rows.length !== H || rows.some((r) => r.length !== W)) {
    throw new Error(`frame "${name}" is not ${W}x${H}`);
  }
}

// ── PNG encoding ────────────────────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Straight RGBA PNG, filter 0 on every scanline — small and easy to verify. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const start = y * (1 + width * 4);
    raw[start] = 0;
    rgba.copy(raw, start + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Bake ────────────────────────────────────────────────────────────────────
const names = Object.keys(FRAMES);
const sheetWidth = W * names.length;
const rgba = Buffer.alloc(sheetWidth * H * 4); // transparent by default

names.forEach((name, index) => {
  const originX = index * W;
  FRAMES[name].forEach((row, y) => {
    for (let x = 0; x < W; x++) {
      const hex = PALETTE[row[x]];
      if (!hex) continue; // '.' is transparent
      const at = (y * sheetWidth + originX + x) * 4;
      rgba[at] = parseInt(hex.slice(1, 3), 16);
      rgba[at + 1] = parseInt(hex.slice(3, 5), 16);
      rgba[at + 2] = parseInt(hex.slice(5, 7), 16);
      rgba[at + 3] = 255;
    }
  });
});

const atlas = {
  frames: Object.fromEntries(
    names.map((name, index) => [
      name,
      {
        frame: { x: index * W, y: 0, w: W, h: H },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: W, h: H },
        sourceSize: { w: W, h: H },
      },
    ]),
  ),
  animations: ANIMATIONS,
  meta: {
    app: 'agentlings/bake-sprites',
    image: 'agentling.png',
    format: 'RGBA8888',
    size: { w: sheetWidth, h: H },
    scale: '1',
  },
};

const artDir = path.join(ROOT, 'web', 'public', 'art');
mkdirSync(artDir, { recursive: true });
writeFileSync(path.join(artDir, 'agentling.png'), encodePng(sheetWidth, H, rgba));
writeFileSync(path.join(artDir, 'agentling.json'), `${JSON.stringify(atlas, null, 2)}\n`);

// The runtime fallback: the same art as data, for when no sheet is present.
writeFileSync(
  path.join(ROOT, 'web', 'src', 'world', 'agentling.source.json'),
  `${JSON.stringify({ size: { w: W, h: H }, palette: PALETTE, frames: FRAMES, animations: ANIMATIONS }, null, 2)}\n`,
);

console.log(
  `baked ${names.length} frames → ${sheetWidth}x${H} sheet, ${Object.keys(ANIMATIONS).length} cycles`,
);
