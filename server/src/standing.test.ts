import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newestMatch, resolveStanding, validateStanding } from './standing';

let dir: string;

/** Written with an explicit mtime, because "newest" is the whole rule. */
function write(name: string, body: string, secondsAgo = 0): string {
  const file = path.join(dir, name);
  writeFileSync(file, body, 'utf8');
  const when = new Date(Date.now() - secondsAgo * 1000);
  utimesSync(file, when, when);
  return file;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'standing-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('newestMatch', () => {
  it('picks the newest file, not the last one alphabetically', () => {
    write('estado-cuenta-2026-07.xlsx', 'july', 600);
    write('estado-cuenta-2026-08.xlsx', 'august', 300);
    write('estado-cuenta-2026-06.xlsx', 'june', 30); // newest, earliest name
    expect(newestMatch(dir)).toBe('estado-cuenta-2026-06.xlsx');
  });

  it('filters on the match, case-insensitively', () => {
    write('movimientos.xlsx', 'ledger', 600);
    write('Estado-Cuenta-2026-08.xlsx', 'statement', 300);
    expect(newestMatch(dir, 'estado')).toBe('Estado-Cuenta-2026-08.xlsx');
  });

  it('skips the lock file Excel leaves beside an open workbook', () => {
    write('movimientos.xlsx', 'the real data', 600);
    // Excel writes this the moment the workbook is opened, so it is always
    // newer than the workbook — the exact case the newest rule would lose to.
    write('~$movimientos.xlsx', 'lock', 0);
    expect(newestMatch(dir, '.xlsx')).toBe('movimientos.xlsx');
  });

  it('skips directories', () => {
    write('statement.xlsx', 'data', 600);
    mkdirSync(path.join(dir, 'archive.xlsx'));
    expect(newestMatch(dir, '.xlsx')).toBe('statement.xlsx');
  });

  it('is null for an empty folder, a folder with no match, and a missing one', () => {
    expect(newestMatch(dir)).toBeNull();
    write('notes.txt', 'x');
    expect(newestMatch(dir, '.xlsx')).toBeNull();
    expect(newestMatch(path.join(dir, 'nope'))).toBeNull();
  });
});

describe('validateStanding', () => {
  const ok = { dir: path.resolve('/books'), as: 'statement.xlsx' };

  it('accepts a well-formed input', () => {
    expect(validateStanding([ok])).toBeNull();
  });

  it('refuses a relative folder', () => {
    expect(validateStanding([{ dir: 'books', as: 'a.xlsx' }])).toMatch(/absolute/);
  });

  it('refuses a landing name that is a path', () => {
    expect(validateStanding([{ ...ok, as: '../escape.xlsx' }])).toMatch(/plain filename/);
    expect(validateStanding([{ ...ok, as: 'sub/a.xlsx' }])).toMatch(/plain filename/);
  });

  it('refuses two inputs landing under one name', () => {
    expect(validateStanding([ok, { ...ok, dir: path.resolve('/other') }])).toMatch(/both land/);
  });

  it('refuses more than a job may carry', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...ok, as: `f${i}.xlsx` }));
    expect(validateStanding(many)).toMatch(/too many/);
  });
});

describe('resolveStanding', () => {
  it('reads the current file under the name the caller chose', () => {
    write('estado-cuenta-2026-08.xlsx', 'august rows', 300);
    const [file] = resolveStanding([{ dir, match: 'estado', as: 'statement.xlsx' }]);
    expect(file.name).toBe('statement.xlsx');
    expect(file.data.toString()).toBe('august rows');
  });

  it('follows the folder as the month turns, with the prompt unchanged', () => {
    write('estado-cuenta-2026-08.xlsx', 'august rows', 300);
    const input = { dir, match: 'estado', as: 'statement.xlsx' };
    expect(resolveStanding([input])[0].data.toString()).toBe('august rows');
    // September's download lands beside August's; nothing about the schedule
    // changes, and the next firing must see the new one.
    write('estado-cuenta-2026-09.xlsx', 'september rows', 0);
    expect(resolveStanding([input])[0].data.toString()).toBe('september rows');
  });

  it('throws rather than returning a short list when one input is missing', () => {
    write('movimientos.xlsx', 'ledger', 300);
    expect(() =>
      resolveStanding([
        { dir, match: 'movimientos', as: 'ledger.xlsx' },
        { dir, match: 'estado', as: 'statement.xlsx' },
      ]),
    ).toThrow(/statement\.xlsx.*nothing matching "estado"/s);
  });

  it('names the folder when it has gone', () => {
    const gone = path.join(dir, 'moved');
    expect(() => resolveStanding([{ dir: gone, as: 'statement.xlsx' }])).toThrow(
      /no folder at/,
    );
  });

  it('says the folder is empty rather than blaming a match it was not given', () => {
    expect(() => resolveStanding([{ dir, as: 'statement.xlsx' }])).toThrow(/is empty/);
  });
});
