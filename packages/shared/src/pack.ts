/**
 * What an art pack has to provide before the app will use it.
 *
 * This exists so "where does the art come from" stops being a question about
 * taste and becomes a checklist: whether the frames are drawn by hand,
 * repaletted from a free pack, or commissioned, the deliverable is the same
 * and can be checked before anyone is paid or anything is merged.
 */

export interface PackProblem {
  level: 'error' | 'warning';
  message: string;
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
