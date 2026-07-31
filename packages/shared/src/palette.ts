/**
 * DB32 — the master palette the whole product draws from. It lives here
 * rather than in the renderer because it is a product decision, not a
 * drawing detail: themes, sprites, crew tints and any art dropped in from
 * outside all resolve to these 32 colours.
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

/** 0xRRGGBB → '#rrggbb', for canvas and CSS surfaces. */
export function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

const ENTRIES = Object.values(DB).map((color) => ({
  color,
  r: (color >> 16) & 0xff,
  g: (color >> 8) & 0xff,
  b: color & 0xff,
}));

/**
 * The closest palette entry to a colour, weighted for how the eye actually
 * works — green carries most of perceived brightness, blue least. Plain
 * Euclidean distance in RGB picks visibly wrong greys.
 */
export function nearestDb(r: number, g: number, b: number): number {
  let best = ENTRIES[0].color;
  let bestDistance = Infinity;
  for (const entry of ENTRIES) {
    const dr = r - entry.r;
    const dg = g - entry.g;
    const db = b - entry.b;
    const distance = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry.color;
    }
  }
  return best;
}

/**
 * Snaps RGBA pixels onto the palette in place. Art already drawn in DB32 is
 * unchanged, so this is safe to run over everything — which is what makes an
 * outside pack look like it belongs rather than like a graft.
 *
 * Fully transparent pixels are left alone; their colour is never seen and
 * snapping them would tint the edges of anything later scaled.
 */
export function snapToPalette(pixels: Uint8ClampedArray | Uint8Array): void {
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const snapped = nearestDb(pixels[i], pixels[i + 1], pixels[i + 2]);
    pixels[i] = (snapped >> 16) & 0xff;
    pixels[i + 1] = (snapped >> 8) & 0xff;
    pixels[i + 2] = snapped & 0xff;
  }
}
