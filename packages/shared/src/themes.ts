import type { ThemeKey } from './index';

/**
 * The four looks built into the app, as data — what a checker, the server and
 * the renderer all need in order to say "that name is taken".
 *
 * Its own leaf module rather than a line in index.ts, because `pack.ts` needs
 * it and index.ts imports `pack.ts`: putting it there would make the two
 * import each other. A constant with no dependencies of its own is exactly
 * what belongs at a leaf.
 *
 * The assertion keeps it honest: add a built-in theme and forget this, and the
 * project stops compiling rather than shipping a checker that lets a pack
 * quietly shadow it.
 */
export const BUILTIN_THEMES = [
  'cave',
  'chalkboard',
  'household',
  'marble',
] as const satisfies readonly ThemeKey[];

type MissingTheme = Exclude<ThemeKey, (typeof BUILTIN_THEMES)[number]>;
const _everyThemeListed: MissingTheme extends never ? true : MissingTheme = true;
void _everyThemeListed;
