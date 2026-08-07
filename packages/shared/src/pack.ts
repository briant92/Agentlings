/**
 * What an art pack has to provide before the app will use it.
 *
 * This exists so "where does the art come from" stops being a question about
 * taste and becomes a checklist: whether the frames are drawn by hand,
 * repaletted from a free pack, or commissioned, the deliverable is the same
 * and can be checked before anyone is paid or anything is merged.
 */

import {
  resolveCoord,
  THEME_SLOTS,
  type Anchors,
  type Backdrop,
  type Scene,
  type Theme,
} from './scene';

export interface PackProblem {
  level: 'error' | 'warning';
  message: string;
}

/**
 * A level pack: a whole world as data, plus where it came from.
 *
 * It extends `Scene` rather than restating it, so a pack cannot describe
 * something the renderer would refuse to draw — the format is the contract.
 * The two additions are the palette, which a built-in level gets from the app
 * and a pack has to bring, and provenance.
 */
export interface LevelPack extends Scene {
  /**
   * Where this came from and under what terms.
   *
   * Required, not a nicety. A pack lands in this repository, so its licence
   * becomes this project's problem, and "free" routinely still means
   * attribution-required or redistribution-forbidden — which committing it
   * here is. A checker that lets provenance be optional is a checker that
   * makes the omission invisible.
   */
  provenance: string;
  theme: Theme;
}

/**
 * A pack a run is offering for review, and the folder name it wants to be
 * installed under. The slug is identity: it is what a level stores.
 */
export interface PackDraft {
  slug: string;
  pack: LevelPack;
}

/**
 * Only the names matter here — the checker asks whether a coordinate *parses*
 * and names a real anchor, not where it lands.
 */
const PROBE: Anchors = { worldWidth: 1000, viewH: 320, groundY: 258, spawnX: 80, exitX: 940 };

/**
 * Keys whose value is a theme slot, and keys whose value is a coordinate.
 *
 * The walk is driven by these rather than by the op union, so a nested colour
 * inside a `repeat` inside a `band` is checked by the same three lines as a
 * top-level one, and an op added later is covered without touching this. Keep
 * them in step with the `Paint`- and `Coord`-typed fields in `SceneOp`,
 * `AmbientOp` and `Scrim`.
 */
const PAINT_KEYS = new Set(['color', 'light', 'dark', 'alt', 'fill', 'edge', 'tip', 'rim']);
const COORD_KEYS = new Set([
  'x', 'y', 'w', 'h', 'at', 'from', 'to',
  'minY', 'maxY', 'below',
  'topLeft', 'topRight', 'topY', 'botLeft', 'botRight', 'botY',
]);

type Report = (message: string) => void;

function checkCoord(value: unknown, at: string, fail: Report): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${at} is not a finite number`);
    return;
  }
  if (typeof value !== 'string') {
    fail(`${at} must be a number or an anchor like "groundY-40"`);
    return;
  }
  // The renderer's own parser, so the checker and the draw cannot disagree
  // about what is a legal coordinate.
  try {
    resolveCoord(value, PROBE);
  } catch (error) {
    fail(`${at}: ${(error as Error).message}`);
  }
}

function walk(node: unknown, path: string, theme: Record<string, unknown>, fail: Report): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${path}[${i}]`, theme, fail));
    return;
  }
  if (!node || typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const at = path ? `${path}.${key}` : key;

    if (PAINT_KEYS.has(key) && typeof value === 'string') {
      if (typeof theme[value] !== 'number') {
        fail(`${at} paints with "${value}", which this pack's theme does not define`);
      }
      continue;
    }
    if (key === 'points' && Array.isArray(value)) {
      value.forEach((pair, i) => {
        if (!Array.isArray(pair) || pair.length !== 2) {
          fail(`${at}[${i}] must be an [x, y] pair`);
          return;
        }
        pair.forEach((coord, j) => checkCoord(coord, `${at}[${i}][${j}]`, fail));
      });
      continue;
    }
    if (COORD_KEYS.has(key)) {
      if (Array.isArray(value)) {
        value.forEach((coord, i) => checkCoord(coord, `${at}[${i}]`, fail));
      } else {
        checkCoord(value, at, fail);
      }
      continue;
    }
    walk(value, at, theme, fail);
  }
}

/**
 * The tallest thing the renderer draws above the ground line: the doorway,
 * which `hover.ts` places at `groundY - 58`. A pack with a shallower ground
 * line draws its own exit off the top of the world.
 */
const HEADROOM = 58;

/**
 * Checks a level pack before it is installed.
 *
 * The structural half is ordinary. The half worth having is the walk: an
 * unknown colour name reaches the renderer as a throw at draw time, which
 * surfaces as a level that will not open with a stack trace behind it. Here it
 * is a line naming the op and the slot, before anything is installed.
 */
export function validateLevelPack(pack: unknown): PackProblem[] {
  const problems: PackProblem[] = [];
  const fail = (message: string) => problems.push({ level: 'error', message });
  const warn = (message: string) => problems.push({ level: 'warning', message });

  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    return [{ level: 'error', message: 'the pack is not a JSON object' }];
  }
  const data = pack as Partial<LevelPack> & Record<string, unknown>;

  for (const field of ['name', 'provenance'] as const) {
    if (typeof data[field] !== 'string' || data[field].trim() === '') {
      fail(`${field} must be a non-empty string`);
    }
  }

  const theme = data.theme;
  if (!theme || typeof theme !== 'object') {
    fail('theme is missing — a pack brings its own palette');
  } else {
    const slots = theme as unknown as Record<string, unknown>;
    for (const slot of THEME_SLOTS) {
      const value = slots[slot];
      if (typeof value !== 'number') {
        fail(`theme.${slot} is missing; a pack must define every slot the renderer asks for`);
      } else if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
        fail(`theme.${slot} must be a colour between 0x000000 and 0xffffff`);
      }
    }
    const extra = Object.keys(slots).filter((k) => !(THEME_SLOTS as readonly string[]).includes(k));
    if (extra.length > 0) {
      warn(`theme defines ${extra.length} slot(s) nothing draws with: ${extra.join(', ')}`);
    }
  }

  const { viewH, groundY } = data;
  if (typeof viewH !== 'number' || !Number.isFinite(viewH) || viewH <= 0) {
    fail('viewH must be a positive number — how tall the world is');
  }
  if (typeof groundY !== 'number' || !Number.isFinite(groundY) || groundY <= 0) {
    fail('groundY must be a positive number — where the crew stand');
  }
  if (typeof viewH === 'number' && typeof groundY === 'number') {
    if (groundY >= viewH) fail(`groundY ${groundY} must sit above viewH ${viewH}`);
    if (groundY < HEADROOM) {
      fail(`groundY ${groundY} leaves no headroom; the doorway alone needs ${HEADROOM}`);
    }
    if (viewH - groundY < 10) {
      warn(`only ${viewH - groundY}px below the ground line — the floor will read as a hairline`);
    }
  }

  if (!Array.isArray(data.ops) || data.ops.length === 0) {
    fail('ops is missing or empty — a pack with no foreground draws nothing');
  }

  // Colours and coordinates, everywhere they appear. Skips `theme` itself,
  // whose keys are slot names rather than references to them.
  const slots = (theme ?? {}) as unknown as Record<string, unknown>;
  for (const [key, node] of Object.entries({
    ops: data.ops,
    backdrop: data.backdrop as Backdrop | undefined,
    ambient: data.ambient,
    rim: data.rim,
  })) {
    if (node === undefined) continue;
    if (key === 'rim') {
      if (typeof node === 'string' && typeof slots[node] !== 'number') {
        fail(`rim paints with "${node}", which this pack's theme does not define`);
      }
      continue;
    }
    walk(node, key, slots, fail);
  }

  return problems;
}

export interface PackExpectations {
  /** Animation cycles the app will ask for by name. */
  cycles: string[];
  /** The size our own art uses; a different one is allowed, not required. */
  frameWidth: number;
  frameHeight: number;
}

/** The agentling pack: three cycles, at the size the built-in art uses. */
export const AGENTLING_PACK: PackExpectations = {
  cycles: ['walk', 'work', 'deliver'],
  frameWidth: 18,
  frameHeight: 20,
};

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function isRect(value: unknown): value is FrameRect {
  const rect = value as FrameRect | undefined;
  return (
    !!rect &&
    ['x', 'y', 'w', 'h'].every((key) => typeof (rect as unknown as Record<string, unknown>)[key] === 'number')
  );
}

/**
 * Checks a pack's atlas. Errors mean the app would misbehave; warnings mean
 * it will work but something is probably not what the author intended.
 */
export function validatePack(atlas: unknown, expect: PackExpectations): PackProblem[] {
  const problems: PackProblem[] = [];
  const fail = (message: string) => problems.push({ level: 'error', message });
  const warn = (message: string) => problems.push({ level: 'warning', message });

  if (!atlas || typeof atlas !== 'object') {
    return [{ level: 'error', message: 'the atlas is not a JSON object' }];
  }
  const data = atlas as {
    frames?: Record<string, { frame?: unknown }>;
    animations?: Record<string, unknown>;
    meta?: { image?: unknown; size?: { w?: unknown; h?: unknown } };
  };

  const frames = data.frames;
  if (!frames || typeof frames !== 'object' || Object.keys(frames).length === 0) {
    fail('no frames — the atlas needs a "frames" object naming each one');
    return problems;
  }
  if (typeof data.meta?.image !== 'string') {
    fail('meta.image must name the PNG file sitting beside the atlas');
  }

  const sheetW = data.meta?.size?.w;
  const sheetH = data.meta?.size?.h;
  const haveSheetSize = typeof sheetW === 'number' && typeof sheetH === 'number';
  if (!haveSheetSize) warn('meta.size is missing, so frames cannot be checked against the sheet');

  // Every frame must be a rectangle, and they must all be the same shape:
  // the world anchors sprites by their feet and a ragged pack would jitter.
  let first: FrameRect | null = null;
  for (const [name, entry] of Object.entries(frames)) {
    const rect = entry?.frame;
    if (!isRect(rect)) {
      fail(`frame "${name}" needs a frame rectangle with x, y, w and h`);
      continue;
    }
    if (!first) first = rect;
    else if (rect.w !== first.w || rect.h !== first.h) {
      fail(`frame "${name}" is ${rect.w}x${rect.h}; every frame must be ${first.w}x${first.h}`);
    }
    if (haveSheetSize && (rect.x + rect.w > (sheetW as number) || rect.y + rect.h > (sheetH as number))) {
      fail(`frame "${name}" falls outside the ${String(sheetW)}x${String(sheetH)} sheet`);
    }
  }

  if (first && (first.w !== expect.frameWidth || first.h !== expect.frameHeight)) {
    warn(
      `frames are ${first.w}x${first.h}; the built-in art is ${expect.frameWidth}x${expect.frameHeight}. ` +
        'That is allowed — the world scales to the frame height — but check it sits right.',
    );
  }

  const animations = data.animations;
  if (!animations || typeof animations !== 'object') {
    fail('no animations — cycles must name their frames, since frames get reused');
    return problems;
  }
  for (const cycle of expect.cycles) {
    const named = (animations as Record<string, unknown>)[cycle];
    if (!Array.isArray(named) || named.length === 0) {
      fail(`cycle "${cycle}" is missing; the app asks for ${expect.cycles.join(', ')}`);
      continue;
    }
    for (const frameName of named) {
      if (typeof frameName !== 'string' || !(frameName in frames)) {
        fail(`cycle "${cycle}" refers to "${String(frameName)}", which is not a frame`);
      }
    }
  }

  const used = new Set(
    Object.values(animations)
      .flatMap((names) => (Array.isArray(names) ? names : []))
      .filter((name): name is string => typeof name === 'string'),
  );
  const unused = Object.keys(frames).filter((name) => !used.has(name));
  if (unused.length > 0) {
    warn(`${unused.length} frame(s) never used by a cycle: ${unused.slice(0, 5).join(', ')}`);
  }

  return problems;
}
