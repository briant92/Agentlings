import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { trim } from './web';

/**
 * The knowledge store: your own material, synced into a local index the crew
 * reads. It never talks to the source live (D-047).
 *
 * Three things follow from that choice, and they are the whole module:
 *
 * - **The index is an artefact you can inspect before the crew uses it.** That
 *   is the app's one safety shape — sandbox, review, promote; preview before
 *   install — applied to notes. A live connection would hand a session reach
 *   into a corpus nobody has read.
 * - **An entry is a line.** `readKnowledge` returns `string[]` and both
 *   consumers pick from it with `relevantLines`, so an index that emits lines
 *   needs no new tier, no new router branch and no second scorer. A second
 *   notion of "a note that bears on this job" is the duplication D-030 was
 *   written about.
 * - **Provenance rides in the line.** A rendered entry ends with its source and
 *   sync date, so a recall answer and a session's context both carry it without
 *   either of them knowing this module exists. One implementation, no drift.
 */

/** A week, matching the catalog's own staleness bound rather than a new number. */
export const STALE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Per source, matching the library's cap. The overflow is reported rather than
 * silently dropped — a store that quietly indexed half your notes would answer
 * confidently from the half it had.
 */
export const MAX_PER_SOURCE = 250;

/**
 * One passage. Long enough to carry an idea, short enough that eight of them
 * are still a small prompt: the session is handed 8 lines, so this bounds that
 * context at ~8 × 600 chars rather than at whole documents.
 */
export const MAX_ENTRY_CHARS = 600;

const INDEXABLE = new Set(['.md', '.markdown', '.txt', '.mdx']);

export interface StoreEntry {
  /** The passage itself, already trimmed. */
  text: string;
  /** The file it came from, relative to the source folder the user named. */
  source: string;
  /** When it was read. Per entry, so sources synced at different times stay honest. */
  syncedAt: number;
}

export interface StoreIndex {
  /** The folders this level indexes, as the user gave them. */
  sources: string[];
  syncedAt: number;
  entries: StoreEntry[];
  /** Files found beyond `MAX_PER_SOURCE`, per source. Reported, never hidden. */
  skipped: number;
}

export function indexFile(dir: string): string {
  return path.join(dir, 'store-index.json');
}

export function readIndex(dir: string): StoreIndex | null {
  const file = indexFile(dir);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as StoreIndex;
  } catch {
    return null; // a torn index is a missing index, not a crash
  }
}

export function writeIndex(dir: string, index: StoreIndex): void {
  mkdirSync(dir, { recursive: true }); // as the ledger's own append does
  writeFileSync(indexFile(dir), `${JSON.stringify(index, null, 2)}\n`);
}

export function isStale(index: StoreIndex, now: number, staleMs = STALE_MS): boolean {
  return now - index.syncedAt > staleMs;
}

/**
 * Markdown split at headings, so a passage is a section rather than an
 * arbitrary window. A file with no headings is one passage.
 *
 * The heading is kept on the front of its own section: it is usually the only
 * place the subject is named, and dropping it makes a section about "the retry
 * logic" score zero against a question that says "retry".
 */
export function passages(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && current.some((l) => l.trim())) {
      out.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.some((l) => l.trim())) out.push(current.join('\n'));
  return out
    .map((p) => p.trim().replace(/\s*\n\s*/g, ' '))
    .filter(Boolean)
    .map((p) => trim(p, MAX_ENTRY_CHARS).text);
}

/** Every indexable file under a folder, depth-first, sorted for a stable index. */
function filesUnder(root: string, limit: number): { files: string[]; skipped: number } {
  const found: string[] = [];
  const walk = (dir: string): void => {
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      return; // unreadable folder: skip it rather than fail the whole sync
    }
    for (const name of names) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const full = path.join(dir, name);
      let entry;
      try {
        entry = statSync(full);
      } catch {
        continue;
      }
      if (entry.isDirectory()) walk(full);
      else if (INDEXABLE.has(path.extname(name).toLowerCase())) found.push(full);
    }
  };
  walk(root);
  return { files: found.slice(0, limit), skipped: Math.max(0, found.length - limit) };
}

/**
 * Read every named folder and build the index.
 *
 * A source that does not exist is skipped rather than fatal: these are paths a
 * user typed, and one bad line should not cost them the rest of their notes.
 */
export function sync(sources: string[], now: number): StoreIndex {
  const entries: StoreEntry[] = [];
  let skipped = 0;
  for (const source of sources) {
    if (!existsSync(source)) continue;
    const { files, skipped: over } = filesUnder(source, MAX_PER_SOURCE);
    skipped += over;
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const rel = path.relative(source, file).split(path.sep).join('/');
      for (const passage of passages(text)) {
        entries.push({ text: passage, source: rel, syncedAt: now });
      }
    }
  }
  return { sources, syncedAt: now, entries, skipped };
}

/**
 * One entry as a corpus line: the passage, then where it came from and when.
 *
 * The provenance is *inside* the line on purpose. The recall tier prints the
 * lines it matched and a session is handed them verbatim, so both carry the
 * source and the date without either knowing a store exists — which is what
 * D-047 requires and the cheapest possible way to get it.
 */
export function asLine(entry: StoreEntry): string {
  const date = new Date(entry.syncedAt).toISOString().slice(0, 10);
  return `${entry.text} [${entry.source}, synced ${date}]`;
}

/**
 * The store's contribution to a level's recall corpus.
 *
 * Empty when the index is stale, which *is* the staleness guard: nothing
 * matches, so the free tier cannot answer from it and the job falls through to
 * a session that can go and look. Applied in one place rather than once per
 * consumer, because two copies of this rule would eventually disagree — and a
 * stale page served for free is the failure D-045 caught the first compiled
 * tool committing.
 */
export function storeLines(dir: string, now: number): string[] {
  const index = readIndex(dir);
  if (!index || isStale(index, now)) return [];
  return index.entries.map(asLine);
}
