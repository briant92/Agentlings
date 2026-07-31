import type { ThemeKey } from '@agentlings/shared';
import type { Scene } from '../scene';
import { CAVE } from './cave';
import { CHALKBOARD } from './chalkboard';
import { HOUSEHOLD } from './household';
import { MARBLE } from './marble';

/**
 * Which scene each theme is set in.
 *
 * A theme used to be fifteen colours and nothing else, so every level was the
 * same cave repainted. A theme names a place as well as a palette, and all
 * four now have one of their own.
 */
export const SCENES: Record<ThemeKey, Scene> = {
  cave: CAVE,
  household: HOUSEHOLD,
  chalkboard: CHALKBOARD,
  marble: MARBLE,
};
