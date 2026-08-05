/**
 * Where a speech bubble stands over the world (D-084). The canvas draws at
 * WORLD_WIDTH×VIEW_H logical pixels and is scaled uniformly by CSS width, so
 * a world point maps to the page with one scale factor and the canvas's own
 * rect — no letterbox, since the canvas fills its frame edge to edge.
 *
 * Pure on purpose: the mapping is the part worth testing, and the part that
 * silently breaks when someone changes how the canvas is sized.
 */

/** A live anchor query the world publishes; null while it cannot answer. */
export type AnchorFn = (agentlingId: string) => { x: number; y: number } | null;

/** A world point (sprite head-top) in page coordinates. */
export function anchorPoint(
  worldX: number,
  worldY: number,
  rect: { left: number; top: number; width: number },
  worldWidth: number,
): { x: number; y: number } {
  const scale = rect.width / worldWidth;
  return { x: rect.left + worldX * scale, y: rect.top + worldY * scale };
}

/**
 * Keeps the bubble's box on screen while its tail keeps pointing at the
 * head: the returned centre is clamped, and the caller offsets the tail by
 * the difference. A viewport too narrow for the margins pins to the left
 * margin rather than oscillating between impossible bounds.
 */
export function clampBubbleX(
  anchorX: number,
  boxWidth: number,
  viewportWidth: number,
  margin = 8,
): number {
  const half = boxWidth / 2;
  const min = margin + half;
  const max = Math.max(viewportWidth - margin - half, min);
  return Math.min(Math.max(anchorX, min), max);
}
