import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { DeliveryFile, DeliverySummary } from '@agentlings/shared';

/**
 * What a job left behind in its sandbox.
 *
 * Everything used to be read as UTF-8 and inlined in JSON, which is right for
 * the RESULT.md and DIFF.patch the crew normally write and quietly wrong for
 * anything else: a PDF or a .docx comes back as replacement characters, so a
 * job that produced a real document appeared to have produced gibberish. The
 * listing now says what each file *is*, and bytes are fetched one file at a
 * time by whoever actually wants them.
 */

/** How much of a file to sniff before deciding it is not text. */
export const SNIFF_BYTES = 8000;

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export function contentTypeFor(name: string): string {
  return CONTENT_TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Whether a browser will show this rather than save it.
 *
 * Only PDF: browsers render one natively, so previewing it costs no library
 * and no bundle weight. Office formats have no native viewer and are left as
 * downloads — which is where they were going anyway, since you open those in
 * the application that owns them.
 *
 * It decides the Content-Disposition, and that is the whole trick: served as
 * an attachment, a PDF downloads instead of appearing in the frame.
 */
export function opensInBrowser(name: string): boolean {
  return contentTypeFor(name) === 'application/pdf';
}

/**
 * Whether a file is binary — meaning: would inlining it as text damage it?
 *
 * A NUL byte is git's test and catches most things, but not everything that
 * matters here. Found by test drive: an agentling asked for a PDF wrote one by
 * hand with uncompressed streams, so it held no NUL anywhere and was declared
 * text — while its `%âãÏÓ` marker is Latin-1 and not valid UTF-8, so inlining
 * it corrupted precisely the bytes this function exists to protect. The unit
 * fixture had a NUL in it by construction, so it proved the heuristic rather
 * than the requirement.
 *
 * So the question asked is the one actually being decided: text is what
 * survives a round trip through UTF-8. Anything else is served as bytes.
 */
export function isBinary(buffer: Buffer): boolean {
  const head = buffer.subarray(0, SNIFF_BYTES);
  if (head.includes(0)) return true;
  // Only a window that actually cut the file short gets slack: a multi-byte
  // character straddling the end is truncation, not binary, and UTF-8 needs at
  // most three bytes of it. Where the whole file fits, an invalid sequence is
  // simply invalid.
  const slack = head.length < buffer.length ? 3 : 0;
  for (let trim = 0; trim <= slack; trim++) {
    try {
      new TextDecoder('utf8', { fatal: true }).decode(head.subarray(0, head.length - trim));
      return false;
    } catch {
      // Fall through and try one byte further back.
    }
  }
  return true;
}

/**
 * Guards a filename coming in off a URL. The sandbox holds a job's whole
 * working directory, so a name that climbs out of it would serve any file on
 * the machine — this is the one place a caller picks the path.
 */
export function safeOutputPath(dir: string, name: string): string | null {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('\0')) return null;
  if (name === '.' || name === '..') return null;
  const full = path.join(dir, name);
  // Belt and braces: even with the checks above, prove the result is inside.
  const root = path.resolve(dir);
  if (path.resolve(full) !== path.join(root, name)) return null;
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  return full;
}

/** The files a job left behind, ignoring its own config and the clone. */
export function outputNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name);
}

/**
 * The previous leg's report, carried into a continuation's sandbox under its
 * own name so RESULT.md stays the new run's to write (D-146).
 */
export const PREVIOUS_RESULT = 'PREVIOUS-RESULT.md';

/**
 * The crew's own paperwork: the report it writes about the work, the notes
 * the close-out writes about the run, and the report a continuation inherits.
 * Everything else in a sandbox is the thing the user actually asked for.
 */
export const PAPERWORK = new Set(['RESULT.md', 'LESSON.md', 'APPROACH.md', PREVIOUS_RESULT]);

/**
 * Whether the run made something, rather than merely reporting something.
 *
 * The distinction decides whether a repeat can be answered from memory. Words
 * can be replayed; a file cannot — describing it again produces nothing. A
 * diff counts as made, since it is a deliverable that lives on disk too.
 */
export function producedArtefacts(dir: string): boolean {
  return outputNames(dir).some((name) => !PAPERWORK.has(name));
}

/**
 * Whether the run left anything for the user at all.
 *
 * The one notion of "it delivered" for work that is not a repository change.
 * A job with no clone produces no diff, so judging delivery by a patch called
 * every such run a failure — including one that wrote a working PDF.
 */
export function deliveredFiles(dir: string): boolean {
  // The inherited report is the one file that is never this run's own doing —
  // counting it would mark a leg delivered before it had done anything.
  return outputNames(dir).some((name) => name !== PREVIOUS_RESULT);
}

/**
 * A filename safe to write inside a sandbox, or null.
 *
 * The name arrives from a browser, which is to say from anywhere, and this is
 * the one place a caller chooses what a file is called on disk. Any directory
 * part is stripped rather than rejected — a browser sends "contract.pdf" but a
 * crafted request can send anything, and the only thing that matters is that
 * what lands is a plain name in the directory we chose.
 *
 * Both separators are handled whatever the platform: a Windows path arriving
 * on a POSIX server would otherwise sail through `path.basename` intact.
 */
export function safeAttachmentName(name: string): string | null {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  const trimmed = base.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') return null;
  if (trimmed.includes('\0')) return null;
  // A dotfile would be invisible to every listing the app has, including the
  // one the review panel reads — a file the user attached and then cannot see.
  if (trimmed.startsWith('.')) return null;
  return trimmed;
}

/**
 * The files a job was given, read back off its sandbox so another job can be
 * handed the same ones (D-097).
 *
 * `Job.attachments` is names and sizes; the bytes only ever live in the
 * sandbox's `input/`. A redo is a fresh job with a fresh sandbox, so without
 * this "summarise the attached expenses.csv" comes back with nothing to
 * summarise — and says so having been paid for.
 *
 * Names come from the job's own record rather than a directory listing, so a
 * file the *run* wrote into `input/` cannot smuggle itself in as an
 * attachment the user never sent. Anything unreadable is skipped rather than
 * failing the whole redo: a run that can say which file is missing is worth
 * more than a 500.
 */
export function attachedFiles(
  dir: string,
  attachments: { name: string }[] | undefined,
): { name: string; data: Buffer }[] {
  const files: { name: string; data: Buffer }[] = [];
  for (const attachment of attachments ?? []) {
    const name = safeAttachmentName(attachment.name);
    if (!name) continue;
    try {
      files.push({ name, data: readFileSync(path.join(dir, name)) });
    } catch {
      continue;
    }
  }
  return files;
}

/**
 * What each file is called and how big it is, from the directory entry alone.
 *
 * The one listing, for the inbox and the review panel both. There used to be a
 * second that read every byte of every file so the panel could print the text
 * ones — which is megabytes fetched to draw a row of labels, and answers "what
 * is in this file" in a place that has not been asked yet. Contents come from
 * `previewFile`, one file at a time, when something is actually being read.
 */
export function describeOutputs(dir: string, previousDir?: string): DeliveryFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => {
      const file = path.join(dir, entry.name);
      const bytes = statSync(file).size;
      return {
        name: entry.name,
        bytes,
        // Presence, not truth (the ledger's rule, D-029): `false` is an
        // answer — this run wrote it — and an absent field means nobody was
        // asked, because the job continues nothing. Emitting only the true
        // half would make "written this run" and "not a continuation" look
        // identical on the card, which is half the fact missing.
        ...(previousDir
          ? { carried: unchangedSince(previousDir, file, entry.name, bytes) }
          : {}),
      };
    });
}

/**
 * Whether this file is byte-for-byte the one the previous leg had (D-202).
 *
 * Content, never timestamps: `carryForward` copies with `cpSync` and does not
 * preserve them, so every inherited file's mtime is the moment the new
 * sandbox was built and says nothing about whether the run rewrote it. Size
 * first because it settles almost every case for the cost of a stat, and the
 * hash only runs for the files a cheap check could not tell apart.
 *
 * Unreadable either side means no claim: a file we could not compare is not
 * a file we can call untouched.
 */
function unchangedSince(
  previousDir: string,
  file: string,
  name: string,
  bytes: number,
): boolean {
  const before = path.join(previousDir, name);
  try {
    if (!existsSync(before) || !statSync(before).isFile()) return false;
    if (statSync(before).size !== bytes) return false;
    return sha256(before) === sha256(file);
  } catch {
    return false;
  }
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * The files a row should never call a delivery: the paperwork above, the
 * close-out's account of what is left, and the diff the repo path reports
 * on its own terms.
 */
const NOT_DELIVERED = new Set([...PAPERWORK, 'PENDING.md', 'DIFF.patch']);
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
/** Folders that are never the run's own: the clone, and anything installed. */
const NOT_A_RUNS_FOLDER = new Set(['repo', 'node_modules']);
/** Past this many files a folder is counted as "at least" — a tree that size is not worth walking. */
const DIR_FILE_CAP = 5000;

/**
 * What a run left for the user, counted once at the seam every ending passes
 * through and stamped on the job (UI.md, step 9) — the one notion the
 * backoffice row reads, in place of a client-side guess that read repo diffs
 * and summaries and called a run that wrote a PDF "nothing on disk".
 *
 * Top-level files minus the paperwork, PDFs and images told apart because
 * that is what a row wants to say; the folders beside them with their
 * weight, because `work/` is where a cut run's evidence sits and no listing
 * showed it. Dotfiles stay invisible here as everywhere.
 */
export function deliverySummary(dir: string): DeliverySummary {
  const summary: DeliverySummary = { files: 0, pdf: 0, images: 0, dirs: [] };
  if (!existsSync(dir)) return summary;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isFile()) {
      if (NOT_DELIVERED.has(entry.name)) continue;
      summary.files += 1;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.pdf') summary.pdf += 1;
      else if (IMAGES.has(ext)) summary.images += 1;
    } else if (entry.isDirectory() && !NOT_A_RUNS_FOLDER.has(entry.name)) {
      summary.dirs.push({ name: entry.name, ...folderWeight(path.join(dir, entry.name)) });
    }
  }
  summary.dirs.sort((a, b) => a.name.localeCompare(b.name));
  return summary;
}

function folderWeight(root: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const stack = [root];
  while (stack.length > 0 && files < DIR_FILE_CAP) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue; // a folder that vanished or refuses weighs nothing
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      files += 1;
      try {
        bytes += statSync(path.join(current, entry.name)).size;
      } catch {
        // A file that vanished between the listing and the stat.
      }
      if (files >= DIR_FILE_CAP) break;
    }
  }
  return { files, bytes };
}
