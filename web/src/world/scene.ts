import type { Graphics } from 'pixi.js';
import {
  EXIT_X,
  paintOf,
  resolveCoord,
  SPAWN_X,
  WORLD_WIDTH,
  type AmbientOp,
  type Anchors,
  type Backdrop,
  type Coord,
  type Fill,
  type Paint,
  type Scene,
  type SceneMarks,
  type SceneOp,
  type Scrim,
  type Theme,
} from '@agentlings/shared';

/**
 * What a scene can draw on.
 *
 * The interpreter targets this rather than Pixi directly, so the same scene
 * data paints the live world, the level-select thumbnail, and a recorder in a
 * test. The thumbnails used to be a second hand-drawn cave that could — and
 * did — disagree with the world it claimed to preview.
 */
export interface Surface {
  rect(x: number, y: number, w: number, h: number, color: number, alpha?: number): void;
  circle(x: number, y: number, r: number, color: number, alpha?: number): void;
  poly(points: number[], color: number, alpha?: number): void;
  polyline(points: [number, number][], width: number, color: number): void;
}

export function pixiSurface(g: Graphics): Surface {
  const fill = (color: number, alpha?: number) =>
    alpha === undefined ? { color } : { color, alpha };
  return {
    rect: (x, y, w, h, color, alpha) => void g.rect(x, y, w, h).fill(fill(color, alpha)),
    circle: (x, y, r, color, alpha) => void g.circle(x, y, r).fill(fill(color, alpha)),
    poly: (points, color, alpha) => void g.poly(points).fill(fill(color, alpha)),
    polyline: (points, width, color) => {
      g.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points) g.lineTo(x, y);
      g.stroke({ width, color });
    },
  };
}

/** Draws a scene into a 2D context, scaled — used for the level cards. */
export function canvasSurface(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  css: (color: number) => string,
): Surface {
  const set = (color: number, alpha?: number) => {
    ctx.globalAlpha = alpha ?? 1;
    ctx.fillStyle = css(color);
  };
  return {
    rect: (x, y, w, h, color, alpha) => {
      set(color, alpha);
      ctx.fillRect(x * sx, y * sy, Math.max(1, w * sx), Math.max(1, h * sy));
    },
    circle: (x, y, r, color, alpha) => {
      set(color, alpha);
      ctx.beginPath();
      ctx.ellipse(x * sx, y * sy, r * sx, r * sy, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    poly: (points, color, alpha) => {
      set(color, alpha);
      ctx.beginPath();
      ctx.moveTo(points[0] * sx, points[1] * sy);
      for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i] * sx, points[i + 1] * sy);
      ctx.closePath();
      ctx.fill();
    },
    polyline: (points, width, color) => {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = css(color);
      ctx.lineWidth = Math.max(1, width * sy);
      ctx.beginPath();
      ctx.moveTo(points[0][0] * sx, points[0][1] * sy);
      for (const [x, y] of points) ctx.lineTo(x * sx, y * sy);
      ctx.stroke();
    },
  };
}

// The format itself lives in shared — a pack is validated by the server and
// by a CLI checker, neither of which can import this module. Re-exported here
// so every existing importer of `./scene` keeps working unchanged.
export type {
  AmbientOp,
  Anchors,
  Backdrop,
  Coord,
  Fill,
  Paint,
  Scene,
  SceneMarks,
  SceneOp,
  Scrim,
  Theme,
};
export { paintOf, resolveCoord };

/**
 * The anchors a scene hangs its coordinates on.
 *
 * x comes from the shared constants because the server sim positions crew and
 * stations with them; y comes from the scene. One function so the world, the
 * thumbnail and any future pack cannot disagree about where the ground is —
 * they used to hold separate copies of the same two numbers.
 */
export function anchorsOf(scene: Scene): Anchors {
  return {
    worldWidth: WORLD_WIDTH,
    viewH: scene.viewH,
    groundY: scene.groundY,
    spawnX: SPAWN_X,
    exitX: EXIT_X,
  };
}

/** Deterministic PRNG so a scene looks the same every time it is drawn. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawOp(
  s: Surface,
  op: SceneOp,
  theme: Theme,
  anchors: Anchors,
  rng: () => number,
  dx: number,
  marks: SceneMarks,
): void {
  const n = (value: Coord): number => resolveCoord(value, anchors);
  const c = (name: Paint): number => paintOf(theme, name);

  switch (op.op) {
    case 'rect':
      s.rect(n(op.x) + dx, n(op.y), n(op.w), n(op.h), c(op.color), op.alpha);
      return;

    case 'circle':
      s.circle(n(op.x) + dx, n(op.y), op.r, c(op.color), op.alpha);
      return;

    case 'poly':
      s.poly(
        op.points.flatMap(([px, py]) => [n(px) + dx, n(py)]),
        c(op.color),
        op.alpha,
      );
      return;

    case 'repeat':
      for (const at of op.at) {
        for (const child of op.of) drawOp(s, child, theme, anchors, rng, dx + n(at), marks);
      }
      return;

    case 'band': {
      const to = n(op.to);
      const alongX = op.axis === 'x';
      for (let at = n(op.from); at < to; at += op.step) {
        // A child says `y: 0` (or `x: 0`) and means "wherever this row is".
        for (const child of op.of) {
          if (alongX) drawOp(s, child, theme, anchors, rng, dx + at, marks);
          else drawOp(s, shiftY(child, at), theme, anchors, rng, dx, marks);
        }
      }
      return;
    }

    case 'speckle': {
      const x = n(op.x) + dx;
      const y = n(op.y);
      const w = n(op.w);
      const h = n(op.h);
      for (let i = 0; i < op.count; i++) {
        const sx = Math.floor(x + rng() * w);
        const sy = Math.floor(y + rng() * h);
        const size = 2 + Math.floor(rng() * 3) * 2;
        const color = rng() < 0.5 ? op.light : op.dark;
        s.rect(sx, sy, size, Math.max(2, size - 2), c(color), 0.6);
      }
      return;
    }

    case 'veins': {
      const x = n(op.x) + dx;
      const y = n(op.y);
      const w = n(op.w);
      const h = n(op.h);
      for (let i = 0; i < op.count; i++) {
        let vx = Math.floor(x + rng() * w);
        let vy = Math.floor(y + rng() * h);
        const steps = 4 + Math.floor(rng() * 5);
        const down = rng() < 0.5 ? 1 : -1;
        for (let step = 0; step < steps; step++) {
          s.rect(vx, vy, 2, 2, c(op.color), op.alpha ?? 0.8);
          vx += 2;
          if (rng() < 0.6) vy += 2 * down;
        }
      }
      return;
    }

    case 'tufts': {
      const x = n(op.x) + dx;
      const y = n(op.y);
      const w = n(op.w);
      for (let i = 0; i < op.count; i++) {
        const bx = Math.floor(x + rng() * w);
        s.rect(bx, y, 2, op.height, c(op.color), op.alpha ?? 0.95);
        if (rng() < 0.3) {
          s.rect(bx + 3, y + 1, 2, op.height - 1, c(op.alt ?? op.color), 0.9);
        }
      }
      return;
    }

    case 'ceiling':
      drawCeiling(s, op, theme, anchors, rng, c, marks);
      return;
  }
}

/** Children of a `band` are positioned relative to the row they land on. */
function shiftY(op: SceneOp, by: number): SceneOp {
  if (op.op === 'rect' && typeof op.y === 'number') return { ...op, y: op.y + by };
  if (op.op === 'circle' && typeof op.y === 'number') return { ...op, y: op.y + by };
  return op;
}

function drawCeiling(
  s: Surface,
  op: Extract<SceneOp, { op: 'ceiling' }>,
  theme: Theme,
  anchors: Anchors,
  rng: () => number,
  c: (name: Paint) => number,
  marks: SceneMarks,
): void {
  const n = (value: Coord): number => resolveCoord(value, anchors);
  const minY = n(op.minY);
  const maxY = n(op.maxY);
  const flatNear = op.flatNear;

  const edge: [number, number][] = [];
  for (let x = 0; x <= anchors.worldWidth; x += op.step) {
    const flat = flatNear !== undefined && Math.abs(x - n(flatNear.at)) < flatNear.within;
    edge.push([x, flat && flatNear ? n(flatNear.y) : minY + rng() * (maxY - minY)]);
  }

  const mass: number[] = [0, 0, anchors.worldWidth, 0];
  for (let i = edge.length - 1; i >= 0; i--) mass.push(edge[i][0], edge[i][1]);
  s.poly(mass, c(op.fill));
  s.polyline(edge, 3, c(op.edge));

  const hang = op.hang;
  if (!hang) return;
  const drawSpike = (ex: number, ey: number, spike: NonNullable<typeof hang.spike>): void => {
    s.rect(ex - 6, ey - 2, 12, 6, c(spike.color));
    s.rect(ex - 4, ey + 4, 8, 5, c(spike.color));
    s.rect(ex - 2, ey + 9, 4, 5, c(spike.tip));
    marks.spikeTips.push([ex, ey + 14]);
  };
  for (const [i, [ex, ey]] of edge.entries()) {
    if ((hang.clearOf ?? []).some((clear) => Math.abs(ex - n(clear.at)) < clear.within)) continue;
    // A deep point — lower than both neighbours, past the spike bar — always
    // grows a stalactite. "Spikes at the deep points" was pure dice before,
    // and the shipped cave's seed rolled none anywhere: a comment the picture
    // did not keep. Endpoints sit over the side walls and never qualify.
    if (
      hang.spike &&
      i > 0 &&
      i < edge.length - 1 &&
      ey > n(hang.spike.below) &&
      ey > edge[i - 1][1] &&
      ey > edge[i + 1][1]
    ) {
      drawSpike(ex, ey, hang.spike);
      continue;
    }
    const roll = rng();
    if (hang.spike && roll < hang.spike.chance && ey > n(hang.spike.below)) {
      drawSpike(ex, ey, hang.spike);
    } else if (hang.vine && roll < (hang.spike?.chance ?? 0) + hang.vine.chance) {
      const len = hang.vine.min + rng() * (hang.vine.max - hang.vine.min);
      s.rect(ex - 1, ey, 2, len, c(hang.vine.color), 0.95);
      s.rect(ex - 1, ey, 2, len * 0.4, c(hang.vine.tip), 0.95);
      for (let vy = ey + 6; vy < ey + len - 2; vy += 7) {
        const side = Math.floor(vy / 7) % 2 === 0 ? 1 : -3;
        s.rect(ex + side, vy, 2, 2, c(hang.vine.tip), 0.9);
      }
    }
  }
}

/**
 * Draws a whole scene.
 *
 * Each top-level op gets its own seed rather than sharing one stream, so
 * inserting an op does not reshuffle the grain of every op after it. Authoring
 * terrain means adding and removing things constantly, and a format where that
 * silently repaints the whole world is one nobody can work in.
 */
export function drawScene(
  s: Surface,
  scene: Scene,
  theme: Theme,
  anchors: Anchors,
  seed = 0xa9e27,
): SceneMarks {
  const marks: SceneMarks = { spikeTips: [] };
  const backdrop = scene.backdrop;
  // Seeded off its own base, for the same reason each op has its own stream:
  // adding a rock to the foreground must not reshuffle the grain of the sky.
  backdrop?.ops?.forEach((op, i) => {
    drawOp(s, op, theme, anchors, mulberry32(BACKDROP_SEED + i * 0x9e3779b1), 0, marks);
  });
  if (backdrop?.scrim) drawScrim(s, backdrop.scrim, theme, anchors);
  scene.ops.forEach((op, i) => {
    drawOp(s, op, theme, anchors, mulberry32(seed + i * 0x9e3779b1), 0, marks);
  });
  return marks;
}

/** Far enough from the foreground's default that the two never collide. */
const BACKDROP_SEED = 0x5c81b;

/**
 * The scrim: bands of rising alpha down to the ground line, then a solid
 * remainder beneath it.
 *
 * Each band is drawn once over untouched backdrop and the bands tile exactly,
 * so the alphas never compound — the strength at any row is the one this
 * computes, not an accumulation. Rows are snapped to whole pixels so a
 * fractional band height cannot leave a bright seam between two bands.
 */
function drawScrim(s: Surface, scrim: Scrim, theme: Theme, anchors: Anchors): void {
  const color = paintOf(theme, scrim.color);
  const from = resolveCoord(scrim.from, anchors);
  const { groundY, viewH, worldWidth } = anchors;
  const steps = Math.max(1, Math.floor(scrim.steps ?? 12));

  for (let i = 0; i < steps; i++) {
    const top = Math.round(from + ((groundY - from) * i) / steps);
    const bottom = Math.round(from + ((groundY - from) * (i + 1)) / steps);
    if (bottom <= top) continue;
    s.rect(0, top, worldWidth, bottom - top, color, (scrim.alpha * (i + 1)) / steps);
  }
  // Below the ground line the backdrop is behind the floor anyway, but a pack
  // may leave a gap there and a half-lit strip under the crew's feet would be
  // worse than either extreme.
  if (viewH > groundY) s.rect(0, groundY, worldWidth, viewH - groundY, color, scrim.alpha);
}
