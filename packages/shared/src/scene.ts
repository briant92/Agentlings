/**
 * The scene format: the shape of a level, as data, and the geometry it hangs
 * on.
 *
 * No drawing — that is `./draw`, which moved here from the renderer when the
 * browser stopped being the only thing that draws. Both live in shared rather
 * than in web because a level pack is a thing the server stores, a checker
 * validates, and a CLI renders, and none of those can import a browser bundle.
 */

// World geometry, in logical units the client scales to its canvas.
export const WORLD_WIDTH = 1000;
export const SPAWN_X = 80;
export const EXIT_X = 940;
export const STATION_BASE_X = 240;
export const STATION_SPACING = 130;
export const MAX_STATIONS = 5;

/**
 * How much wider than the view a *drifting* plate is, in world units (v2's
 * parallax, PRERENDER §3: "2–3 plates with 6% overscan"). A plate at exactly
 * the view width is pinned; one carrying this overscan drifts within it, so
 * its edges can never show. The margin each side is half of this, which is
 * also the hard bound on any drift the renderer may apply — and therefore the
 * clearance the checker demands around the crew under an occlusion strip.
 */
export const PLATE_OVERSCAN = 60;

/** How many plates a backdrop may stack — ~21 MB decoded at 2×, the checked budget. */
export const MAX_PLATES = 3;

/** An axis-aligned box in world units — hit zones and furniture footprints. */
export interface WorldBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The crew doorway beside the exit and the parcel stand beside it. One
 * source for the client (hit zone + drawn furniture) and the checker (an
 * occlusion strip may not cover either) — the same geometry drifting apart
 * across the two would give a prop that highlights somewhere other than
 * where it is clickable, or a checker blessing a strip that hides the door.
 */
export function doorBox(groundY: number): WorldBox {
  return { x: EXIT_X - 34, y: groundY - 58, w: 68, h: 58 };
}

/** The parcel stand — deliveries pile here. Ends where the doorway begins. */
export function parcelsBox(groundY: number): WorldBox {
  return { x: EXIT_X - 66, y: groundY - 44, w: 32, h: 44 };
}

/**
 * Per-theme palette, every slot drawn from the DB32 master ramp; geometry
 * stays identical across all four.
 */
export interface Theme {
  void: number;
  rock: number;
  rockLight: number;
  rockDark: number;
  rockEdge: number;
  accent: number;
  accentLight: number;
  accentDark: number;
  grass: number;
  grassDark: number;
  wood: number;
  woodDark: number;
  stoneDark: number;
  flame: number;
  flameCore: number;
  /**
   * The hover outline on anything clickable. Its own slot rather than a reuse
   * of `accentLight`, which is drawn from the same family as the rock in every
   * theme — cave's is DB.tan against DB.tan walls, so the outline half
   * vanished into the scenery it was meant to lift a sprite off. Chosen per
   * theme for contrast against that theme's rock.
   */
  hover: number;
}

/**
 * Every slot, as data — what a checker walks to see that a pack supplies the
 * whole palette rather than the half it happened to use.
 *
 * The assertion below is what stops this drifting from the interface above:
 * add a slot to `Theme` and forget it here, and the project stops compiling
 * rather than shipping a checker that quietly waves the omission through.
 */
export const THEME_SLOTS = [
  'void',
  'rock',
  'rockLight',
  'rockDark',
  'rockEdge',
  'accent',
  'accentLight',
  'accentDark',
  'grass',
  'grassDark',
  'wood',
  'woodDark',
  'stoneDark',
  'flame',
  'flameCore',
  'hover',
] as const satisfies readonly (keyof Theme)[];

type MissingSlot = Exclude<keyof Theme, (typeof THEME_SLOTS)[number]>;
const _everySlotListed: MissingSlot extends never ? true : MissingSlot = true;
void _everySlotListed;

/**
 * Terrain as data.
 *
 * The world's shape used to be a hundred lines of Pixi calls that drew a cave
 * whatever the theme said, so a level about household chores rendered
 * stalactites in beige. This is the format that replaces it, and the design
 * decision worth naming is what it is *not*: it is not a drawing language.
 *
 * A format general enough to express seeded speckle, mineral veins and a
 * jagged ceiling by composing primitives grows into a small programming
 * language, which is unauthorable and untestable. So the vocabulary is a set
 * of parameterised *idioms* — the shapes terrain art is actually made of —
 * plus three plain primitives for everything else. A pack retunes an idiom or
 * leaves it out; it does not write code.
 */

/** Fixed points a scene can hang coordinates on. */
export interface Anchors {
  worldWidth: number;
  viewH: number;
  groundY: number;
  spawnX: number;
  exitX: number;
}

/**
 * A number, or an anchor with an optional offset: `"groundY-40"`.
 *
 * A string form rather than nested objects because scenes are written by
 * hand, and `"groundY-40"` is readable where `{anchor:'groundY',offset:-40}`
 * is a wall. One regex parses it; it is not an expression evaluator.
 */
export type Coord = number | string;

const COORD_RE = /^([a-zA-Z]+)\s*(?:([+-])\s*(\d+(?:\.\d+)?))?$/;

export function resolveCoord(value: Coord, anchors: Anchors): number {
  if (typeof value === 'number') return value;
  const match = COORD_RE.exec(value.trim());
  if (!match) throw new Error(`bad coordinate "${value}"`);
  const [, name, sign, amount] = match;
  if (!(name in anchors)) throw new Error(`unknown anchor "${name}"`);
  const base = anchors[name as keyof Anchors];
  if (!sign) return base;
  return sign === '-' ? base - Number(amount) : base + Number(amount);
}

/** A colour is a theme slot name, so a scene never hard-codes a palette. */
export type Paint = keyof Theme;

export interface Fill {
  color: Paint;
  alpha?: number;
}

/**
 * The one place a scene's colour name becomes a number.
 *
 * Every caller that resolves a slot goes through here, so an unknown name
 * fails the same way everywhere rather than reaching a surface as `undefined`
 * and painting black.
 */
export function paintOf(theme: Theme, name: Paint): number {
  const value = theme[name];
  if (typeof value !== 'number') throw new Error(`unknown colour "${String(name)}"`);
  return value;
}

interface Box {
  x: Coord;
  y: Coord;
  w: Coord;
  h: Coord;
}

export type SceneOp =
  /** Primitives. */
  | ({ op: 'rect' } & Box & Fill)
  | ({ op: 'circle'; x: Coord; y: Coord; r: number } & Fill)
  | ({ op: 'poly'; points: [Coord, Coord][] } & Fill)
  /** Draw the child ops once per x offset — pillars, torches, slats. */
  | { op: 'repeat'; at: Coord[]; of: SceneOp[] }
  /** Draw the child ops at a regular step — banding, dithered rows. */
  | { op: 'band'; axis?: 'x' | 'y'; from: Coord; to: Coord; step: number; of: SceneOp[] }
  /** Seeded flecks of light and dark: the grain of a surface. */
  | ({ op: 'speckle'; count: number; light: Paint; dark: Paint } & Box)
  /** Seeded stepped cracks running through a surface. */
  | ({ op: 'veins'; count: number } & Box & Fill)
  /** Seeded upright tufts along a line — grass, bristles, dust. */
  | ({ op: 'tufts'; count: number; height: number; alt?: Paint } & Box & Fill)
  /**
   * The lid of the world: a jagged (or flat) edge, the mass above it, a
   * drawn edge line, and optional things hanging from the low points.
   */
  | {
      op: 'ceiling';
      step: number;
      minY: Coord;
      maxY: Coord;
      /** Held flat near an anchor, so the entrance is never buried. */
      flatNear?: { at: Coord; within: number; y: Coord };
      fill: Paint;
      edge: Paint;
      hang?: {
        /** Left alone near these anchors, so doorways stay clear. */
        clearOf?: { at: Coord; within: number }[];
        spike?: { chance: number; below: Coord; color: Paint; tip: Paint };
        vine?: { chance: number; min: number; max: number; color: Paint; tip: Paint };
      };
    };

/**
 * Every op name, as data — what the checker holds a pack's `op` fields to
 * (D-147). The Strait shipped a floor written as `"kind": "rect"`: every
 * colour resolved, every coordinate parsed, and the renderer's switch
 * matched nothing and silently drew nothing, through four paid legs and an
 * Approve. The assertion is THEME_SLOTS' trick: add an op to the union and
 * forget it here, and the project stops compiling.
 */
export const OP_NAMES = [
  'rect',
  'circle',
  'poly',
  'repeat',
  'band',
  'speckle',
  'veins',
  'tufts',
  'ceiling',
] as const satisfies readonly SceneOp['op'][];

type MissingOp = Exclude<SceneOp['op'], (typeof OP_NAMES)[number]>;
const _everyOpListed: MissingOp extends never ? true : MissingOp = true;
void _everyOpListed;

/**
 * Idle life over the painting, in the same spirit as the ops: parameterised
 * idioms, not a language. Each one is a small looping effect the renderer
 * knows how to run; a scene says which it wants and where they hang. They are
 * live-only — a thumbnail is a snapshot, and a snapshot of dust is a stain.
 */
export type AmbientOp =
  /** Water gathering and falling from the stalactite tips the draw reported. */
  | { fx: 'drips' }
  /** A small winged silhouette crossing the open air, rarely. */
  | { fx: 'flyer' }
  /** Slow dust drifting down through a region. */
  | ({ fx: 'motes'; count: number } & { x: Coord; y: Coord; w: Coord; h: Coord })
  /** A slanted shaft of light with dust drifting inside it. */
  | {
      fx: 'beam';
      topLeft: Coord;
      topRight: Coord;
      topY: Coord;
      botLeft: Coord;
      botRight: Coord;
      botY: Coord;
      count: number;
    }
  /** Sparkles on gilding: named points, plus random spots along strips. */
  | { fx: 'glints'; points: [Coord, Coord][]; strips: { x: Coord; y: Coord; w: Coord }[] }
  /** Live clock hands over a painted face, telling the actual time. */
  | { fx: 'clock'; x: Coord; y: Coord; r: number }
  /**
   * Plate life (v2): a small raster tile scroll-looping inside a region of
   * the view — a waterfall, drifting cloud, running water. `file` is a PNG
   * beside pack.json like a plate (cut-outs welcome, its colours count
   * against the backdrop budget); `dx`/`dy` are pixels per second, whole-pixel
   * stepped at draw time. Drawn directly over the plates, under every op and
   * the scrim; live-only like the rest of the ambient vocabulary.
   */
  | ({ fx: 'plateloop'; file: string; dx: number; dy: number } & {
      x: Coord;
      y: Coord;
      w: Coord;
      h: Coord;
    });

/** Every ambient name, for the same checker and the same reason (D-147). */
export const FX_NAMES = [
  'drips',
  'flyer',
  'motes',
  'beam',
  'glints',
  'clock',
  'plateloop',
] as const satisfies readonly AmbientOp['fx'][];

type MissingFx = Exclude<AmbientOp['fx'], (typeof FX_NAMES)[number]>;
const _everyFxListed: MissingFx extends never ? true : MissingFx = true;
void _everyFxListed;

/**
 * The band that holds a backdrop away from the crew.
 *
 * Drawn as stacked bands of increasing alpha rather than as a gradient,
 * because `Surface` has three primitives and a gradient would be a fourth
 * that every implementation — Pixi, the thumbnail canvas, the test recorder —
 * would have to grow. Banding is also what pixel art does anyway.
 *
 * It reaches `alpha` at the ground line and holds it below, so the strength
 * is stated where it matters: the row the crew actually stand on.
 *
 * Worth knowing what this is and is not for. Measured across two backdrops,
 * a scrim reliably helps only when the backdrop is darker than the crew; on a
 * bright ground it drags the picture *through* the mid-tones the gowns live
 * in and can bury a sprite outright (D-107). Legibility is the sprite rim's
 * job. This is for depth.
 */
export interface Scrim {
  color: Paint;
  /** Strength at the ground line. The ramp starts from nothing. */
  alpha: number;
  /** Where the ramp begins — above this the backdrop is untouched. */
  from: Coord;
  /** How many bands the ramp is cut into. */
  steps?: number;
}

/**
 * What sits behind the level: the painting the foreground stands in front of.
 *
 * Separate from `ops` rather than merged with them because the scrim has to
 * land *between* the two, and because a backdrop is the layer that carries
 * its own palette (D-108) while the foreground stays on DB32.
 */
export interface Backdrop {
  /**
   * The pre-rendered picture, as raster files beside pack.json (D-108,
   * D-142), back to front — up to MAX_PLATES of them since v2. Drawn beneath
   * everything: plates, then `ops`, then the scrim, then the foreground.
   *
   * Not an op, deliberately: `Surface` has three primitives and a raster is
   * not one, so each consumer composites the plates *before* walking
   * `drawScene` rather than every surface growing an image method.
   *
   * The file rules are D-108's, made checkable: a plain .png name; width
   * 1000 or, for a plate that drifts, 1000+PLATE_OVERSCAN (either at 2×);
   * height exactly viewH at its scale. The first plate is the picture and
   * must be fully opaque; every plate above it is a cut-out — binary alpha,
   * with at least one hole. The 128-colour budget is the *layer's*: one
   * palette across every raster file the pack carries. `rim` is required the
   * moment any raster rides — the one device that survives standing in front
   * of a picture.
   */
  plates?: string[];
  /**
   * The occlusion strip (v2): a cut-out drawn *above* the crew, near the
   * screen edges — the strongest depth cue a fixed camera has (the RE mask
   * trick). Same file rules as an upper plate, plus two of its own: opaque
   * pixels may live only clear of the signpost span, and never over a place
   * the crew stand still (their boxes, widened by the drift margin). It
   * drifts opposite the backdrop when sized with overscan.
   */
  occlusion?: string;
  /**
   * The finish (D-151, amending D-108's quantized-only): absent means
   * quantized — the DKC lineage, 128 colours, drawn inside the pixel canvas.
   * `'smooth'` is the HD-2D contrast: plates leave the canvas entirely and
   * render as native-resolution DOM images under (and, for the strip, over)
   * a transparent world canvas — soft alpha welcome, no colour budget, the
   * drift unrounded. It reads as intentional exactly because the two media
   * stay distinct: the crew keep their rigid pixel grid, the picture behind
   * them is another medium.
   */
  finish?: 'smooth';
  /**
   * Continuous micro-depth from one image (D-151): a grayscale map beside
   * pack.json, exactly the back plate's size, displacing it under the
   * pointer. Data, not picture — never counted against the colour budget.
   * Quantized finish only: the smooth finish carries depth as real layers,
   * and honestly stated, displacement smears at hard silhouettes — prefer a
   * cut-out plate wherever an edge matters.
   */
  depthMap?: string;
  ops?: SceneOp[];
  scrim?: Scrim;
}

export interface Scene {
  /** Named so a pack can say what it is, and the app can show it. */
  name: string;
  /**
   * How tall the world is, and where the ground line sits inside it.
   *
   * These were constants in the renderer, which meant every level was 320
   * pixels tall whatever it was a picture of. A scene that wants air above
   * its ground — sky, a ceiling far overhead, a painted backdrop — has to be
   * able to say so itself, and only the scene knows how much it needs.
   *
   * Only y lives here. The server sim carries x and nothing else, so vertical
   * layout is wholly the client's business; that is what keeps this a local
   * change rather than a migration.
   */
  viewH: number;
  groundY: number;
  /** Behind everything, with the scrim over it. Omitted, there is no painting. */
  backdrop?: Backdrop;
  /**
   * A permanent one-pixel outline around the crew, in this slot's colour.
   *
   * The legibility device, and the reason it is this rather than the scrim.
   * Measured across two backdrops (D-107): a scrim separates sprite from
   * ground by *value*, so it only works while the ground stays on one side of
   * the crew's own luminance. On bright sand it drags the picture through the
   * mid-tones the gowns occupy and buried one agentling completely — its
   * separation fell from 20.9 to 0.3. An outline separates by *contour*, which
   * does not care what is behind it.
   *
   * Opt-in, because the built-in scenes were composed against untouched art
   * and do not need it. Any pack carrying a backdrop should set it.
   */
  rim?: Paint;
  ops: SceneOp[];
  /** Idle life over the painting; omitted, a scene simply holds still. */
  ambient?: AmbientOp[];
}


/**
 * What the draw noticed on the way: positions only the seeded geometry knows,
 * reported so the ambient effects can hang on the same picture the player
 * sees rather than on a guess at it.
 */
export interface SceneMarks {
  /** Bottom-centre of each stalactite the ceiling hung. */
  spikeTips: [number, number][];
}
