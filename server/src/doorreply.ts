/**
 * What a written-here door says back, and how big it may be.
 *
 * Two adapters this repo owns now answer a model directly — Buk (D-266) and
 * the SII register (D-267) — and both had to solve the same two problems: how
 * much of a far end's own words to quote in a refusal, and what to do when a
 * reply is larger than a context. The second one was solved twice, in two
 * files, down to the same binary search and the same comment above it. D-030
 * is the rule that says the second copy is the mistake: *duplicating one
 * notion and collapsing two that only sound alike are the same mistake — call
 * the shared function.* This is that function, extracted when the second door
 * arrived rather than when a third would have copied it again.
 *
 * The ceiling and the wording stay with each door, because they are that
 * door's own claims about its own data; what is shared is the mechanism.
 */

/** How much of a far end's own words a refusal quotes. */
export const CLIP_CHARS = 300;

/**
 * As much of a system's own words as a person would read, and no more.
 *
 * Kept beside our sentence rather than replacing it: the far end knows things
 * about its own refusal that we do not, and a reader who can see both can act
 * on whichever is the real one.
 */
export function clip(body: string, chars: number = CLIP_CHARS): string {
  const trimmed = body.trim();
  return trimmed.length > chars ? `${trimmed.slice(0, chars)}…` : trimmed;
}

/** Where the records live inside a reply envelope, as a path of keys. */
export type RowsPath = readonly string[];

function rowsAt(envelope: unknown, path: RowsPath): unknown[] | null {
  let here: unknown = envelope;
  for (const key of path) {
    if (!here || typeof here !== 'object') return null;
    here = (here as Record<string, unknown>)[key];
  }
  return Array.isArray(here) ? here : null;
}

function withRows(envelope: unknown, path: RowsPath, rows: unknown[]): unknown {
  if (path.length === 0) return rows;
  const [key, ...rest] = path;
  const parent = envelope as Record<string, unknown>;
  return { ...parent, [key]: withRows(parent[key], rest, rows) };
}

/**
 * A reply as text, under a ceiling, dropping **whole records**.
 *
 * A reply cut mid-record is invalid JSON, and one quietly shortened is worse
 * than both, because the reader believes it has the set. So records are
 * dropped whole and the loss is always stated by `note`.
 *
 * When the records cannot be found at `path` — a shape the far end did not
 * document, or an envelope with no list in it — the reply is handed over
 * **whole and over the ceiling**, with `untrimmable` said in its place. That
 * is deliberate: the alternative is a silent cut, and a door that cannot bound
 * a reply should say so rather than pretend the ceiling applied. Both doors'
 * row keys are read off their client's or their contract's own reading rather
 * than measured against a live reply, so this is the case that actually
 * happens when one of them is wrong.
 */
export function trimToCeiling(
  envelope: unknown,
  options: {
    ceiling: number;
    /** Keys leading to the records, e.g. `['data']` or `['sii', 'data']`. */
    path: RowsPath;
    /** What to say about the records that were dropped. */
    note: (kept: number, total: number) => string;
    /**
     * What to say when there were no records to drop. Omit to hand the reply
     * back exactly as it came, which is what Buk (D-266) has always done and
     * what its own test asserts by value.
     */
    untrimmable?: (chars: number) => string;
  },
): string {
  const whole = JSON.stringify(envelope, null, 2);
  if (whole.length <= options.ceiling) return whole;

  const rows = rowsAt(envelope, options.path);
  if (!rows) {
    // Nothing to drop that would not be a lie, so the reply is handed over
    // whole and over the ceiling either way. A door that wants the reader to
    // know that says so with `untrimmable`; one that does not stays byte-for-
    // byte what it always was.
    if (!options.untrimmable) return whole;
    return JSON.stringify(
      { ...(envelope as Record<string, unknown>), trimmed: options.untrimmable(whole.length) },
      null,
      2,
    );
  }

  const total = rows.length;
  const build = (keep: number) =>
    JSON.stringify(
      {
        ...(withRows(envelope, options.path, rows.slice(0, keep)) as Record<string, unknown>),
        trimmed: options.note(keep, total),
      },
      null,
      2,
    );

  // The largest prefix that fits. Binary search rather than a loop because a
  // reply may hold hundreds of records and each candidate is a stringify.
  let low = 0;
  let high = total;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (build(mid).length <= options.ceiling) low = mid;
    else high = mid - 1;
  }
  return build(low);
}
