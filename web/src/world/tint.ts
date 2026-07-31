import { DB, nearestDb } from './palette';

/**
 * Per-agentling colour, applied to the art itself.
 *
 * Until now every agentling was drawn identically and only the hover label
 * carried their colour, so telling five of them apart in the world meant
 * hovering each one in turn. The gown is the identity channel: it is the
 * largest flat area on the sprite, so it still reads at portrait size in the
 * crew rail, and leaving the hair and skin alone keeps the crew looking like
 * one crew rather than a set of unrelated characters.
 *
 * One definition, used by both art paths — the built-in frames swap palette
 * entries by key, the baked spritesheet swaps pixels by value. A sprite tinted
 * one way in the world and another in the rail would be worse than no tint at
 * all, since the whole point is recognising someone at a glance.
 */

/** The gown entries in the built-in art: 'b' and 'B' in agentling.source.json. */
export const GOWN_LIGHT = DB.blue;
export const GOWN_DARK = DB.indigo;

/** How much darker the shaded half of the gown sits than the lit half. */
const SHADE = 0.55;

function rgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

/**
 * The shaded companion to a tint, snapped back onto DB32.
 *
 * Snapping matters rather than being ceremony: scaling a colour down lands
 * between palette entries, and an off-ramp colour on a sprite is exactly what
 * `snapToPalette` exists to stop an outside art pack doing.
 */
export function shadeOf(color: number): number {
  const [r, g, b] = rgb(color);
  return nearestDb(r * SHADE, g * SHADE, b * SHADE);
}

/**
 * The two replacement colours for one agentling.
 *
 * The tint is snapped too. New crew are handed colours straight off the ramp,
 * but the four original HQ agentlings predate that and hold colours that were
 * never DB32 — tinting with one unsnapped would put a colour on a sprite that
 * exists nowhere else in the product.
 */
export function gownFor(tint: number): { light: number; dark: number } {
  const [r, g, b] = rgb(tint);
  const light = nearestDb(r, g, b);
  return { light, dark: shadeOf(light) };
}

/**
 * Paints every visible pixel one colour, in place — the sprite's shape with
 * its detail thrown away.
 *
 * This is what makes a hover outline crisp. Drawing offset copies of the
 * ordinary frames and tinting them multiplies each pixel by the tint, so the
 * dark outline pixels stay dark and the result reads as a smeared ghost
 * rather than as an edge. A flat shape offset in eight directions reads as a
 * one-pixel ring, which is the whole idea.
 */
export function flatten(pixels: Uint8ClampedArray | Uint8Array, color: number): void {
  const [r, g, b] = rgb(color);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  }
}

/**
 * Swaps the gown colours in RGBA pixel data, in place.
 *
 * Matches on the exact source colours, which is what makes this safe to run
 * over any sheet: our own is generated from the same frame definitions, so the
 * gown is exactly these two values, and a pack from outside that happens not
 * to use them is simply left alone rather than corrupted. An untinted pack is
 * a limitation worth having; a pack with its highlights eaten is not.
 */
export function recolourGown(pixels: Uint8ClampedArray | Uint8Array, tint: number): void {
  const { light, dark } = gownFor(tint);
  const [lr, lg, lb] = rgb(GOWN_LIGHT);
  const [dr, dg, db] = rgb(GOWN_DARK);
  const [nlr, nlg, nlb] = rgb(light);
  const [ndr, ndg, ndb] = rgb(dark);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    if (pixels[i] === lr && pixels[i + 1] === lg && pixels[i + 2] === lb) {
      pixels[i] = nlr;
      pixels[i + 1] = nlg;
      pixels[i + 2] = nlb;
    } else if (pixels[i] === dr && pixels[i + 1] === dg && pixels[i + 2] === db) {
      pixels[i] = ndr;
      pixels[i + 1] = ndg;
      pixels[i + 2] = ndb;
    }
  }
}
