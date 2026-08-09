import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { folderInventory, organizeBrief, wantsOrganize } from './organize';

describe('wantsOrganize — detection, under-firing', () => {
  it('fires on a tidying verb beside a folder reference', () => {
    for (const s of [
      'organize this folder',
      'tidy my downloads',
      'sort out my desktop',
      'clean up my documents folder',
      'declutter my screenshots',
    ]) {
      expect(wantsOrganize(s)).toBe(true);
    }
  });

  it('does not fire on code cleanup or a verb with no folder — the noun, not the verb', () => {
    for (const s of [
      'clean up the whole project', // code, not a folder — must stay a coding job
      'sort out the bug in the parser',
      'tidy up the error handling',
      'summarise the invoices',
      'send Brian a telegram',
    ]) {
      expect(wantsOrganize(s)).toBe(false);
    }
  });
});

describe('folderInventory — metadata only', () => {
  let root = '';
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'inv-'));
    writeFileSync(path.join(root, 'invoice.pdf'), 'secret contents nobody should read');
    writeFileSync(path.join(root, '.hidden'), 'skip me');
    mkdirSync(path.join(root, 'node_modules'));
    writeFileSync(path.join(root, 'node_modules', 'lib.js'), 'skip me too');
    mkdirSync(path.join(root, 'sub'));
    writeFileSync(path.join(root, 'sub', 'photo.jpg'), 'y');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('lists names, types, sizes and dates — and never the contents', () => {
    const inv = folderInventory(root);
    const all = inv.lines.join('\n');
    expect(all).toContain('invoice.pdf');
    expect(all).toContain('(pdf,');
    expect(all).not.toContain('secret contents'); // the point of Q1: no content leaves the disk
  });

  it('skips dotfiles and node_modules, and recurses into real subfolders', () => {
    const inv = folderInventory(root);
    const all = inv.lines.join('\n');
    expect(all).not.toContain('.hidden');
    expect(all).not.toContain('node_modules');
    expect(all).toContain('sub/photo.jpg');
    expect(inv.files).toBe(2); // invoice.pdf + sub/photo.jpg
    expect(inv.folders).toBe(1); // sub
  });

  it('reports an overflow rather than dropping it silently', () => {
    for (let i = 0; i < 5; i++) writeFileSync(path.join(root, `f${i}.txt`), 'x');
    const inv = folderInventory(root, 3);
    expect(inv.skipped).toBeGreaterThan(0);
  });
});

describe('organizeBrief', () => {
  it('carries the contract and the inventory, and forbids delete', () => {
    const brief = organizeBrief({ lines: ['a.pdf  (pdf, 1 KB, 2026-01-01)'], files: 1, folders: 0, skipped: 0 });
    expect(brief).toContain('MOVES.json');
    expect(brief).toContain('mkdir');
    expect(brief).toContain('no delete');
    expect(brief).toContain('a.pdf');
  });
});
