import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ocrImages, OCR_SCALE } from './ocr';

/**
 * Getting the data out of a document, in one place.
 *
 * Two callers want the same files for different reasons — the review panel
 * shows them (D-058) and the knowledge store indexes them (D-059, D-060) — and
 * a second copy of "how do you read a .pptx" is the duplication this log keeps
 * recording. So the formats are read here and shaped by whoever asked: this
 * module returns rows and lines, never a preview and never a passage.
 *
 * The libraries are installed at the project root for the sandboxes (D-031)
 * and imported lazily, so reading a folder of markdown loads none of them.
 */

export interface SheetData {
  name: string;
  /** Cells as text, in row order, first row first. */
  rows: string[][];
  /** What the sheet holds, so a caller that cut can say what it cut from. */
  totalRows: number;
  totalCols: number;
}

/**
 * A cell as text.
 *
 * exceljs hands back whatever the cell holds: a formula arrives as its
 * definition plus its last computed result, rich text as runs, a hyperlink as
 * a target and a caption. Both callers want the value someone would see in the
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
 * Every sheet of a workbook, as text.
 *
 * `maxRows` bounds what is built, not what is parsed — exceljs reads the whole
 * file whichever way, so this saves the shaping and not the read.
 */
export async function readSheets(file: string, maxRows = Infinity): Promise<SheetData[]> {
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  return book.worksheets.map((sheet) => {
    const rows: string[][] = [];
    for (let n = 1; n <= Math.min(sheet.rowCount, maxRows); n++) {
      const values = sheet.getRow(n).values;
      // 1-based and sparse: index 0 is never a cell, and a gap is a blank.
      const cells = Array.isArray(values) ? values.slice(1) : [];
      rows.push(Array.from({ length: sheet.columnCount }, (_, i) => cellText(cells[i])));
    }
    return { name: sheet.name, rows, totalRows: sheet.rowCount, totalCols: sheet.columnCount };
  });
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

/**
 * The text of each slide, in reading order.
 *
 * A .pptx is a zip of XML and comes apart with no library that renders one —
 * because nothing installed renders one. Paragraphs become lines and runs
 * within a paragraph are joined, which is what turns a title split across
 * three formatting runs back into a title.
 */
export async function readSlides(
  file: string,
  max = Infinity,
): Promise<{ slides: string[][]; total: number }> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(readFileSync(file));
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    // Numerically: slide10 sorts before slide2 as a string.
    .sort((a, b) => Number(/(\d+)/.exec(a)![1]) - Number(/(\d+)/.exec(b)![1]));
  const slides: string[][] = [];
  for (const name of names.slice(0, max)) {
    const xml = await zip.file(name)!.async('string');
    slides.push(
      xml
        .split('</a:p>')
        .map((para) => [...para.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(''))
        .filter((line) => line.trim() !== ''),
    );
  }
  return { slides, total: names.length };
}

/** A Word document as HTML, for showing. Its own text is escaped by mammoth. */
export async function docxHtml(file: string): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  return (await mammoth.convertToHtml({ buffer: readFileSync(file) })).value;
}

/** A Word document as plain text, for indexing. */
export async function docxText(file: string): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  return (await mammoth.extractRawText({ path: file })).value;
}

/**
 * A PDF as plain text.
 *
 * `PDFParse` is a class, not the function it used to be — the shape the crew's
 * own briefing spells out because guessing it costs a turn (D-031). A PDF that
 * is a scan of paper holds pictures of words and comes back empty; `ocrPdf`
 * below is what answers that case, and the caller decides when to reach for it
 * because reading pixels costs a thousand times what reading a text layer does.
 */
export async function pdfText(file: string): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const { text } = await new PDFParse({ data: readFileSync(file) }).getText();
  // `-- 1 of 1 --` between pages is the reader talking, not the document, and
  // it rode into an indexed passage until a real PDF was read back (D-059).
  return text.replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gm, '');
}

/**
 * A PDF with no text layer, read off the pixels.
 *
 * The rasteriser was already here: `pdf-parse` carries `pdfjs-dist` and
 * `@napi-rs/canvas` as its own dependencies, both prebuilt, so turning a page
 * into an image cost no new install at all — measured at about 130ms a page.
 *
 * Pages are written to a temp folder because the engine takes file paths, and
 * the whole folder goes at the end whatever happens.
 */
export async function ocrPdf(
  file: string,
  maxPages: number,
): Promise<{ text: string; pages: number; total: number }> {
  const { PDFParse } = await import('pdf-parse');
  const shot = await new PDFParse({ data: readFileSync(file) }).getScreenshot({
    scale: OCR_SCALE,
    first: maxPages,
  });
  const dir = mkdtempSync(path.join(tmpdir(), 'agentlings-pages-'));
  try {
    const images = shot.pages.map((page, i) => {
      const image = path.join(dir, `p${i + 1}.png`);
      writeFileSync(image, page.data);
      return image;
    });
    const read = await ocrImages(images);
    // `total` is what the document holds, against `pages` which is what the
    // budget allowed. The caller needs both, or a 50-page contract read to
    // page 20 is a silent cut — and every other cap here is reported.
    return {
      text: read.map((page) => page.text ?? '').join('\n'),
      pages: images.length,
      total: shot.total,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A photograph or a screenshot, read the same way a scanned page is. */
export async function imageText(file: string): Promise<string> {
  const [page] = await ocrImages([file]);
  return page?.text ?? '';
}
