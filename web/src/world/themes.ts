import type { Theme, ThemeKey } from '@agentlings/shared';
import { DB } from './palette';

// The palette a scene paints with. Defined in shared beside the format that
// names its slots — a second copy here would be a notion duplicated, and the
// two would drift the first time a slot was added.
export type { Theme };

export const THEMES: Record<ThemeKey, Theme> = {
  cave: {
    void: DB.ink,
    rock: DB.brown,
    rockLight: DB.tan,
    rockDark: DB.brownDark,
    rockEdge: DB.plum,
    accent: DB.bronze,
    accentLight: DB.tan,
    accentDark: DB.olive,
    grass: DB.lime,
    grassDark: DB.green,
    wood: DB.brown,
    woodDark: DB.brownDark,
    stoneDark: DB.plum,
    flame: DB.orange,
    flameCore: DB.yellow,
    hover: DB.white, // against brown rock
  },
  chalkboard: {
    void: DB.slateGreen,
    rock: DB.brownDark,
    rockLight: DB.brown,
    rockDark: DB.plum,
    rockEdge: DB.ink,
    accent: DB.paleBlue,
    accentLight: DB.white,
    accentDark: DB.steel,
    grass: DB.limeLight,
    grassDark: DB.lime,
    wood: DB.brown,
    woodDark: DB.brownDark,
    stoneDark: DB.plum,
    flame: DB.orange,
    flameCore: DB.yellow,
    hover: DB.yellow, // white is already this theme's accent
  },
  household: {
    void: DB.indigo,
    rock: DB.tan,
    rockLight: DB.sand,
    rockDark: DB.brown,
    rockEdge: DB.brownDark,
    accent: DB.paleBlue,
    accentLight: DB.white,
    accentDark: DB.steel,
    grass: DB.teal,
    grassDark: DB.green,
    wood: DB.brown,
    woodDark: DB.brownDark,
    stoneDark: DB.greyDeep,
    flame: DB.orange,
    flameCore: DB.yellow,
    hover: DB.rose, // the walls here are pale, so white would sink into them
  },
  marble: {
    void: DB.black,
    rock: DB.steel,
    rockLight: DB.paleBlue,
    rockDark: DB.grey,
    rockEdge: DB.greyDeep,
    accent: DB.bronze,
    accentLight: DB.yellow,
    accentDark: DB.olive,
    grass: DB.teal,
    grassDark: DB.green,
    wood: DB.brownDark,
    woodDark: DB.plum,
    stoneDark: DB.greyDark,
    flame: DB.orange,
    flameCore: DB.yellow,
    hover: DB.yellow, // against steel and pale blue
  },
};

export const THEME_LABELS: Record<ThemeKey, string> = {
  cave: 'Cave',
  chalkboard: 'Chalkboard',
  household: 'Household',
  marble: 'Marble & gold',
};
