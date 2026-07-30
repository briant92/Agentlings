/**
 * DB32 — the master palette every theme, sprite and pixel-art surface draws
 * from. Constraining all four themes to one 32-colour ramp is what makes the
 * levels read as one game instead of four unrelated colour schemes.
 *
 * DawnBringer's 32-colour palette (2012), a de-facto standard for pixel art.
 */
export const DB = {
  black: 0x000000,
  ink: 0x222034,
  plum: 0x45283c,
  brownDark: 0x663931,
  brown: 0x8f563b,
  orange: 0xdf7126,
  tan: 0xd9a066,
  sand: 0xeec39a,
  yellow: 0xfbf236,
  limeLight: 0x99e550,
  lime: 0x6abe30,
  teal: 0x37946e,
  green: 0x4b692f,
  olive: 0x524b24,
  slateGreen: 0x323c39,
  indigo: 0x3f3f74,
  blueDeep: 0x306082,
  blue: 0x5b6ee1,
  sky: 0x639bff,
  cyan: 0x5fcde4,
  paleBlue: 0xcbdbfc,
  white: 0xffffff,
  steel: 0x9badb7,
  grey: 0x847e87,
  greyDark: 0x696a6a,
  greyDeep: 0x595652,
  purple: 0x76428a,
  red: 0xac3232,
  rose: 0xd95763,
  pink: 0xd77bba,
  moss: 0x8f974a,
  bronze: 0x8a6f30,
} as const;

export type DbColor = (typeof DB)[keyof typeof DB];

/** 0xRRGGBB → '#rrggbb', for canvas/CSS surfaces. */
export function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
