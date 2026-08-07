import type { Graphics } from 'pixi.js';
import {
  anchorsOf,
  drawScene,
  paintOf,
  resolveCoord,
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
  type Surface,
  type Theme,
} from '@agentlings/shared';

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

// The format *and* the interpreter now live in shared — a pack is validated by
// the server, drawn by a CLI renderer, and painted here, and none of those can
// import the other two. Re-exported so every existing importer of `./scene`
// keeps working unchanged; only the two surfaces above are the browser's own.
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
  Surface,
  Theme,
};
export { anchorsOf, drawScene, paintOf, resolveCoord };
