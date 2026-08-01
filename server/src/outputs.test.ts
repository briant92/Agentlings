import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contentTypeFor, isBinary, listOutputs, safeOutputPath, SNIFF_BYTES } from './outputs';

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

describe('listOutputs', () => {
  it('is empty for a sandbox that was never created', () => {
    expect(listOutputs(path.join(dir, 'nope'))).toEqual([]);
  });

  it('inlines text and withholds binary', () => {
    writeFileSync(path.join(dir, 'RESULT.md'), '# Done\n');
    writeFileSync(path.join(dir, 'report.pdf'), PDF);
    const files = listOutputs(dir).sort((a, b) => (a.name < b.name ? -1 : 1));

    expect(files.map((f) => f.name)).toEqual(['RESULT.md', 'report.pdf']);
    expect(files[0]).toEqual({ name: 'RESULT.md', bytes: 7, binary: false, content: '# Done\n' });
    expect(files[1]).toEqual({ name: 'report.pdf', bytes: PDF.length, binary: true });
    // The point of the change: the bytes are not mangled into a string.
    expect(files[1].content).toBeUndefined();
  });

  it('skips directories and dotfiles', () => {
    mkdirSync(path.join(dir, 'repo'));
    writeFileSync(path.join(dir, '.hidden'), 'x');
    writeFileSync(path.join(dir, 'RESULT.md'), 'y');
    expect(listOutputs(dir).map((f) => f.name)).toEqual(['RESULT.md']);
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
