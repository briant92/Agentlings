import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GRID_ROWS, parseCsv, previewFile, sanitizeHtml } from './preview';

/**
 * Fixtures are written by the same libraries the crew writes with, rather than
 * checked in as bytes. A hand-built .docx proves the parser and not the thing
 * being claimed — that what an agentling produces can be previewed.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'agentlings-preview-'));
});
// rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
afterEach(() =>
  rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
);

async function writeDocx(name: string, paragraphs: string[]): Promise<string> {
  const { Document, Packer, Paragraph } = await import('docx');
  const doc = new Document({
    sections: [{ children: paragraphs.map((text) => new Paragraph(text)) }],
  });
  const file = path.join(dir, name);
  writeFileSync(file, await Packer.toBuffer(doc));
  return file;
}

async function writeXlsx(name: string, rows: unknown[][], sheet = 'Sheet1'): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet(sheet);
  for (const row of rows) ws.addRow(row);
  const file = path.join(dir, name);
  await book.xlsx.writeFile(file);
  return file;
}

async function writePptx(name: string, slides: string[][]): Promise<string> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const deck = new PptxGenJS();
  for (const lines of slides) {
    const slide = deck.addSlide();
    lines.forEach((line, i) => slide.addText(line, { x: 0.5, y: 0.5 + i, w: 8, h: 0.8 }));
  }
  const file = path.join(dir, name);
  await deck.writeFile({ fileName: file });
  return file;
}

describe('previewFile', () => {
  it('reads a .docx the crew wrote back as words', async () => {
    const preview = await previewFile(await writeDocx('report.docx', ['Findings', 'Three of them']));
    expect(preview.kind).toBe('html');
    if (preview.kind !== 'html') return;
    expect(preview.html).toContain('Findings');
    expect(preview.html).toContain('Three of them');
    expect(preview.truncated).toBe(false);
  });

  it('reads a .xlsx as a grid, and says how much it left out', async () => {
    const rows = Array.from({ length: GRID_ROWS + 20 }, (_, i) => [`SKU-${i}`, i * 2]);
    const preview = await previewFile(await writeXlsx('prices.xlsx', [['sku', 'unit'], ...rows], 'Q3'));
    expect(preview.kind).toBe('grid');
    if (preview.kind !== 'grid') return;
    const [sheet] = preview.sheets;
    expect(sheet.name).toBe('Q3');
    expect(sheet.rows[0]).toEqual(['sku', 'unit']);
    expect(sheet.rows[1]).toEqual(['SKU-0', '0']);
    // The cut is bounded and stated: what is shown, against what is there.
    expect(sheet.rows).toHaveLength(GRID_ROWS);
    expect(sheet.totalRows).toBe(GRID_ROWS + 21);
  });

  it('reads every sheet, not just the first', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const book = new ExcelJS.Workbook();
    book.addWorksheet('one').addRow(['a']);
    book.addWorksheet('two').addRow(['b']);
    const file = path.join(dir, 'two-sheets.xlsx');
    await book.xlsx.writeFile(file);
    const preview = await previewFile(file);
    expect(preview.kind === 'grid' && preview.sheets.map((s) => s.name)).toEqual(['one', 'two']);
  });

  it('reads a .pptx as slide text, in slide order', async () => {
    const preview = await previewFile(
      await writePptx('deck.pptx', [['Q3 pricing'], ['Three suppliers', 'Meridian leads']]),
    );
    expect(preview.kind).toBe('slides');
    if (preview.kind !== 'slides') return;
    expect(preview.total).toBe(2);
    expect(preview.slides[0]).toEqual({ n: 1, lines: ['Q3 pricing'] });
    expect(preview.slides[1].lines).toEqual(['Three suppliers', 'Meridian leads']);
  });

  it('leaves a PDF to the browser rather than converting it', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage();
    const file = path.join(dir, 'contract.pdf');
    writeFileSync(file, await doc.save());
    expect(await previewFile(file)).toEqual({ kind: 'native', contentType: 'application/pdf' });
  });

  it('parses a .csv into the same grid a spreadsheet gets', async () => {
    const file = path.join(dir, 'prices.csv');
    writeFileSync(file, 'sku,supplier\nAX-1,"Meridian, Ltd"\n');
    const preview = await previewFile(file);
    expect(preview.kind === 'grid' && preview.sheets[0].rows).toEqual([
      ['sku', 'supplier'],
      ['AX-1', 'Meridian, Ltd'],
    ]);
  });

  it('still inlines plain text', async () => {
    const file = path.join(dir, 'RESULT.md');
    writeFileSync(file, '## What I did\n');
    expect(await previewFile(file)).toEqual({
      kind: 'text',
      content: '## What I did\n',
      truncated: false,
    });
  });

  it('answers a half-written document instead of throwing', async () => {
    // What a run that died mid-write leaves: the name of a spreadsheet on
    // something no reader can open.
    const file = path.join(dir, 'broken.xlsx');
    writeFileSync(file, 'this is not a zip');
    const preview = await previewFile(file);
    expect(preview.kind).toBe('none');
    expect(preview.kind === 'none' && preview.reason).toBeTruthy();
  });

  it('offers no preview for a binary it cannot convert', async () => {
    const file = path.join(dir, 'blob.bin');
    writeFileSync(file, Buffer.from([0x00, 0x01, 0x02]));
    expect(await previewFile(file)).toEqual({
      kind: 'none',
      reason: 'no preview for this kind of file',
    });
  });
});

describe('sanitizeHtml', () => {
  it('keeps the words and drops everything else', () => {
    expect(sanitizeHtml('<p class="x">hi <strong>there</strong></p>')).toBe(
      '<p>hi <strong>there</strong></p>',
    );
    expect(sanitizeHtml('<script>alert(1)</script>')).toBe('alert(1)');
    expect(sanitizeHtml('<img src="data:image/png;base64,AAAA">')).toBe('');
  });

  it('lets a web link through and defuses everything else', () => {
    expect(sanitizeHtml('<a href="https://example.com">ref</a>')).toBe(
      '<a href="https://example.com">ref</a>',
    );
    expect(sanitizeHtml('<a href="javascript:alert(1)">click</a>')).toBe('<a>click</a>');
    expect(sanitizeHtml('<a href="file:///etc/passwd">x</a>')).toBe('<a>x</a>');
  });

  it('strips a link a document author put there, through the real converter', async () => {
    // The attack surface is not what the document says — mammoth escapes that
    // — it is what the document links to, which travels into an href intact.
    const { Document, Packer, Paragraph, ExternalHyperlink, TextRun } = await import('docx');
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new ExternalHyperlink({
                  children: [new TextRun('press me')],
                  link: 'javascript:alert(1)',
                }),
              ],
            }),
          ],
        },
      ],
    });
    const file = path.join(dir, 'trap.docx');
    writeFileSync(file, await Packer.toBuffer(doc));
    const preview = await previewFile(file);
    expect(preview.kind === 'html' && preview.html).toContain('press me');
    expect(preview.kind === 'html' && preview.html).not.toContain('javascript:');
  });
});

describe('parseCsv', () => {
  it('handles quotes, embedded commas and doubled quotes', () => {
    expect(parseCsv('a,"b,c","say ""hi"""')).toEqual([['a', 'b,c', 'say "hi"']]);
  });
});
