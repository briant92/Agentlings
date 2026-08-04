import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { FilePreview, PreviewSheet } from '@agentlings/shared';
import { docxHtml, readSheets, readSlides } from './documents';
import { contentTypeFor, isBinary, opensInBrowser } from './outputs';

/**
 * What a produced document looks like without leaving the app.
 *
 * The panel used to offer a document as a name, a size and a download link,
 * which is the whole file and none of the point: you cannot tell whether the
 * spreadsheet the crew wrote is the one you asked for without opening it in
 * Excel first. Converting happens here rather than in the browser because the
 * libraries are already here — installed at the project root for the sandboxes
 * (D-031) — and the web bundle is pixi, react and a font.
 *
 * Every conversion loses something and the shape of what it loses is stated,
 * never guessed at by the reader: a `.docx` keeps its words and not its
 * layout, a `.pptx` keeps its text and none of its visuals. What a preview
 * must never do is read like the file itself.
 */

/** Past this, previewing costs more than opening the file properly. */
export const PREVIEW_LIMIT_BYTES = 8 * 1024 * 1024;
/** Bounds on a conversion. Each one is reported alongside the total it cut. */
export const GRID_ROWS = 100;
export const GRID_COLS = 26;
export const MAX_SLIDES = 40;
export const MAX_CHARS = 200_000;

/**
 * Tags mammoth emits, and nothing else.
 *
 * Its text content is escaped, so the danger is not what the document says but
 * what it links to: a hyperlink target is author-controlled and travels into
 * an `href` intact. Attributes are therefore dropped wholesale except an
 * `http(s)` link, which is the one that carries meaning.
 */
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'sup',
  'sub',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'blockquote',
  'pre',
  'code',
]);

/** Strips every tag not on the list, and every attribute but a safe `href`. */
export function sanitizeHtml(html: string): string {
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (whole, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    if (whole.startsWith('</')) return `</${name}>`;
    if (name !== 'a') return `<${name}>`;
    const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
    // Anything not plainly a web address — `javascript:`, `data:`, a relative
    // path into the sandbox — becomes an anchor with nowhere to go.
    return /^https?:\/\//i.test(href) ? `<a href="${href.replace(/"/g, '&quot;')}">` : '<a>';
  });
}

/**
 * Splits a CSV the way a spreadsheet does, quotes and all.
 *
 * Small enough to keep rather than reach for a parser: the one CSV the crew
 * has actually produced is a price template, and a field with a comma in it is
 * the first thing a price list has.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') (field += '"'), i++;
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') (row.push(field), (field = ''));
    else if (ch === '\n') (row.push(field), rows.push(row), (row = []), (field = ''));
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) (row.push(field), rows.push(row));
  return rows;
}

/** A grid cut to the bounds, with the totals it was cut from. */
function sheetOf(name: string, rows: string[][], totalRows: number, totalCols: number): PreviewSheet {
  return {
    name,
    rows: rows.slice(0, GRID_ROWS).map((r) => r.slice(0, GRID_COLS)),
    totalRows,
    totalCols,
  };
}

function cut(text: string): { content: string; truncated: boolean } {
  return text.length > MAX_CHARS
    ? { content: text.slice(0, MAX_CHARS), truncated: true }
    : { content: text, truncated: false };
}

/**
 * How one file should be shown.
 *
 * A conversion that throws is answered rather than raised: a run that died
 * half way through writing a spreadsheet leaves a real file that no reader can
 * open, and "this could not be read" with a download link beside it is a truer
 * panel than a failed request.
 */
export async function previewFile(file: string): Promise<FilePreview> {
  const name = path.basename(file);
  const ext = path.extname(name).toLowerCase();
  const bytes = statSync(file).size;
  if (bytes === 0) return { kind: 'none', reason: 'the file is empty' };
  if (bytes > PREVIEW_LIMIT_BYTES) {
    return { kind: 'none', reason: `too large to preview — ${Math.round(bytes / 1024 / 1024)} MB` };
  }
  // What the browser draws better than we can describe: a PDF it renders
  // exactly, an image it simply shows. Both are served by the bytes route.
  if (opensInBrowser(name) || contentTypeFor(name).startsWith('image/')) {
    return { kind: 'native', contentType: contentTypeFor(name) };
  }
  try {
    if (ext === '.xlsx') {
      const sheets = await readSheets(file, GRID_ROWS);
      return {
        kind: 'grid',
        sheets: sheets.map((s) => sheetOf(s.name, s.rows, s.totalRows, s.totalCols)),
      };
    }
    if (ext === '.csv') {
      const rows = parseCsv(readFileSync(file, 'utf8'));
      const cols = rows.reduce((most, row) => Math.max(most, row.length), 0);
      return { kind: 'grid', sheets: [sheetOf(name, rows, rows.length, cols)] };
    }
    if (ext === '.docx') {
      const { content, truncated } = cut(sanitizeHtml(await docxHtml(file)));
      return { kind: 'html', html: content, truncated };
    }
    if (ext === '.pptx') {
      const { slides, total } = await readSlides(file, MAX_SLIDES);
      return { kind: 'slides', slides: slides.map((lines, i) => ({ n: i + 1, lines })), total };
    }
  } catch (err) {
    return { kind: 'none', reason: err instanceof Error ? err.message : 'could not be read' };
  }
  const buffer = readFileSync(file);
  if (isBinary(buffer)) return { kind: 'none', reason: 'no preview for this kind of file' };
  return { kind: 'text', ...cut(buffer.toString('utf8')) };
}
