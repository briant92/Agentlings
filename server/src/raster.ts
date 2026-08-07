import { deflateSync } from 'node:zlib';
import type { Surface } from '@agentlings/shared';

/**
 * A headless surface, so a scene can be drawn where there is no browser.
 *
 * The point is not the file: it is that a session authoring a world can look
 * at what it drew. Until now a pack was composed blind and checked only for
 * whether it *resolved* — every slot defined, every coordinate parsable —
 * which says nothing about whether the picture reads or whether the crew can
 * be seen standing on it.
 *
 * It implements the same four-method `Surface` the live world and the level
 * card implement, and the scene is walked by the same `drawScene`. That is the
 * whole reason to do it this way rather than write a second painter: a
 * renderer that could disagree with the app would be worse than none, because
 * it would be believed. This lives in the server rather than in shared because
 * it needs `node:zlib`, and shared is bundled into the browser.
 */

export interface Raster {
  pixels: Uint8ClampedArray;
  w: number;
  h: number;
}

/**
 * A surface that composites into an RGB pixel buffer.
 *
 * Alpha is composited immediately rather than accumulated: the scrim draws
 * bands of rising alpha that tile exactly, so each pixel is written once per
 * band and the strength at any row must be the one the scrim computed. Every
 * primitive rounds to whole pixels and keeps a minimum of one, matching the
 * canvas surface — a hairline that survives on the level card must survive
 * here, or the two pictures diverge on exactly the details a pack is judged on.
 */
export function bufferSurface(
  w: number,
  h: number,
  scale = 1,
  background = 0x000000,
): { surface: Surface; raster: Raster } {
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const pixels = new Uint8ClampedArray(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = (background >> 16) & 0xff;
    pixels[i * 3 + 1] = (background >> 8) & 0xff;
    pixels[i * 3 + 2] = background & 0xff;
  }
  const raster: Raster = { pixels, w: width, h: height };

  const blend = (px: number, py: number, color: number, alpha: number): void => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const i = (py * width + px) * 3;
    const a = alpha >= 1 ? 1 : alpha <= 0 ? 0 : alpha;
    pixels[i] = ((color >> 16) & 0xff) * a + pixels[i] * (1 - a);
    pixels[i + 1] = ((color >> 8) & 0xff) * a + pixels[i + 1] * (1 - a);
    pixels[i + 2] = (color & 0xff) * a + pixels[i + 2] * (1 - a);
  };

  const box = (x: number, y: number, bw: number, bh: number, color: number, alpha = 1): void => {
    const x0 = Math.round(x * scale);
    const y0 = Math.round(y * scale);
    const x1 = x0 + Math.max(1, Math.round(bw * scale));
    const y1 = y0 + Math.max(1, Math.round(bh * scale));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) blend(px, py, color, alpha);
  };

  return {
    raster,
    surface: {
      rect: (x, y, rw, rh, color, alpha) => box(x, y, rw, rh, color, alpha ?? 1),
      circle: (x, y, r, color, alpha) => {
        const cx = x * scale;
        const cy = y * scale;
        const rr = Math.max(0.5, r * scale);
        for (let py = Math.floor(cy - rr); py <= Math.ceil(cy + rr); py++) {
          for (let px = Math.floor(cx - rr); px <= Math.ceil(cx + rr); px++) {
            const dx = (px + 0.5 - cx) / rr;
            const dy = (py + 0.5 - cy) / rr;
            if (dx * dx + dy * dy <= 1) blend(px, py, color, alpha ?? 1);
          }
        }
      },
      // Even-odd scanline fill. Every polygon the format can express is simple
      // (the `ceiling` mass is a strip, `poly` is an authored outline), and for
      // a simple polygon even-odd and non-zero agree — so this matches what
      // the canvas does without carrying a winding rule nothing needs.
      poly: (points, color, alpha) => {
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i < points.length; i += 2) {
          xs.push(points[i] * scale);
          ys.push(points[i + 1] * scale);
        }
        if (xs.length < 3) return;
        const top = Math.max(0, Math.floor(Math.min(...ys)));
        const bottom = Math.min(height - 1, Math.ceil(Math.max(...ys)));
        for (let py = top; py <= bottom; py++) {
          const yc = py + 0.5;
          const spans: number[] = [];
          for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
            const yi = ys[i];
            const yj = ys[j];
            if (yi > yc !== yj > yc) {
              spans.push(xs[i] + ((yc - yi) / (yj - yi)) * (xs[j] - xs[i]));
            }
          }
          spans.sort((a, b) => a - b);
          for (let k = 0; k + 1 < spans.length; k += 2) {
            const from = Math.round(spans[k]);
            const to = Math.round(spans[k + 1]);
            for (let px = from; px < to; px++) blend(px, py, color, alpha ?? 1);
          }
        }
      },
      // Squares stepped along each segment: a round join, where the canvas
      // draws butt caps. The only caller is the cave ceiling's edge line, and
      // the difference is sub-pixel at the widths it uses.
      polyline: (points, lineWidth, color) => {
        const t = Math.max(1, Math.round(lineWidth * scale));
        for (let i = 1; i < points.length; i++) {
          const [ax, ay] = points[i - 1];
          const [bx, by] = points[i];
          const x0 = ax * scale;
          const y0 = ay * scale;
          const x1 = bx * scale;
          const y1 = by * scale;
          const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
          for (let s = 0; s <= steps; s++) {
            const px = Math.round(x0 + ((x1 - x0) * s) / steps - t / 2);
            const py = Math.round(y0 + ((y1 - y0) * s) / steps - t / 2);
            for (let dy = 0; dy < t; dy++) for (let dx = 0; dx < t; dx++) {
              blend(px + dx, py + dy, color, 1);
            }
          }
        }
      },
    },
  };
}

/**
 * Relative luminance, 0–100.
 *
 * The WCAG definition, and the same measure D-107 used to find that a scrim
 * over a bright ground took one agentling's separation from 20.9 to 0.3.
 * That measurement was made by hand and left nothing runnable behind; this is
 * the number given a home, so the next pack is judged by it automatically.
 */
export function relLuminance(color: number): number {
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((color >> 16) & 0xff);
  const g = channel((color >> 8) & 0xff);
  const b = channel(color & 0xff);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) * 100;
}

/** Mean luminance of a rectangle of the raster, in raster pixels. */
export function meanLuminance(r: Raster, x: number, y: number, w: number, h: number): number {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(r.w, Math.round(x + w));
  const y1 = Math.min(r.h, Math.round(y + h));
  let total = 0;
  let n = 0;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * r.w + px) * 3;
      total += relLuminance((r.pixels[i] << 16) | (r.pixels[i + 1] << 8) | r.pixels[i + 2]);
      n++;
    }
  }
  return n === 0 ? 0 : total / n;
}

/** How tall and wide an agentling stands, in world units. */
export const CREW_W = 18;
export const CREW_H = 20;

/**
 * A crew-shaped block where an agentling will stand, outlined in the pack's
 * own `rim` slot.
 *
 * A stand-in, not the art: the real sprite is an 18×20 frame from the atlas,
 * and this is a solid body in that agentling's gown colour. It is drawn for
 * the same reason the review preview exists at all — a picture of a world with
 * nobody in it cannot show the one fault that matters most, which is that the
 * crew vanish into it.
 */
export function drawStandIn(
  s: Surface,
  x: number,
  groundY: number,
  gown: number,
  rim?: number,
): void {
  const left = x - CREW_W / 2;
  const top = groundY - CREW_H;
  if (rim !== undefined) s.rect(left - 1, top - 1, CREW_W + 2, CREW_H + 2, rim);
  s.rect(left, top, CREW_W, CREW_H, gown);
}

export interface Separation {
  /** Where the crew stands, in world units. */
  at: number;
  /** Mean luminance of the scene behind them. */
  behind: number;
  /** The gown that separates least from it, and by how much. */
  gown: number;
  separation: number;
}

/**
 * How well each crew position separates from what is drawn behind it.
 *
 * Measured before the stand-ins are drawn — the question is what the *pack*
 * puts behind an agentling, and a block already painted there would answer it
 * with its own colour.
 */
export function separationAt(
  raster: Raster,
  positions: readonly number[],
  groundY: number,
  gowns: readonly number[],
  scale = 1,
): Separation[] {
  return positions.map((at) => {
    const behind = meanLuminance(
      raster,
      (at - CREW_W / 2) * scale,
      (groundY - CREW_H) * scale,
      CREW_W * scale,
      CREW_H * scale,
    );
    let gown = gowns[0] ?? 0;
    let separation = Infinity;
    for (const g of gowns) {
      const d = Math.abs(relLuminance(g) - behind);
      if (d < separation) {
        separation = d;
        gown = g;
      }
    }
    return { at, behind, gown, separation: separation === Infinity ? 0 : separation };
  });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * The raster as a PNG. Truecolour, 8-bit, no filtering — the buffer is always
 * opaque, and `zlib` is in node, so this costs no dependency at all.
 */
export function encodePng(r: Raster): Buffer {
  const stride = r.w * 3;
  const raw = Buffer.alloc((stride + 1) * r.h);
  for (let y = 0; y < r.h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(r.pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(r.w, 0);
  ihdr.writeUInt32BE(r.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
