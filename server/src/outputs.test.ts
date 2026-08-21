import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeliveryFile } from '@agentlings/shared';
import {
  attachedFiles,
  contentTypeFor,
  deliveredFiles,
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
// rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
afterEach(() =>
  rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
);

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

  /**
   * The provenance half (D-202). A continuation begins with its parent's
   * whole sandbox copied in, so "there is a PDF in the sandbox" says nothing
   * about whether this run made it — and a promoted delivery once carried
   * one byte-identical to a render two legs older under a report claiming it
   * had been re-rendered.
   */
  describe('against the leg it continues', () => {
    let previous: string;
    beforeEach(() => {
      previous = mkdtempSync(path.join(tmpdir(), 'agentlings-previous-'));
    });
    afterEach(() =>
      rm(previous, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(
        () => {},
      ),
    );
    const find = (files: DeliveryFile[], name: string) => files.find((f) => f.name === name);

    it('marks the inherited file carried and the rewritten one not', () => {
      writeFileSync(path.join(previous, 'plan.pdf'), PDF);
      writeFileSync(path.join(previous, 'notes.md'), 'first\n');
      writeFileSync(path.join(dir, 'plan.pdf'), PDF); // copied forward, untouched
      writeFileSync(path.join(dir, 'notes.md'), 'second\n'); // rewritten this run
      const files = describeOutputs(dir, previous);
      expect(find(files, 'plan.pdf')?.carried).toBe(true);
      expect(find(files, 'notes.md')?.carried).toBe(false);
    });

    /**
     * The case that makes hashing necessary. A rewrite that lands on the same
     * length is exactly the shape a re-render produces — same page, same
     * generator, different bytes — and the timestamps cannot help: the carry
     * copies with `cpSync`, which does not preserve them, so every inherited
     * file's mtime is the moment the sandbox was built.
     */
    it('compares the bytes, not the size', () => {
      const before = Buffer.from([1, 2, 3, 4]);
      const after = Buffer.from([1, 2, 3, 5]);
      writeFileSync(path.join(previous, 'render.png'), before);
      writeFileSync(path.join(dir, 'render.png'), after);
      expect(find(describeOutputs(dir, previous), 'render.png')?.carried).toBe(false);
    });

    it('calls a file the previous leg never had this run’s own', () => {
      writeFileSync(path.join(dir, 'fresh.md'), 'new\n');
      expect(find(describeOutputs(dir, previous), 'fresh.md')?.carried).toBe(false);
    });

    // A name the parent used for a directory is not a file we inherited.
    it('is not fooled by a directory of the same name', () => {
      mkdirSync(path.join(previous, 'out'));
      writeFileSync(path.join(dir, 'out'), 'x');
      expect(find(describeOutputs(dir, previous), 'out')?.carried).toBe(false);
    });

    // The whole field is absent on a job that continues nothing, so the card
    // says nothing rather than claiming everything was written fresh.
    it('says nothing at all when there is no previous leg', () => {
      writeFileSync(path.join(dir, 'plan.pdf'), PDF);
      expect(describeOutputs(dir)).toEqual([{ name: 'plan.pdf', bytes: PDF.length }]);
    });
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

  // A continuation inherits its parent's report (D-146); inheriting is not
  // making, or a repeat of the parent's job could be refused a replay it
  // deserves.
  it('does not count an inherited report as something made', () => {
    writeFileSync(path.join(dir, 'PREVIOUS-RESULT.md'), '# the parent said\n');
    expect(producedArtefacts(dir)).toBe(false);
  });
});

// The one notion of "it delivered" for work that changes no repository —
// which is exactly the check an inherited file must never satisfy: a leg
// holding only its parent's report has not delivered anything (D-146).
describe('deliveredFiles', () => {
  it('does not count the inherited report as the run leaving something', () => {
    writeFileSync(path.join(dir, 'PREVIOUS-RESULT.md'), 'the parent said');
    expect(deliveredFiles(dir)).toBe(false);
  });

  it('counts the run’s own report, as it always has', () => {
    writeFileSync(path.join(dir, 'PREVIOUS-RESULT.md'), 'the parent said');
    writeFileSync(path.join(dir, 'RESULT.md'), 'the leg said');
    expect(deliveredFiles(dir)).toBe(true);
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

  // An SVG chart (D-131) is shown inline in the panel through an <img>, which
  // runs no script — but it must NOT open in the browser on its own, because a
  // top-level SVG navigation executes its scripts. Attachment disposition is
  // what forces a download there instead. So `image/svg+xml`, and not inline.
  it('serves an SVG as an image but never lets it open itself in the browser', () => {
    expect(contentTypeFor('totals.svg')).toBe('image/svg+xml');
    expect(opensInBrowser('totals.svg')).toBe(false);
  });
});

/**
 * Re-attaching a job's files to another job (D-097). The bytes only ever live
 * in the sandbox, so a redo that did not read them back produced a job with
 * an empty `input/` — able only to fail, having been paid for.
 */
describe('attachedFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-input-'));
  });
  afterEach(() =>
    rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  it('reads the bytes back under the same names', () => {
    writeFileSync(path.join(dir, 'expenses.csv'), 'date,category\n2026-08-05,hq\n');
    const files = attachedFiles(dir, [{ name: 'expenses.csv' }]);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('expenses.csv');
    expect(files[0].data.toString()).toContain('2026-08-05,hq');
  });

  /**
   * Names come from the job's record, never a listing — otherwise a file the
   * *run* wrote into `input/` would ride into the next job as an attachment
   * the user never sent.
   */
  it('takes only what the job says it was given', () => {
    writeFileSync(path.join(dir, 'expenses.csv'), 'real');
    writeFileSync(path.join(dir, 'notes-the-run-wrote.txt'), 'not the user’s');
    expect(attachedFiles(dir, [{ name: 'expenses.csv' }]).map((f) => f.name)).toEqual([
      'expenses.csv',
    ]);
  });

  // A missing file is one the run can report; a throw here would lose the
  // whole redo over it.
  it('skips what it cannot read rather than failing the lot', () => {
    writeFileSync(path.join(dir, 'here.csv'), 'x');
    const files = attachedFiles(dir, [{ name: 'gone.csv' }, { name: 'here.csv' }]);
    expect(files.map((f) => f.name)).toEqual(['here.csv']);
  });

  it('refuses a name that would climb out of the directory', () => {
    expect(attachedFiles(dir, [{ name: '../../etc/passwd' }])).toEqual([]);
  });

  it('has nothing to do for a job that was given nothing', () => {
    expect(attachedFiles(dir, undefined)).toEqual([]);
    expect(attachedFiles(dir, [])).toEqual([]);
  });
});
