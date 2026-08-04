import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { docxText, imageText, ocrPdf, pdfText, readSheets, readSlides } from './documents';
import { ocrAvailable } from './ocr';

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

/**
 * How many pages of one scanned document to read, and how many across a whole
 * sync.
 *
 * Reading a text layer is free; reading pixels is not. Measured: a page costs
 * about 130ms to render and the engine about 1.6s to start, once per document.
 * A folder of 250 scans would therefore block the request that started it for
 * several minutes, so the sync carries a budget and says what it did not spend
 * it on — the rule every other cap here follows.
 */
export const MAX_OCR_PAGES_PER_FILE = 20;
export const MAX_OCR_PAGES_PER_SYNC = 200;

const INDEXABLE = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.mdx',
  '.docx',
  '.pdf',
  '.xlsx',
  '.pptx',
  // A photograph of a receipt is a scanned document with a step removed.
  '.png',
  '.jpg',
  '.jpeg',
]);

export interface StoreEntry {
  /** The passage itself, one line, at most `MAX_ENTRY_CHARS`. */
  text: string;
  /** The file it came from, relative to the source folder the user named. */
  source: string;
  /** When it was read. Per entry, so sources synced at different times stay honest. */
  syncedAt: number;
  /**
   * Read off pixels rather than out of a text layer, so the words are a good
   * guess and not the document's own. Absent means it was read exactly.
   */
  scanned?: boolean;
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
  /** Files read off pixels rather than out of a text layer. */
  scanned?: number;
  /**
   * Scans read only as far as the per-file page budget — a long contract read
   * to page 20. Its own counter because it is a different loss from a file
   * that yielded nothing, and it used to be no counter at all.
   */
  scanCut?: number;
  /**
   * Files that hold no text and were not read: the OCR budget ran out, or this
   * machine has no engine. The difference between the two is `ocrAvailable`,
   * and the panel says which — a scan that contributed nothing is otherwise
   * indistinguishable from a file that was never there.
   */
  unscanned?: number;
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
 * Whether a PDF's text layer amounts to anything.
 *
 * Not `=== ''`. A scan often carries a few stray characters — a header stamped
 * digitally, an OCR layer some other tool left half-finished — and treating
 * those as "this document has text" is how a 40-page contract indexes as the
 * word "Confidential" and nothing else.
 */
/** What one file gave up, and what reading it cost. */
export interface Extracted {
  text: string;
  /** Read off pixels rather than out of a text layer. */
  scanned: boolean;
  /** Pages actually put through the engine, which is what the sync is charged. */
  ocrPages: number;
  /** The document had more pages than the budget allowed. */
  ocrCut: boolean;
}

export function hasTextLayer(text: string): boolean {
  return text.replace(/\s+/g, '').length >= 40;
}

/**
 * One file as plain text, and whether the words came off pixels.
 *
 * The document libraries are already installed at the project root for the
 * sandboxes (D-031), so reading any of these costs nothing new — the store
 * simply had no reason to before. Everything is imported lazily by
 * `documents.ts`: a folder of markdown loads no readers at all.
 *
 * `scanned` travels with the text because it has to reach the entry. OCR is a
 * conversion with real error in it — measured, a rough scan came back with
 * `_.LDER` for `CALDER` — and the recall tier quotes a passage into an answer
 * and into an agentling's briefing word for word. A reader has to be able to
 * tell that a line was read off paper (D-061).
 */
export async function extract(file: string, ocr?: { pages: number }): Promise<Extracted> {
  const plain = (text: string): Extracted => ({ text, scanned: false, ocrPages: 0, ocrCut: false });
  switch (path.extname(file).toLowerCase()) {
    case '.docx':
      return plain(await docxText(file));
    case '.pdf': {
      const text = await pdfText(file);
      // The text layer wins whenever there is one: it is exact, instant, and
      // free, and OCR of the same page would be a worse copy of it.
      if (hasTextLayer(text) || !ocr) return plain(text);
      const read = await ocrPdf(file, ocr.pages);
      return {
        text: read.text,
        scanned: true,
        // What it actually cost, not what it was allowed: charging the
        // allowance made a one-page receipt as expensive as a 20-page report,
        // so a folder of short scans stopped being read after ten of them.
        ocrPages: read.pages,
        ocrCut: read.total > read.pages,
      };
    }
    case '.png':
    case '.jpg':
    case '.jpeg':
      return ocr
        ? { text: await imageText(file), scanned: true, ocrPages: 1, ocrCut: false }
        : plain('');
    case '.xlsx': {
      const sheets = await readSheets(file);
      return plain(
        sheets
          .flatMap((sheet) => {
            const headed = looksLikeHeader(sheet.rows[0]);
            const headers = headed ? sheet.rows[0] : [];
            return (headed ? sheet.rows.slice(1) : sheet.rows)
              .map((row) => rowLine(sheet.name, headers, row))
              .filter(Boolean);
          })
          .join('\n'),
      );
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
      return plain(
        slides
          .filter((lines) => lines.length > 0)
          .map(([title, ...rest]) => [`# ${title.replace(/^#+\s*/, '')}`, ...rest].join('\n'))
          .join('\n'),
      );
    }
    default:
      return plain(readFileSync(file, 'utf8'));
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
  let scanned = 0;
  let unscanned = 0;
  let scanCut = 0;
  // Asked once, before any file is opened, so a machine with no engine does
  // the ordinary sync at ordinary speed instead of failing per document.
  const canOcr = await ocrAvailable();
  let budget = canOcr ? MAX_OCR_PAGES_PER_SYNC : 0;
  for (const source of sources) {
    if (!existsSync(source)) continue;
    const { files, skipped: over } = filesUnder(source, MAX_PER_SOURCE);
    skipped += over;
    for (const file of files) {
      const allowance = Math.min(budget, MAX_OCR_PAGES_PER_FILE);
      let read: Extracted;
      try {
        read = await extract(file, allowance > 0 ? { pages: allowance } : undefined);
      } catch {
        continue;
      }
      // Counted whether or not it yielded anything: a scan that came back
      // blank still spent the budget, and a folder that quietly stopped being
      // read halfway is the thing every cap here exists to make visible.
      if (read.scanned) {
        scanned++;
        budget -= read.ocrPages;
        if (read.ocrCut) scanCut++;
      } else if (needsOcr(file) && read.text.trim() === '') {
        unscanned++;
      }
      const rel = path.relative(source, file).split(path.sep).join('/');
      const found = passages(read.text);
      if (found.length > MAX_PASSAGES_PER_FILE) truncated++;
      for (const passage of found.slice(0, MAX_PASSAGES_PER_FILE)) {
        entries.push({
          text: passage,
          source: rel,
          syncedAt: now,
          ...(read.scanned ? { scanned: true } : {}),
        });
      }
    }
  }
  return { sources, syncedAt: now, entries, skipped, truncated, scanned, unscanned, scanCut };
}

/** A file whose words can only have come off pixels. */
function needsOcr(file: string): boolean {
  return ['.pdf', '.png', '.jpg', '.jpeg'].includes(path.extname(file).toLowerCase());
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
  // "read from a scan" rides in the same place the filename does, and for the
  // same reason: the recall tier prints this line and a session is handed it
  // word for word, and OCR text is a good guess rather than the document's own
  // words. Whoever reads it has to be able to tell (D-061).
  const how = entry.scanned ? `${entry.source}, read from a scan` : entry.source;
  return `${entry.text} [${how}, synced ${date}]`;
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
