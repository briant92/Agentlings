import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pdfText } from './documents';
import { ocrAvailable } from './ocr';
import {
  MAX_ENTRY_CHARS,
  MAX_OCR_PAGES_PER_FILE,
  MAX_OCR_PAGES_PER_SYNC,
  MAX_PASSAGES_PER_FILE,
  MAX_PER_SOURCE,
  STALE_MS,
  asLine,
  hasTextLayer,
  isStale,
  looksLikeHeader,
  passages,
  rowLine,
  readIndex,
  storeLines,
  sync,
  writeIndex,
} from './store';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 2);

/**
 * The OCR tests run where there is an engine and are skipped where there is
 * not, rather than failing. Windows-only is the accepted cost of D-061, and a
 * suite that goes red on a Mac would be reporting the platform, not a fault.
 */
const hasOcr = await ocrAvailable();

describe('passages', () => {
  it('splits a document at its headings', () => {
    const out = passages('# Deploy\nRun the script.\n\n## Rollback\nRevert the tag.');
    expect(out).toEqual(['# Deploy Run the script.', '## Rollback Revert the tag.']);
  });

  // The heading is usually the only place the subject is named. Dropping it
  // makes a section about the retry logic score zero against "retry".
  it('keeps the heading with its own section', () => {
    expect(passages('# Retry logic\nIt backs off.')[0]).toContain('Retry logic');
  });

  it('treats a file with no headings as one passage', () => {
    expect(passages('just some notes\nover two lines')).toEqual(['just some notes over two lines']);
  });

  it('drops empty sections rather than indexing blanks', () => {
    expect(passages('\n\n   \n')).toEqual([]);
  });

  it('cuts a long section into passages rather than keeping only its start', () => {
    const body = 'word '.repeat(500);
    const out = passages(`# Big\n${body}`);
    expect(out.length).toBeGreaterThan(1);
    for (const p of out) expect(p.length).toBeLessThanOrEqual(MAX_ENTRY_CHARS);
    // The point of the change: what a section says past its first 600
    // characters is searchable. Measured before it: a 2,974-character text
    // file indexed as one passage holding 633 characters.
    const kept = out.reduce((n, p) => n + p.length, 0);
    expect(kept).toBeGreaterThan(body.length * 0.9);
  });

  it('cuts at a sentence end where there is one', () => {
    const sentence = `${'a'.repeat(200)}. `;
    const [first] = passages(sentence.repeat(6));
    expect(first.endsWith('.')).toBe(true);
  });

  // A document has no `#` headings at all, so without the length rule above
  // the whole of one would be a single passage — which is what "text files
  // only" was quietly doing to .txt already.
  it('splits flat prose that has no headings', () => {
    const flat = 'Supplier pricing held steady. '.repeat(120);
    const out = passages(flat);
    expect(out.length).toBeGreaterThan(3);
    expect(out.reduce((n, p) => n + p.length, 0)).toBeGreaterThan(flat.length * 0.9);
  });
});

describe('sync', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-store-'));
  });
  // rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  const write = (rel: string, text: string): void => {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  };

  it('indexes markdown and text, and stamps each entry', async () => {
    write('notes.md', '# Deploy\nRun the script.');
    write('plain.txt', 'a loose note');
    const index = await sync([root], NOW);

    expect(index.entries).toHaveLength(2);
    expect(index.entries.every((e) => e.syncedAt === NOW)).toBe(true);
    expect(index.entries.map((e) => e.source).sort()).toEqual(['notes.md', 'plain.txt']);
  });

  it('walks subfolders and records a readable relative source', async () => {
    write('team/onboarding/day-one.md', '# Day one\nGet a laptop.');
    expect((await sync([root], NOW)).entries[0].source).toBe('team/onboarding/day-one.md');
  });

  // `.bmp` rather than `.png` since D-061: a picture of words is now something
  // this store reads, so the file that stands for "not ours" has to be one
  // that really is not.
  it('ignores files it cannot read as prose', async () => {
    write('notes.md', '# Keep\nthis');
    write('photo.bmp', 'binary-ish');
    write('script.js', 'export const x = 1;');
    expect((await sync([root], NOW)).entries.map((e) => e.source)).toEqual(['notes.md']);
  });

  it('skips dotfolders and node_modules rather than indexing a dependency tree', async () => {
    write('notes.md', '# Keep\nthis');
    write('node_modules/pkg/README.md', '# Nope\nnot yours');
    write('.git/COMMIT_EDITMSG', 'nope');
    expect((await sync([root], NOW)).entries).toHaveLength(1);
  });

  // A path the user typed is the likeliest thing to be wrong, and one bad line
  // should not cost them the rest of their notes.
  it('skips a source that does not exist instead of failing the sync', async () => {
    write('notes.md', '# Keep\nthis');
    const index = await sync([path.join(root, 'no-such-folder'), root], NOW);
    expect(index.entries).toHaveLength(1);
  });

  // Written by the libraries the crew writes with, not checked in as bytes: a
  // hand-built fixture would prove the reader rather than the thing claimed,
  // which is that material you actually have can be read.
  it('reads a Word document', async () => {
    const { Document, Packer, Paragraph } = await import('docx');
    writeFileSync(
      path.join(root, 'policy.docx'),
      await Packer.toBuffer(
        new Document({
          sections: [
            { children: [new Paragraph('Expenses over 200 need a second approver.')] },
          ],
        }),
      ),
    );
    const index = await sync([root], NOW);
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0].text).toContain('second approver');
    expect(index.entries[0].source).toBe('policy.docx');
  });

  it('reads a PDF', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc
      .addPage()
      .drawText('Meridian lead time is 14 days.', {
        x: 50,
        y: 700,
        size: 12,
        font: await doc.embedFont(StandardFonts.Helvetica),
      });
    doc
      .addPage()
      .drawText('Calder lead time is 9 days.', {
        x: 50,
        y: 700,
        size: 12,
        font: await doc.embedFont(StandardFonts.Helvetica),
      });
    writeFileSync(path.join(root, 'supplier.pdf'), await doc.save());
    const index = await sync([root], NOW);
    const text = index.entries.map((e) => e.text).join(' ');
    expect(text).toContain('Meridian lead time is 14 days');
    expect(text).toContain('Calder lead time is 9 days');
    expect(index.entries[0].source).toBe('supplier.pdf');
    // The reader's own page separator is not something the document said, and
    // it was riding into the passage — caught by indexing a real PDF and
    // reading the entry back, not by this test, which used to pass with it in.
    expect(text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/);
  });

  // A grid shares no words with a question. What makes a row findable is the
  // sheet name and the column names travelling with it, on every row, because
  // a long sheet is cut into passages wherever the length runs out.
  it('reads a spreadsheet as rows that name their own columns', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const book = new ExcelJS.Workbook();
    const ws = book.addWorksheet('Q3 prices');
    ws.addRow(['sku', 'supplier', 'unit']);
    ws.addRow(['AX-114', 'Meridian', 12.4]);
    ws.addRow(['BR-201', 'Calder', 8.75]);
    await book.xlsx.writeFile(path.join(root, 'prices.xlsx'));

    const index = await sync([root], NOW);
    const text = index.entries.map((e) => e.text).join(' ');
    expect(text).toContain('Q3 prices — sku=AX-114, supplier=Meridian, unit=12.4');
    expect(text).toContain('supplier=Calder');
    // The header row is what labels the others, not a row of its own.
    expect(text).not.toContain('sku=sku');
    expect(index.entries[0].source).toBe('prices.xlsx');
  });

  it('reads a deck a slide at a time', async () => {
    const PptxGenJS = (await import('pptxgenjs')).default;
    const deck = new PptxGenJS();
    deck.addSlide().addText('Warranty summary', { x: 1, y: 1, w: 8, h: 1 });
    const second = deck.addSlide();
    second.addText('Renewal dates', { x: 1, y: 1, w: 8, h: 1 });
    second.addText('The dishwasher runs to March 2028', { x: 1, y: 2, w: 8, h: 1 });
    await deck.writeFile({ fileName: path.join(root, 'review.pptx') });

    const index = await sync([root], NOW);
    // A slide is a unit of thought, so it is a passage — the heading rule
    // markdown gets for free, with the slide's own title as the heading.
    expect(index.entries).toHaveLength(2);
    expect(index.entries[0].text).toBe('# Warranty summary');
    expect(index.entries[1].text).toBe('# Renewal dates The dishwasher runs to March 2028');
    expect(index.entries[1].source).toBe('review.pptx');
    // Read back from a live index once: a synthetic `# Slide 2` label was
    // sitting in the recall answer where the document's words belong, and
    // `slide` would have scored against every deck in the folder.
    expect(index.entries.every((e) => !/Slide \d/.test(e.text))).toBe(true);
  });

  /**
   * A page of "paper": words painted as pixels, so the PDF carries no text
   * layer at all — which is what `getText` returning nothing actually means.
   */
  async function writeScan(name: string, lines: string[]): Promise<void> {
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(1240, 1754);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 1240, 1754);
    g.fillStyle = '#111';
    let y = 180;
    for (const line of lines) {
      g.font = '30px Arial';
      g.fillText(line, 100, y);
      y += 60;
    }
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const image = await doc.embedPng(canvas.toBuffer('image/png'));
    doc.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
    writeFileSync(path.join(root, name), await doc.save());
  }

  it.runIf(hasOcr)('reads a scanned PDF that has no text in it', async () => {
    await writeScan('scan.pdf', ['Boiler service record', 'Invoice 88213 attended 14 October 2025']);
    // The premise, checked rather than assumed: this really is a scan.
    expect(hasTextLayer(await pdfText(path.join(root, 'scan.pdf')))).toBe(false);

    const index = await sync([root], NOW);
    const text = index.entries.map((e) => e.text).join(' ');
    expect(text).toContain('88213');
    expect(text).toContain('Boiler service record');
    expect(index.scanned).toBe(1);
    expect(index.unscanned).toBe(0);
  });

  it.runIf(hasOcr)('marks a scanned passage as read from a scan, on the line', async () => {
    await writeScan('scan.pdf', ['Next service due October 2026']);
    const index = await sync([root], NOW);
    // OCR is a good guess, not the document's own words, and this line is
    // quoted verbatim into answers and briefings.
    expect(asLine(index.entries[0])).toContain('scan.pdf, read from a scan, synced');
  });

  it.runIf(hasOcr)('reads a photograph the same way', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(900, 400);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 900, 400);
    g.fillStyle = '#111';
    g.font = '40px Arial';
    g.fillText('Meter reading 40821 on 3 March', 40, 120);
    writeFileSync(path.join(root, 'meter.png'), canvas.toBuffer('image/png'));
    const index = await sync([root], NOW);
    expect(index.entries[0].text).toContain('40821');
    expect(index.entries[0].scanned).toBe(true);
  });

  /**
   * The case the threshold exists for, and the one the fixtures above missed:
   * a scan that also carries a stamp added digitally. `getText` then returns
   * something, so "does this have a text layer" cannot mean "not empty" — the
   * whole 40-page document would index as the word "Confidential".
   *
   * Written because a mutation survived: relaxing the threshold to
   * `text.length > 0` broke nothing, since every scan fixture had a text layer
   * of exactly nothing.
   */
  it.runIf(hasOcr)('reads a scan that carries a stamp of real text', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(1240, 1754);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 1240, 1754);
    g.fillStyle = '#111';
    g.font = '30px Arial';
    g.fillText('Meter serial 40821 replaced on 3 March 2026', 100, 300);

    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const image = await doc.embedPng(canvas.toBuffer('image/png'));
    const page = doc.addPage([595, 842]);
    page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
    page.drawText('CONFIDENTIAL', {
      x: 40,
      y: 30,
      size: 10,
      font: await doc.embedFont(StandardFonts.Helvetica),
    });
    writeFileSync(path.join(root, 'stamped.pdf'), await doc.save());

    // A text layer, and worth nothing: this is the trap.
    const layer = await pdfText(path.join(root, 'stamped.pdf'));
    expect(layer).toContain('CONFIDENTIAL');
    expect(hasTextLayer(layer)).toBe(false);

    const index = await sync([root], NOW);
    expect(index.scanned).toBe(1);
    expect(index.entries.map((e) => e.text).join(' ')).toContain('40821');
  });

  /**
   * Both faults here were found by reading the panel copy back against the
   * code, not by a failing test.
   *
   * A long scan was read as far as the per-file budget and nothing said so —
   * the one cap in the store that reported nothing. And the sync was charged
   * the *allowance* rather than the pages it used, so a one-page receipt cost
   * as much as a twenty-page report and a folder of short scans stopped being
   * read after ten of them.
   */
  it.runIf(hasOcr)('says when a scan was longer than it could read', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    for (let n = 1; n <= MAX_OCR_PAGES_PER_FILE + 3; n++) {
      const canvas = createCanvas(600, 850);
      const g = canvas.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 600, 850);
      g.fillStyle = '#111';
      g.font = '28px Arial';
      g.fillText(`Clause ${n} of the agreement`, 40, 120);
      const image = await doc.embedPng(canvas.toBuffer('image/png'));
      doc.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
    }
    writeFileSync(path.join(root, 'contract.pdf'), await doc.save());

    const index = await sync([root], NOW);
    expect(index.scanned).toBe(1);
    expect(index.scanCut).toBe(1);
  }, 120_000);

  it.runIf(hasOcr)('charges the sync the pages it read, not the pages it allowed', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const { PDFDocument } = await import('pdf-lib');
    // Enough one-page scans that charging the full per-file allowance would
    // exhaust the sync budget and leave the tail unread.
    const many = Math.floor(MAX_OCR_PAGES_PER_SYNC / MAX_OCR_PAGES_PER_FILE) + 3;
    for (let n = 1; n <= many; n++) {
      const canvas = createCanvas(600, 850);
      const g = canvas.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 600, 850);
      g.fillStyle = '#111';
      g.font = '30px Arial';
      g.fillText(`Receipt number ${1000 + n}`, 40, 120);
      const doc = await PDFDocument.create();
      const image = await doc.embedPng(canvas.toBuffer('image/png'));
      doc.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
      writeFileSync(path.join(root, `receipt-${n}.pdf`), await doc.save());
    }

    const index = await sync([root], NOW);
    expect(index.scanned).toBe(many);
    expect(index.unscanned).toBe(0);
  }, 120_000);

  it('leaves a text layer alone rather than re-reading it off pixels', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage().drawText('Meridian lead time is 14 days and the contract renews in March.', {
      x: 40,
      y: 700,
      size: 12,
      font: await doc.embedFont(StandardFonts.Helvetica),
    });
    writeFileSync(path.join(root, 'typed.pdf'), await doc.save());
    const index = await sync([root], NOW);
    // Exact, instant and free; OCR of the same page would be a worse copy.
    expect(index.entries[0].scanned).toBeUndefined();
    expect(index.scanned).toBe(0);
    expect(index.entries[0].text).toContain('Meridian lead time is 14 days');
  });

  // An encrypted PDF, or a .docx that is really a renamed something-else. It
  // should cost its own passages and no more.
  it('skips a document it cannot read without losing the rest of the folder', async () => {
    write('notes.md', '# Keep\nthis');
    writeFileSync(path.join(root, 'broken.docx'), 'not a zip');
    const index = await sync([root], NOW);
    expect(index.entries.map((e) => e.source)).toEqual(['notes.md']);
  });

  it('reads a long file only as far as the cap, and says it did', async () => {
    write('long.txt', 'A sentence that carries an idea. '.repeat(6000));
    const index = await sync([root], NOW);
    expect(index.entries).toHaveLength(MAX_PASSAGES_PER_FILE);
    expect(index.truncated).toBe(1);
  });

  it('counts nothing truncated when nothing was', async () => {
    write('short.md', '# Small\nbody');
    expect((await sync([root], NOW)).truncated).toBe(0);
  });

  // Reported, never hidden: a store that quietly indexed half your notes would
  // answer confidently from the half it had.
  it('caps a source and says how many it left', async () => {
    for (let i = 0; i < MAX_PER_SOURCE + 5; i++) write(`n${i}.md`, `# N${i}\nbody`);
    const index = await sync([root], NOW);
    expect(index.skipped).toBe(5);
    expect(new Set(index.entries.map((e) => e.source)).size).toBe(MAX_PER_SOURCE);
  });
});

describe('reading a grid as prose', () => {
  it('labels each value with its column, and drops the blanks', () => {
    expect(rowLine('Prices', ['sku', 'supplier', 'unit'], ['AX-114', '', '12.40'])).toBe(
      'Prices — sku=AX-114, unit=12.40',
    );
  });

  it('keeps bare values when there are no column names', () => {
    expect(rowLine('Notes', [], ['boiler', 'October'])).toBe('Notes — boiler, October');
  });

  it('says nothing about an empty row rather than naming it', () => {
    expect(rowLine('Prices', ['sku'], ['', ''])).toBe('');
  });

  // One number in the top row and it is data. Labelling the rest under it
  // would attach `12.40=13.05` to every line of the sheet — a confident
  // falsehood in every passage, which is worse than no labels at all.
  it('tells a header row from a first row of data', () => {
    expect(looksLikeHeader(['sku', 'supplier', 'unit'])).toBe(true);
    expect(looksLikeHeader(['AX-114', 'Meridian', '12.40'])).toBe(false);
    expect(looksLikeHeader(['sku', 'supplier', '12.40'])).toBe(false);
    expect(looksLikeHeader([])).toBe(false);
    expect(looksLikeHeader(undefined)).toBe(false);
  });
});

describe('a line carries where it came from', () => {
  // Provenance rides inside the line so the recall tier and the session prompt
  // both get it without either knowing a store exists.
  it('names the file and the date it was read', () => {
    expect(asLine({ text: 'Deploys run on Fridays.', source: 'ops/deploy.md', syncedAt: NOW })).toBe(
      'Deploys run on Fridays. [ops/deploy.md, synced 2026-08-02]',
    );
  });
});

describe('staleness', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-level-'));
  });
  afterEach(() =>
    rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  const indexed = (syncedAt: number): void =>
    writeIndex(dir, {
      sources: ['/notes'],
      syncedAt,
      entries: [{ text: 'Deploys run on Fridays.', source: 'ops/deploy.md', syncedAt }],
      skipped: 0,
    });

  it('serves a fresh index', () => {
    indexed(NOW - DAY);
    expect(storeLines(dir, NOW)).toHaveLength(1);
  });

  /**
   * The staleness guard, and the reason it is a single rule in a single place:
   * a stale index contributes *nothing*, so the free tier has nothing to match
   * and the job falls through to a session that can go and look. Serving a
   * stale page for free is the failure D-045 caught the first compiled tool
   * committing, and two copies of this rule would eventually disagree.
   */
  it('contributes nothing at all once it is stale', () => {
    indexed(NOW - STALE_MS - 1);
    expect(storeLines(dir, NOW)).toEqual([]);
  });

  it('has nothing to say before anything is indexed', () => {
    expect(storeLines(dir, NOW)).toEqual([]);
  });

  it('treats a torn index as a missing one rather than crashing', () => {
    writeFileSync(path.join(dir, 'store-index.json'), '{ not json');
    expect(readIndex(dir)).toBeNull();
    expect(storeLines(dir, NOW)).toEqual([]);
  });

  it('measures staleness from when it was synced', () => {
    const index = { sources: [], syncedAt: NOW, entries: [], skipped: 0 };
    expect(isStale(index, NOW + STALE_MS - 1)).toBe(false);
    expect(isStale(index, NOW + STALE_MS + 1)).toBe(true);
  });
});
