import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { docxText, pdfText, readSheets, readSlides } from './documents';

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

/**
 * Per file, once documents are in scope.
 *
 * A folder of notes is bounded by `MAX_PER_SOURCE`; a folder of reports is not
 * — one 500-page PDF is more passages than 250 markdown files put together,
 * and the whole index is read and parsed on every job and every quote. 200
 * passages is roughly 60 pages. Files that hit it are counted and shown, on
 * the same rule as the source cap: a store that quietly indexed the first
 * third of a contract would answer confidently from that third.
 */
export const MAX_PASSAGES_PER_FILE = 200;

const INDEXABLE = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.mdx',
  '.docx',
  '.pdf',
  '.xlsx',
  '.pptx',
]);

export interface StoreEntry {
  /** The passage itself, one line, at most `MAX_ENTRY_CHARS`. */
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
  /**
   * Files read only in part, having more than `MAX_PASSAGES_PER_FILE`.
   * Optional because an index written before documents were readable has no
   * such files and no such field — absent means none, not unknown.
   */
  truncated?: number;
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
 * Cuts one long run of text into passage-sized lines.
 *
 * Sentence-first, then a word boundary, then a hard cut: what matters is that
 * a passage reads as a passage, since it is shown to you in a recall answer
 * and pasted into an agentling's briefing verbatim.
 */
function chunk(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_ENTRY_CHARS) {
    const window = rest.slice(0, MAX_ENTRY_CHARS);
    // Only a break past halfway is worth taking; nearer the start it would
    // leave a stub and push the real sentence into the next passage.
    const half = MAX_ENTRY_CHARS / 2;
    const sentence = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('? '),
      window.lastIndexOf('! '),
    );
    const at =
      sentence > half ? sentence + 1 : window.lastIndexOf(' ') > half ? window.lastIndexOf(' ') : MAX_ENTRY_CHARS;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Text split into passages: at markdown headings where there are any, and by
 * length everywhere else.
 *
 * The heading is kept on the front of its own section: it is usually the only
 * place the subject is named, and dropping it makes a section about "the retry
 * logic" score zero against a question that says "retry".
 *
 * The length half was not decoration, it was the feature. Sections used to be
 * `trim`med to 600 characters and the rest thrown away, which is invisible on
 * short notes and ruinous on anything else — measured before changing it, a
 * 2,974-character text file indexed as **one** passage holding 633 characters,
 * so 79% of it was unsearchable. A .docx or a .pdf has no `#` headings at all,
 * so opening the store to documents on top of that would have indexed the
 * first paragraph of each and looked like it worked (D-026's shape: complete
 * in the type, the route and the setting, and reaching nothing).
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
    // One entry is one line: the corpus is line-based and both consumers score
    // lines, so a passage with a newline in it would be two things at once.
    .map((p) => p.trim().replace(/\s*\n\s*/g, ' '))
    .filter(Boolean)
    .flatMap(chunk);
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
 * A row of a spreadsheet as a sentence about itself.
 *
 * A grid has no prose in it, and this is the whole difficulty with indexing
 * one. `AX-114 | Meridian | 12.40` shares no words with "what do we know about
 * supplier pricing" — the terms that would match are in the header row and the
 * sheet tab, which are somewhere else entirely. So every row carries its sheet
 * name and its column names: the scorer is term overlap, and a passage cut
 * anywhere in a long sheet still has to be findable.
 *
 * Blank cells are dropped rather than written as `unit=`, which would spend
 * the passage budget saying nothing.
 */
export function rowLine(sheet: string, headers: string[], row: string[]): string {
  const pairs = row
    .map((cell, i) => ({ head: headers[i]?.trim() ?? '', cell: cell.trim() }))
    .filter(({ cell }) => cell !== '')
    .map(({ head, cell }) => (head ? `${head}=${cell}` : cell));
  return pairs.length > 0 ? `${sheet} — ${pairs.join(', ')}` : '';
}

/**
 * Whether the first row names the columns rather than holding data.
 *
 * A header is text in every filled cell. One number in the top row and it is
 * data, so labelling the rest under it would attach `12.40=13.05` to every
 * line below — a confident-looking falsehood in every passage of the sheet.
 */
export function looksLikeHeader(row: string[] | undefined): boolean {
  const filled = (row ?? []).map((c) => c.trim()).filter(Boolean);
  return filled.length > 0 && filled.every((c) => !/^-?[\d.,]+%?$/.test(c));
}

/**
 * One file as plain text, whatever it is.
 *
 * The document libraries are already installed at the project root for the
 * sandboxes (D-031), so reading any of these costs nothing new — the store
 * simply had no reason to before. Everything is imported lazily by
 * `documents.ts`: a folder of markdown loads no readers at all.
 *
 * A .pdf that is a scan of paper holds images and no text, and comes back
 * empty rather than wrong. That is worth saying out loud in the panel, because
 * an empty result and an unread file look identical from there.
 */
export async function extract(file: string): Promise<string> {
  switch (path.extname(file).toLowerCase()) {
    case '.docx':
      return docxText(file);
    case '.pdf':
      return pdfText(file);
    case '.xlsx': {
      const sheets = await readSheets(file);
      return sheets
        .flatMap((sheet) => {
          const headed = looksLikeHeader(sheet.rows[0]);
          const headers = headed ? sheet.rows[0] : [];
          return (headed ? sheet.rows.slice(1) : sheet.rows)
            .map((row) => rowLine(sheet.name, headers, row))
            .filter(Boolean);
        })
        .join('\n');
    }
    case '.pptx': {
      // A slide is already a unit of thought, so it becomes its own passage —
      // the heading rule markdown gets for free. The heading is the slide's
      // own first line, which is its title.
      //
      // Not a synthetic `# Slide 3`: read back from a live index, that label
      // was sitting in the recall answer where the document's words should be,
      // and `slide` would have scored against every deck in the folder. The
      // same mistake as pdf-parse's page marker (D-059), made by us.
      const { slides } = await readSlides(file);
      return slides
        .filter((lines) => lines.length > 0)
        .map(([title, ...rest]) => [`# ${title.replace(/^#+\s*/, '')}`, ...rest].join('\n'))
        .join('\n');
    }
    default:
      return readFileSync(file, 'utf8');
  }
}

/**
 * Read every named folder and build the index.
 *
 * A source that does not exist is skipped rather than fatal: these are paths a
 * user typed, and one bad line should not cost them the rest of their notes.
 * The same goes for one unreadable file — an encrypted PDF or a .docx that is
 * really a renamed something-else should cost its own passages and no more.
 */
export async function sync(sources: string[], now: number): Promise<StoreIndex> {
  const entries: StoreEntry[] = [];
  let skipped = 0;
  let truncated = 0;
  for (const source of sources) {
    if (!existsSync(source)) continue;
    const { files, skipped: over } = filesUnder(source, MAX_PER_SOURCE);
    skipped += over;
    for (const file of files) {
      let text: string;
      try {
        text = await extract(file);
      } catch {
        continue;
      }
      const rel = path.relative(source, file).split(path.sep).join('/');
      const found = passages(text);
      if (found.length > MAX_PASSAGES_PER_FILE) truncated++;
      for (const passage of found.slice(0, MAX_PASSAGES_PER_FILE)) {
        entries.push({ text: passage, source: rel, syncedAt: now });
      }
    }
  }
  return { sources, syncedAt: now, entries, skipped, truncated };
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
