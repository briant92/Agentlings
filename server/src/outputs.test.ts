import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  contentTypeFor,
  describeOutputs,
  isBinary,
  opensInBrowser,
  producedArtefacts,
  safeAttachmentName,
  safeOutputPath,
  SNIFF_BYTES,
} from './outputs';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'agentlings-outputs-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** The first bytes of a real PDF, NUL included — the shape that used to break. */
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0x0a, 0xff, 0xfe]);

/**
 * The opening of a PDF written by hand with uncompressed streams — no NUL
 * anywhere, and a Latin-1 binary marker that is not valid UTF-8.
 *
 * Taken from one an agentling actually produced. The fixture above has a NUL
 * in it by construction, so it only ever proved the heuristic; this is the
 * shape that got through and was inlined as mojibake.
 */
const HANDWRITTEN_PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n%', 'latin1'),
  Buffer.from([0xe2, 0xe3, 0xcf, 0xd3]),
  Buffer.from('\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'latin1'),
]);

describe('isBinary', () => {
  it('accepts text, including accents and emoji', () => {
    expect(isBinary(Buffer.from('# Result\n\nDone — café 🎉\n', 'utf8'))).toBe(false);
  });

  it('spots a NUL byte', () => {
    expect(isBinary(PDF)).toBe(true);
  });

  it('spots a NUL-free PDF by its invalid UTF-8', () => {
    expect(HANDWRITTEN_PDF.includes(0)).toBe(false); // the reason the old test passed
    expect(isBinary(HANDWRITTEN_PDF)).toBe(true);
  });

  it('does not mistake a multi-byte character straddling the sniff window', () => {
    // Filler up to the window, then an em dash split across the boundary.
    const long = Buffer.concat([
      Buffer.from('a'.repeat(SNIFF_BYTES - 1), 'utf8'),
      Buffer.from('—', 'utf8'),
      Buffer.from('tail', 'utf8'),
    ]);
    expect(isBinary(long)).toBe(false);
  });

  it('treats an empty file as text', () => {
    expect(isBinary(Buffer.alloc(0))).toBe(false);
  });

  it('ignores a NUL far past the sniff window', () => {
    const late = Buffer.concat([Buffer.alloc(9000, 0x41), Buffer.from([0])]);
    expect(isBinary(late)).toBe(false);
  });
});

describe('describeOutputs', () => {
  it('is empty for a sandbox that was never created', () => {
    expect(describeOutputs(path.join(dir, 'nope'))).toEqual([]);
  });

  it('names and sizes every file, whatever is in it', () => {
    writeFileSync(path.join(dir, 'RESULT.md'), '# Done\n');
    writeFileSync(path.join(dir, 'report.pdf'), PDF);
    const files = describeOutputs(dir).sort((a, b) => (a.name < b.name ? -1 : 1));

    // No contents at any size: a listing says what is there, and reading one
    // is a separate request for one file.
    expect(files).toEqual([
      { name: 'RESULT.md', bytes: 7 },
      { name: 'report.pdf', bytes: PDF.length },
    ]);
  });

  it('skips directories and dotfiles', () => {
    mkdirSync(path.join(dir, 'repo'));
    writeFileSync(path.join(dir, '.hidden'), 'x');
    writeFileSync(path.join(dir, 'RESULT.md'), 'y');
    expect(describeOutputs(dir).map((f) => f.name)).toEqual(['RESULT.md']);
  });
});

// Decides whether a repeat may be answered from memory. Words can be replayed;
// a file cannot, and describing it again produces nothing.
describe('producedArtefacts', () => {
  it('is false for a run that only reported', () => {
    writeFileSync(path.join(dir, 'RESULT.md'), '# Done\n');
    writeFileSync(path.join(dir, 'LESSON.md'), '- something\n');
    writeFileSync(path.join(dir, 'APPROACH.md'), 'do this\n');
    expect(producedArtefacts(dir)).toBe(false);
  });

  it('is true once the run made something', () => {
    writeFileSync(path.join(dir, 'RESULT.md'), '# Done\n');
    writeFileSync(path.join(dir, 'hello-world.pdf'), '%PDF-1.7\n');
    expect(producedArtefacts(dir)).toBe(true);
  });

  it('counts a diff as something made', () => {
    writeFileSync(path.join(dir, 'DIFF.patch'), 'diff --git a/x b/x\n');
    expect(producedArtefacts(dir)).toBe(true);
  });

  it('is false for an empty sandbox', () => {
    expect(producedArtefacts(dir)).toBe(false);
  });
});

describe('safeOutputPath', () => {
  beforeEach(() => {
    writeFileSync(path.join(dir, 'RESULT.md'), 'ok');
    mkdirSync(path.join(dir, 'repo'));
  });

  it('resolves a plain filename', () => {
    expect(safeOutputPath(dir, 'RESULT.md')).toBe(path.join(dir, 'RESULT.md'));
  });

  it('refuses to climb out of the sandbox', () => {
    for (const name of [
      '..',
      '../jobs.json',
      '..\\jobs.json',
      'repo/../../jobs.json',
      '/etc/passwd',
      'C:\\Windows\\win.ini',
    ]) {
      expect(safeOutputPath(dir, name)).toBeNull();
    }
  });

  it('refuses a directory, a missing file, and an empty name', () => {
    expect(safeOutputPath(dir, 'repo')).toBeNull();
    expect(safeOutputPath(dir, 'nothing-here.md')).toBeNull();
    expect(safeOutputPath(dir, '')).toBeNull();
  });
});

// The name arrives from a browser, which is to say from anywhere, and this is
// the one place a caller chooses what a file is called on disk.
describe('safeAttachmentName', () => {
  it('keeps an ordinary filename', () => {
    expect(safeAttachmentName('contract.pdf')).toBe('contract.pdf');
    expect(safeAttachmentName('Q3 report (final).xlsx')).toBe('Q3 report (final).xlsx');
  });

  it('strips any directory part, on either platform', () => {
    expect(safeAttachmentName('../../etc/passwd')).toBe('passwd');
    expect(safeAttachmentName('C:\\Windows\\System32\\drivers\\etc\\hosts')).toBe('hosts');
    expect(safeAttachmentName('nested/dir/report.docx')).toBe('report.docx');
  });

  it('refuses names that resolve to nothing usable', () => {
    for (const bad of ['', '   ', '.', '..', 'dir/', 'a\0b']) {
      expect(safeAttachmentName(bad)).toBeNull();
    }
  });

  it('refuses a dotfile, which every listing would hide', () => {
    expect(safeAttachmentName('.env')).toBeNull();
    expect(safeAttachmentName('/tmp/.hidden')).toBeNull();
  });
});

describe('contentTypeFor', () => {
  it('names the document types a job might actually produce', () => {
    expect(contentTypeFor('report.pdf')).toBe('application/pdf');
    expect(contentTypeFor('Notes.DOCX')).toContain('wordprocessingml');
    expect(contentTypeFor('sheet.xlsx')).toContain('spreadsheetml');
  });

  it('falls back to a download rather than guessing', () => {
    expect(contentTypeFor('DIFF.patch')).toBe('application/octet-stream');
    expect(contentTypeFor('noextension')).toBe('application/octet-stream');
  });
});

// Decides the Content-Disposition, and that is the whole trick: served as an
// attachment a PDF downloads instead of appearing in the review panel's frame.
describe('opensInBrowser', () => {
  it('is true for a PDF, whatever the case of the name', () => {
    expect(opensInBrowser('hello-world.pdf')).toBe(true);
    expect(opensInBrowser('Report.PDF')).toBe(true);
  });

  it('is false for the Office formats, which have no native viewer', () => {
    for (const name of ['notes.docx', 'sheet.xlsx', 'deck.pptx', 'DIFF.patch', 'archive.zip']) {
      expect(opensInBrowser(name)).toBe(false);
    }
  });
});
