import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { JobOutputFile } from '@agentlings/shared';

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
function outputNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name);
}

/**
 * Whether the run left anything for the user at all.
 *
 * The one notion of "it delivered" for work that is not a repository change.
 * A job with no clone produces no diff, so judging delivery by a patch called
 * every such run a failure — including one that wrote a working PDF.
 */
export function deliveredFiles(dir: string): boolean {
  return outputNames(dir).length > 0;
}

/**
 * The sandbox's top-level files. Text comes back inline, because that is what
 * the review panel reads; anything binary is announced and left on disk to be
 * fetched on its own.
 */
export function listOutputs(dir: string): JobOutputFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => {
      const buffer = readFileSync(path.join(dir, entry.name));
      const binary = isBinary(buffer);
      return {
        name: entry.name,
        bytes: buffer.length,
        binary,
        ...(binary ? {} : { content: buffer.toString('utf8') }),
      };
    });
}
