import { DB } from './palette';
import { type AmbientOp, type Anchors, type Coord, resolveCoord, type SceneMarks } from './scene';
import type { Theme } from './themes';

/**
 * The idle life a scene asked for, run over the painting each frame.
 *
 * Each `AmbientOp` becomes a small looping effect: state lives in closures
 * here, drawing goes through the same clear-and-redraw layer the flames use.
 * Water and the flyer take fixed DB colours the way the confetti does — they
 * are renderer details, not theme slots; everything positional resolves
 * through the scene's own anchors so a scene keeps saying *where*.
 */

/** The sliver of Graphics the effects draw with, recordable in a test. */
export interface AmbientSurface {
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
  ): { fill(style: number | { color: number; alpha?: number }): unknown };
  poly(points: number[]): { fill(style: number | { color: number; alpha?: number }): unknown };
}

export interface AmbienceContext {
  anchors: Anchors;
  theme: Theme;
  /** What the scene draw reported; drips hang from these. */
  marks: SceneMarks;
  /** Injectable so a test can pin the dice. */
  rng?: () => number;
  /** Injectable so a test can pin the wall clock. */
  now?: () => Date;
}

type Effect = (g: AmbientSurface, dt: number, t: number) => void;

export interface Ambience {
  /** Runs every effect for one frame; `t` is the app clock in seconds. */
  tick(g: AmbientSurface, dt: number, t: number): void;
}

interface Drip {
  phase: 'wait' | 'grow' | 'fall' | 'splash';
  /** Seconds left in the current phase, except while falling. */
  left: number;
  y: number;
  vy: number;
}

/** Water gathering at a stalactite tip, falling, and splashing out. */
function drips(tips: [number, number][], groundY: number, rng: () => number): Effect {
  const state: Drip[] = tips.map(() => ({ phase: 'wait', left: 1 + rng() * 4, y: 0, vy: 0 }));
  return (g, dt) => {
    state.forEach((d, i) => {
      const [x, tipY] = tips[i];
      d.left -= dt;
      switch (d.phase) {
        case 'wait':
          if (d.left <= 0) {
            d.phase = 'grow';
            d.left = 1.1;
          }
          return;
        case 'grow':
          g.rect(x - 1, tipY, 2, d.left < 0.5 ? 3 : 2).fill({ color: DB.sky, alpha: 0.9 });
          if (d.left <= 0) {
            d.phase = 'fall';
            d.y = tipY;
            d.vy = 30;
          }
          return;
        case 'fall':
          d.vy += 380 * dt;
          d.y += d.vy * dt;
          if (d.y >= groundY - 2) {
            d.phase = 'splash';
            d.left = 0.22;
            return;
          }
          g.rect(x - 1, d.y, 2, 3).fill({ color: DB.sky, alpha: 0.9 });
          return;
        case 'splash': {
          const alpha = Math.max(0, d.left / 0.22);
          g.rect(x - 4, groundY - 3, 2, 2).fill({ color: DB.paleBlue, alpha });
          g.rect(x + 3, groundY - 3, 2, 2).fill({ color: DB.paleBlue, alpha });
          g.rect(x - 1, groundY - 5, 2, 2).fill({ color: DB.paleBlue, alpha: alpha * 0.8 });
          if (d.left <= 0) {
            d.phase = 'wait';
            d.left = 2 + rng() * 3;
          }
          return;
        }
      }
    });
  };
}

/** A bat-shaped silhouette crossing the open air, two wing frames. */
function flyer(anchors: Anchors, rng: () => number): Effect {
  // First appearance is scheduled off the app clock lazily: the ticker's `t`
  // is time since page load, not since this world was built.
  let next = -1;
  let active = false;
  let x = 0;
  let dir = 1;
  return (g, dt, t) => {
    if (!active) {
      if (next < 0) next = t + 6 + rng() * 10;
      if (t < next) return;
      active = true;
      dir = rng() < 0.5 ? -1 : 1;
      x = dir === 1 ? -14 : anchors.worldWidth + 14;
    }
    x += dir * 110 * dt;
    if (x < -16 || x > anchors.worldWidth + 16) {
      active = false;
      next = t + 25 + rng() * 20;
      return;
    }
    const y = 122 + Math.sin(t * 2.2) * 10;
    const wingY = Math.floor(t * 6) % 2 === 0 ? y - 3 : y + 1;
    g.rect(x - 3, y - 1, 6, 4).fill(DB.greyDeep);
    g.rect(x - 8, wingY, 5, 3).fill(DB.greyDeep);
    g.rect(x + 3, wingY, 5, 3).fill(DB.greyDeep);
  };
}

/** Dust sinking through a region, each fleck fading in and back out. */
function motes(
  op: Extract<AmbientOp, { fx: 'motes' }>,
  theme: Theme,
  anchors: Anchors,
  rng: () => number,
): Effect {
  const x0 = resolveCoord(op.x, anchors);
  const y0 = resolveCoord(op.y, anchors);
  const w = resolveCoord(op.w, anchors);
  const h = resolveCoord(op.h, anchors);
  const dust = Array.from({ length: op.count }, () => ({
    x: x0 + rng() * w,
    y: y0 + rng() * h,
    vy: 5 + rng() * 4,
    life: rng() * 6,
    ttl: 5 + rng() * 4,
    phase: rng() * 6,
  }));
  return (g, dt, t) => {
    for (const m of dust) {
      m.life += dt;
      m.y += m.vy * dt;
      if (m.life >= m.ttl || m.y > y0 + h) {
        m.life = 0;
        m.ttl = 5 + rng() * 4;
        m.y = y0 + rng() * (h * 0.3);
        m.x = x0 + rng() * w;
      }
      const alpha = Math.sin(Math.PI * Math.min(1, m.life / m.ttl)) * 0.45;
      g.rect(Math.round(m.x + Math.sin(t + m.phase) * 2), Math.round(m.y), 2, 2).fill({
        color: theme.accentLight,
        alpha,
      });
    }
  };
}

/** A slanted shaft of light, dust drifting down inside its edges. */
function beam(
  op: Extract<AmbientOp, { fx: 'beam' }>,
  theme: Theme,
  anchors: Anchors,
  rng: () => number,
): Effect {
  const n = (value: Coord): number => resolveCoord(value, anchors);
  const tl = n(op.topLeft);
  const tr = n(op.topRight);
  const ty = n(op.topY);
  const bl = n(op.botLeft);
  const br = n(op.botRight);
  const by = n(op.botY);
  const drop = by - ty;
  const dust = Array.from({ length: op.count }, () => ({
    u: rng(),
    y: ty + rng() * drop,
    vy: 6 + rng() * 5,
    phase: rng() * 6,
  }));
  return (g, dt, t) => {
    g.poly([tl, ty, tr, ty, br, by, bl, by]).fill({ color: theme.accent, alpha: 0.09 });
    const quarter = (tr - tl) / 4;
    const bottomQuarter = (br - bl) / 4;
    g.poly([
      tl + quarter,
      ty,
      tr - quarter,
      ty,
      br - bottomQuarter,
      by,
      bl + bottomQuarter,
      by,
    ]).fill({ color: theme.accent, alpha: 0.07 });
    for (const m of dust) {
      m.y += m.vy * dt;
      if (m.y > by - 2) {
        m.y = ty;
        m.u = rng();
      }
      const f = (m.y - ty) / drop;
      const xTop = tl + (tr - tl) * m.u;
      const xBottom = bl + (br - bl) * m.u;
      g.rect(Math.round(xTop + (xBottom - xTop) * f + Math.sin(t + m.phase) * 2), Math.round(m.y), 2, 2).fill({
        color: DB.white,
        alpha: 0.26 + 0.12 * Math.sin(t * 1.3 + m.phase),
      });
    }
  };
}

/** A four-beat sparkle on the gilding, at most a few alive at once. */
function glints(
  op: Extract<AmbientOp, { fx: 'glints' }>,
  theme: Theme,
  anchors: Anchors,
  rng: () => number,
): Effect {
  const n = (value: Coord): number => resolveCoord(value, anchors);
  const points = op.points.map(([x, y]) => [n(x), n(y)] as const);
  const strips = op.strips.map((s) => ({ x: n(s.x), y: n(s.y), w: n(s.w) }));
  const live: { x: number; y: number; born: number }[] = [];
  let next = -1;
  return (g, _dt, t) => {
    if (next < 0) next = t + rng() * 2;
    if (t >= next && live.length < 3) {
      if (points.length > 0 && (strips.length === 0 || rng() < 0.6)) {
        const [x, y] = points[Math.floor(rng() * points.length)];
        live.push({ x, y, born: t });
      } else if (strips.length > 0) {
        const s = strips[Math.floor(rng() * strips.length)];
        live.push({ x: Math.round(s.x + rng() * s.w), y: s.y, born: t });
      }
      next = t + 1 + rng();
    }
    for (let i = live.length - 1; i >= 0; i--) {
      const s = live[i];
      const e = (t - s.born) / 0.7;
      if (e >= 1) {
        live.splice(i, 1);
        continue;
      }
      if (e < 0.25) {
        g.rect(s.x - 1, s.y - 1, 2, 2).fill(DB.white);
      } else if (e < 0.85) {
        const reach = e < 0.55 ? 2 : 4;
        const alpha = e < 0.55 ? 0.9 : 0.6;
        g.rect(s.x - 1, s.y - 1, 2, 2).fill({ color: DB.white, alpha: 0.9 });
        for (const [ax, ay] of [
          [-reach, 0],
          [reach, 0],
          [0, -reach],
          [0, reach],
        ]) {
          g.rect(s.x - 1 + ax, s.y - 1 + ay, 2, 2).fill({ color: theme.accentLight, alpha });
        }
      } else {
        g.rect(s.x - 1, s.y - 1, 2, 2).fill({ color: theme.accentLight, alpha: (1 - e) * 3 });
      }
    }
  };
}

/** Live hands over a painted clock face, telling the actual time. */
function clock(
  op: Extract<AmbientOp, { fx: 'clock' }>,
  theme: Theme,
  anchors: Anchors,
  now: () => Date,
): Effect {
  const cx = resolveCoord(op.x, anchors);
  const cy = resolveCoord(op.y, anchors);
  const hourLen = Math.round(op.r * 0.45);
  const minuteLen = Math.round(op.r * 0.7);
  const secondLen = Math.round(op.r * 0.8);
  const TAU = Math.PI * 2;
  return (g) => {
    const d = now();
    const hand = (angle: number, len: number, color: number) => {
      const dx = Math.sin(angle);
      const dy = -Math.cos(angle);
      for (let i = 3; i <= len; i += 2) {
        g.rect(cx + Math.round(dx * i) - 1, cy + Math.round(dy * i) - 1, 2, 2).fill(color);
      }
    };
    hand((((d.getHours() % 12) + d.getMinutes() / 60) / 12) * TAU, hourLen, theme.rockEdge);
    hand((d.getMinutes() / 60) * TAU, minuteLen, theme.rockEdge);
    // The second hand ticks whole seconds — a sweep would look digital.
    hand((d.getSeconds() / 60) * TAU, secondLen, DB.rose);
    g.rect(cx - 1, cy - 1, 3, 3).fill(theme.rockEdge);
  };
}

export function createAmbience(ops: AmbientOp[], ctx: AmbienceContext): Ambience {
  const rng = ctx.rng ?? Math.random;
  const now = ctx.now ?? (() => new Date());
  const effects = ops.map((op): Effect => {
    switch (op.fx) {
      case 'drips':
        return drips(ctx.marks.spikeTips, ctx.anchors.groundY, rng);
      case 'flyer':
        return flyer(ctx.anchors, rng);
      case 'motes':
        return motes(op, ctx.theme, ctx.anchors, rng);
      case 'beam':
        return beam(op, ctx.theme, ctx.anchors, rng);
      case 'glints':
        return glints(op, ctx.theme, ctx.anchors, rng);
      case 'clock':
        return clock(op, ctx.theme, ctx.anchors, now);
      case 'plateloop':
        // Plate life is a raster tile, and this surface draws primitives —
        // the world canvas runs these as scrolling textures itself. A no-op
        // here rather than an omission, so the switch stays exhaustive and a
        // new fx cannot slip through silently (D-147's rule).
        return () => {};
    }
  });
  return {
    tick: (g, dt, t) => {
      for (const effect of effects) effect(g, dt, t);
    },
  };
}
