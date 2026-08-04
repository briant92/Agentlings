import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { FilePreview, PreviewSheet, PreviewSlide } from '@agentlings/shared';
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
 * A cell as text.
 *
 * exceljs hands back whatever the cell holds: a formula arrives as its
 * definition plus its last computed result, rich text as runs, a hyperlink as
 * a target and a caption. A preview wants the value someone would see in the
 * application, so the result wins over the formula and the caption over the
 * link.
 */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const cell = value as Record<string, unknown>;
    if ('result' in cell) return cellText(cell.result);
    if ('text' in cell) return cellText(cell.text);
    if ('richText' in cell && Array.isArray(cell.richText)) {
      return cell.richText.map((run) => cellText((run as { text?: unknown }).text)).join('');
    }
    if ('error' in cell) return String(cell.error);
    return '';
  }
  return String(value);
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

async function spreadsheet(file: string): Promise<PreviewSheet[]> {
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  return book.worksheets.map((sheet) => {
    const rows: string[][] = [];
    for (let n = 1; n <= Math.min(sheet.rowCount, GRID_ROWS); n++) {
      const values = sheet.getRow(n).values;
      // 1-based and sparse: index 0 is never a cell, and a gap is a blank.
      const cells = Array.isArray(values) ? values.slice(1) : [];
      rows.push(Array.from({ length: sheet.columnCount }, (_, i) => cellText(cells[i])));
    }
    return sheetOf(sheet.name, rows, sheet.rowCount, sheet.columnCount);
  });
}

/**
 * The text of each slide, in reading order.
 *
 * A .pptx is a zip of XML, so the slides come out with no library that renders
 * one — because nothing installed renders one. Paragraphs become lines and
 * runs within a paragraph are joined, which is what turns a title split across
 * three formatting runs back into a title.
 */
async function slides(file: string): Promise<{ slides: PreviewSlide[]; total: number }> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(readFileSync(file));
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    // Numerically: slide10 sorts before slide2 as a string.
    .sort((a, b) => Number(/(\d+)/.exec(a)![1]) - Number(/(\d+)/.exec(b)![1]));
  const shown: PreviewSlide[] = [];
  for (const [i, name] of names.slice(0, MAX_SLIDES).entries()) {
    const xml = await zip.file(name)!.async('string');
    const lines = xml
      .split('</a:p>')
      .map((para) => [...para.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(''))
      .filter((line) => line.trim() !== '');
    shown.push({ n: i + 1, lines });
  }
  return { slides: shown, total: names.length };
}

/** The five entities an OOXML text run can carry. */
function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
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
    if (ext === '.xlsx') return { kind: 'grid', sheets: await spreadsheet(file) };
    if (ext === '.csv') {
      const rows = parseCsv(readFileSync(file, 'utf8'));
      const cols = rows.reduce((most, row) => Math.max(most, row.length), 0);
      return { kind: 'grid', sheets: [sheetOf(name, rows, rows.length, cols)] };
    }
    if (ext === '.docx') {
      const mammoth = (await import('mammoth')).default;
      const { value } = await mammoth.convertToHtml({ buffer: readFileSync(file) });
      const { content, truncated } = cut(sanitizeHtml(value));
      return { kind: 'html', html: content, truncated };
    }
    if (ext === '.pptx') return { kind: 'slides', ...(await slides(file)) };
  } catch (err) {
    return { kind: 'none', reason: err instanceof Error ? err.message : 'could not be read' };
  }
  const buffer = readFileSync(file);
  if (isBinary(buffer)) return { kind: 'none', reason: 'no preview for this kind of file' };
  return { kind: 'text', ...cut(buffer.toString('utf8')) };
}
