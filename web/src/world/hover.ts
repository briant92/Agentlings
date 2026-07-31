import { EXIT_X, STATION_BASE_X, STATION_SPACING } from '@agentlings/shared';

/**
 * What is clickable in the world, and where.
 *
 * The geometry lives here rather than inline in the renderer because each box
 * is used twice — once to draw the outline and once to catch the pointer —
 * and the two silently drifting apart gives you a prop that highlights
 * somewhere other than where it is clickable. Being plain arithmetic, it is
 * also the part worth testing without standing up a renderer.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the pointer is over. Null when it is over scenery, which is most of it. */
export type HoverTarget =
  | { kind: 'agentling'; id: string }
  | { kind: 'door' }
  | { kind: 'station'; slot: number }
  | null;

/**
 * The eight neighbours of a pixel. Four would be cheaper and leaves gaps on
 * every diagonal of this art — the hair and the hem come apart — so the ring
 * is drawn from all eight.
 */
export const OUTLINE_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/**
 * The doorway the crew leave and come back through, which opens the crew
 * panel. Until now this was a hit rectangle over scenery with no visual
 * feedback of any kind — the only way to discover it was to click the wall
 * and find out.
 */
export function doorBox(groundY: number): Box {
  return { x: EXIT_X - 34, y: groundY - 58, w: 68, h: 58 };
}

/**
 * A work station's signpost: post, board and pennant. Slots are fixed, so the
 * boxes can be built once rather than rebuilt as jobs come and go.
 */
export function stationBox(slot: number, groundY: number): Box {
  const x = STATION_BASE_X + slot * STATION_SPACING;
  return { x: x - 12, y: groundY - 53, w: 28, h: 53 };
}
