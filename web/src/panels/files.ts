import type { FilePreview } from '@agentlings/shared';
import { lvl } from '../api';

/** The rules the file viewer and the inbox both go by, kept out of the JSX. */

/** The crew's paperwork, as against the thing that was asked for. */
export const PAPERWORK = new Set(['RESULT.md', 'LESSON.md', 'APPROACH.md', 'DIFF.patch']);

/**
 * Deliverables first, paperwork after, and `RESULT.md` at the head of the
 * paperwork because it is the one someone reads.
 *
 * One order for both panels. There were two: the inbox put paperwork last and
 * the review panel put `RESULT.md` first, so a job that wrote a spreadsheet
 * led with the spreadsheet in one place and with the write-up in the other.
 * Two answers to a question that has one.
 */
export function orderFiles<T extends { name: string }>(files: readonly T[]): T[] {
  const rank = (name: string) => (!PAPERWORK.has(name) ? 0 : name === 'RESULT.md' ? 1 : 2);
  return [...files].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

export function fileUrl(levelId: string, jobId: string, name: string): string {
  return lvl(levelId, `/jobs/${jobId}/output/${encodeURIComponent(name)}`);
}

export function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Enough of a hint to find the spreadsheet in a list without reading names. */
export function glyph(name: string): string {
  switch (name.slice(name.lastIndexOf('.')).toLowerCase()) {
    case '.xlsx':
    case '.csv':
      return '▦';
    case '.docx':
      return '¶';
    case '.pdf':
      return '▤';
    case '.pptx':
      return '▭';
    case '.patch':
    case '.diff':
      return '±';
    default:
      return '·';
  }
}

/** One run of a markdown preview: plain text, or a mermaid fence to draw. */
export type TextSegment = { kind: 'text'; text: string } | { kind: 'mermaid'; code: string };

/**
 * Split markdown into text and ```mermaid fences so the viewer can draw the
 * diagrams a blueprint carries. Only a fence that closes counts — an unclosed
 * fence (including one the server's truncation cut) stays text, because
 * drawing half a diagram would show something the file does not say.
 */
export function splitMermaid(content: string): TextSegment[] {
  const lines = content.split('\n');
  const out: TextSegment[] = [];
  let text: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s{0,3}```\s*mermaid\s*$/.test(lines[i])) {
      const close = lines.findIndex((line, j) => j > i && /^\s{0,3}```\s*$/.test(line));
      if (close !== -1) {
        if (text.length > 0) out.push({ kind: 'text', text: text.join('\n') });
        text = [];
        out.push({ kind: 'mermaid', code: lines.slice(i + 1, close).join('\n') });
        i = close + 1;
        continue;
      }
    }
    text.push(lines[i]);
    i += 1;
  }
  if (text.length > 0) out.push({ kind: 'text', text: text.join('\n') });
  return out;
}

/**
 * How much of the file is really on screen.
 *
 * `exact` means the bytes themselves; `converted` means a reading of them that
 * has lost something, and says which something. The two are different words on
 * purpose: the log records a banked sentence standing in for a PDF that was
 * never written (D-030), and a preview that reads as the document is that same
 * error with better typography.
 */
export function fidelity(preview: FilePreview): { label: string; exact: boolean } | null {
  switch (preview.kind) {
    case 'native':
    case 'text':
      return { label: 'exact', exact: true };
    case 'html':
      return { label: 'converted · words, not layout', exact: false };
    case 'grid':
      return { label: 'converted · values, not formatting', exact: false };
    case 'slides':
      return { label: 'converted · text only, no visuals', exact: false };
    case 'none':
      return null;
  }
}
