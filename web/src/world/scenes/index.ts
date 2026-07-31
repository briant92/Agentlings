import type { ThemeKey } from '@agentlings/shared';
import type { Scene } from '../scene';
import { CAVE } from './cave';
import { HOUSEHOLD } from './household';

/**
 * Which scene each theme is set in.
 *
 * A theme used to be fifteen colours and nothing else, so every level was the
 * same cave repainted. A theme now names a place as well as a palette.
 *
 * chalkboard and marble still point at the cave: their scenes are not written
 * yet, and pointing them somewhere honest is better than half-authoring two
 * more rooms. They render exactly as they always did until someone writes
 * them, which is now a data file rather than a rewrite.
 */
export const SCENES: Record<ThemeKey, Scene> = {
  cave: CAVE,
  household: HOUSEHOLD,
  chalkboard: CAVE,
  marble: CAVE,
};
