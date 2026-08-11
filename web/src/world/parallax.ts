import { PLATE_OVERSCAN, WORLD_WIDTH } from '@agentlings/shared';

/**
 * The motion law for drifting plates (v2, PRERENDER §3): renderer-owned, not
 * authored. A pack chooses plate ORDER and whether each file carries the
 * overscan; what moves, how far and in which direction is app law, the way
 * scrim semantics are — fewer knobs for a session to misuse, and every world
 * breathes the same way.
 *
 * The model: the sprite plane is locked (the sim owns x, hit areas are
 * fixed), and the pointer is a small camera pan. Locked to the sprite plane,
 * things *behind* it shift WITH the pan — more the farther they are, like the
 * moon out of a train window — and the occlusion strip in front shifts
 * against it, faster. So plates[0], the farthest, gets the full rate and the
 * stack decays toward the sprites; the strip runs negative.
 *
 * Everything is whole-pixel: pixel art wants steps, not smears (the Pixi
 * roundPixels note in PRERENDER). And nothing may ever exceed the overscan
 * margin, which is the checker's clearance assumption — the clamp is the
 * contract, not a nicety.
 */

/** Same-direction rates by plate index, back to front. */
export const DRIFT_RATES = [1, 0.55, 0.25] as const;
/** The strip in front runs against the pan, hardest of all. */
export const OCCLUSION_RATE = -1.4;
/** Camera pan at full pointer deflection, in world px (rate 1 plate). */
export const DRIFT_BUDGET = 20;
/** Idle breathing amplitude, world px at rate 1. */
export const IDLE_AMPLITUDE = 8;
/** One full idle sway, seconds. */
export const IDLE_PERIOD_S = 26;

/** The hard bound any layer may move: half the overscan, the checker's margin. */
export const DRIFT_MAX = PLATE_OVERSCAN / 2;

/**
 * What a loaded plate texture is, judged by its natural size against the
 * scene: its width in world units, and whether it drifts at all. A plate at
 * exactly the view width is pinned wherever it sits in the stack — that is
 * how every v1 pack keeps holding still.
 */
export function planeFor(
  naturalW: number,
  naturalH: number,
  viewH: number,
): { worldW: number; overscan: boolean } {
  const scale = naturalH / viewH;
  const worldW = naturalW / (scale || 1);
  return { worldW, overscan: Math.round(worldW) > WORLD_WIDTH };
}

/** The drift rate a backdrop plate earns: by index, and only if overscanned. */
export function plateRate(index: number, overscan: boolean): number {
  if (!overscan) return 0;
  return DRIFT_RATES[Math.min(index, DRIFT_RATES.length - 1)];
}

/** The strip's rate: against the pan, and only if overscanned. */
export function occlusionRate(overscan: boolean): number {
  return overscan ? OCCLUSION_RATE : 0;
}

/**
 * Where the camera wants to be: the pointer's deflection when there is one,
 * a slow breathing sway when there is not. `pointer` is -1..1 across the
 * canvas; `t` is the app clock in seconds.
 */
export function cameraTarget(pointer: number | null, t: number): number {
  if (pointer !== null) {
    const nx = Math.max(-1, Math.min(1, pointer));
    return nx * DRIFT_BUDGET;
  }
  return Math.sin((t * 2 * Math.PI) / IDLE_PERIOD_S) * IDLE_AMPLITUDE;
}

/** A layer's pixel offset for the current camera: scaled, clamped, whole. */
export function layerOffset(rate: number, camera: number): number {
  return Math.round(layerOffsetRaw(rate, camera));
}

/**
 * The same offset unrounded — the smooth finish's motion (D-151). Whole
 * pixels are what pixel art wants; the smooth plate is deliberately another
 * medium, and sub-pixel drift is part of what makes it read as one. The
 * clamp is identical: the overscan margin is a registration contract, not a
 * look.
 */
export function layerOffsetRaw(rate: number, camera: number): number {
  const raw = rate * camera;
  return Math.max(-DRIFT_MAX, Math.min(DRIFT_MAX, raw));
}

/**
 * Displacement strength per camera unit (D-151): the filter's x-scale is
 * `camera * DEPTH_SCALE`, so a full pointer sweep displaces the back plate's
 * far-vs-near extremes by roughly ±17px — felt, never violent, and still
 * inside the drift bound at the map's extremes.
 */
export const DEPTH_SCALE = 0.6;
