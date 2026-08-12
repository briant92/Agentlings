import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_MOVES, opKey, opLabel } from '@agentlings/shared';
import { checkMoves, executeMoves, reverseMoves } from './moves';

describe('checkMoves — the gate', () => {
  it('accepts a mkdir and a move under the root', () => {
    const read = checkMoves({
      moves: [
        { op: 'mkdir', path: 'invoices' },
        { op: 'move', from: 'a.pdf', to: 'invoices/a.pdf' },
      ],
    });
    expect(read.error).toBeUndefined();
    expect(read.moves?.moves).toHaveLength(2);
  });

  it('refuses a path that climbs out of the folder, however it is written', () => {
    expect(checkMoves({ moves: [{ op: 'move', from: 'a', to: '../escape/a' }] }).error).toContain('..');
    expect(checkMoves({ moves: [{ op: 'move', from: 'a', to: 'x\\..\\..\\a' }] }).error).toContain('..');
  });

  it('refuses an absolute path or a drive letter', () => {
    expect(checkMoves({ moves: [{ op: 'mkdir', path: '/etc' }] }).error).toContain('relative');
    expect(checkMoves({ moves: [{ op: 'move', from: 'a', to: 'C:\\Windows\\a' }] }).error).toContain(
      'relative',
    );
  });

  it('refuses two moves onto the same destination', () => {
    const read = checkMoves({
      moves: [
        { op: 'move', from: 'a.txt', to: 'docs/x.txt' },
        { op: 'move', from: 'b.txt', to: 'docs/x.txt' },
      ],
    });
    expect(read.error).toContain('both land on');
  });

  it('refuses a path holding a NUL byte — it is the op-key separator', () => {
    const nul = String.fromCharCode(0);
    expect(checkMoves({ moves: [{ op: 'mkdir', path: `docs${nul}` }] }).error).toContain('NUL');
    expect(checkMoves({ moves: [{ op: 'move', from: `a${nul}b`, to: 'c' }] }).error).toContain('NUL');
  });

  it('refuses a move onto itself, an unknown op, and an over-cap manifest', () => {
    expect(checkMoves({ moves: [{ op: 'move', from: 'a', to: 'a' }] }).error).toContain('onto itself');
    expect(checkMoves({ moves: [{ op: 'delete', path: 'a' }] }).error).toContain('unknown op');
    const many = Array.from({ length: MAX_MOVES + 1 }, (_, i) => ({ op: 'mkdir', path: `d${i}` }));
    expect(checkMoves({ moves: many }).error).toContain('too many');
  });

  it('names its reason for an empty or malformed manifest, never a silent pass', () => {
    expect(checkMoves({ moves: [] }).error).toContain('empty');
    expect(checkMoves({}).error).toContain('array');
    expect(checkMoves(null).error).toContain('object');
  });
});

describe('opKey / opLabel — identity and display, kept apart (D-161)', () => {
  // Built, never spelled: a NUL literal here would be as invisible as the raw
  // byte that hid in opKey itself, and would make this file vanish from grep.
  const SEP = String.fromCharCode(0);

  it('separates with NUL, so spacey paths can never collide', () => {
    expect(opKey({ op: 'move', from: 'a b', to: 'c' })).toBe(`move:a b${SEP}c`);
    expect(opKey({ op: 'move', from: 'a', to: 'b c' })).toBe(`move:a${SEP}b c`);
    expect(opKey({ op: 'mkdir', path: 'docs' })).toBe('mkdir:docs');
  });

  it('labels are for people — spaced, arrowed, NUL-free', () => {
    expect(opLabel({ op: 'move', from: 'a b', to: 'c' })).toBe('a b → c');
    expect(opLabel({ op: 'mkdir', path: 'docs' })).toBe('mkdir docs');
    expect(opLabel({ op: 'move', from: 'a b', to: 'c' }).includes(SEP)).toBe(false);
  });

  it('the seam sources spell the byte as an escape, never raw', () => {
    // The original byte rode committed source unseen and made the file binary
    // to ripgrep; this is the trap that stops it coming back.
    const seams = ['./moves.ts', '../../packages/shared/src/index.ts', '../../web/src/panels/moves.ts'];
    for (const rel of seams) {
      expect(readFileSync(new URL(rel, import.meta.url), 'utf8').includes(SEP)).toBe(false);
    }
  });
});

describe('executeMoves — the replay, against a real folder', () => {
  let root = '';
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'moves-'));
    writeFileSync(path.join(root, 'invoice.pdf'), 'x');
    writeFileSync(path.join(root, 'photo.jpg'), 'y');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const tree = () => readdirSync(root, { recursive: true }).map(String).sort();

  it('makes folders and moves files into them', () => {
    const { moves } = checkMoves({
      moves: [
        { op: 'mkdir', path: 'docs' },
        { op: 'move', from: 'invoice.pdf', to: 'docs/invoice.pdf' },
      ],
    });
    const run = executeMoves(moves!, root, []);
    expect(run.failed).toEqual([]);
    expect(run.done).toHaveLength(2);
    expect(existsSync(path.join(root, 'docs', 'invoice.pdf'))).toBe(true);
    expect(existsSync(path.join(root, 'invoice.pdf'))).toBe(false);
  });

  it('refuses to overwrite an existing destination, and keeps going', () => {
    writeFileSync(path.join(root, 'taken.jpg'), 'already here');
    const { moves } = checkMoves({
      moves: [
        { op: 'move', from: 'photo.jpg', to: 'taken.jpg' },
        { op: 'move', from: 'invoice.pdf', to: 'kept.pdf' },
      ],
    });
    const run = executeMoves(moves!, root, []);
    expect(run.failed[0].reason).toContain('not overwriting');
    expect(run.done).toHaveLength(1); // the second op still ran
    expect(existsSync(path.join(root, 'kept.pdf'))).toBe(true);
  });

  it('skips ops a prior Approve already did — approving twice moves nothing twice', () => {
    const { moves } = checkMoves({ moves: [{ op: 'move', from: 'invoice.pdf', to: 'docs/invoice.pdf' }] });
    const first = executeMoves(moves!, root, []);
    // The file is gone from its old home; a naive replay would fail. With the
    // op keyed as already-done, the replay is a clean no-op.
    const second = executeMoves(moves!, root, first.done.map(opKey));
    expect(second.done).toEqual([]);
    expect(second.failed).toEqual([]);
  });

  it('re-checks the path at execution time — a manifest is never trusted alone', () => {
    // A manifest that bypassed checkMoves cannot reach renameSync with an
    // escaping path: resolveUnder throws and the op merely fails.
    const run = executeMoves({ moves: [{ op: 'move', from: 'invoice.pdf', to: '../../ha.pdf' }] }, root, []);
    expect(run.done).toEqual([]);
    expect(run.failed[0].reason).toContain('outside the folder');
    expect(existsSync(path.join(root, 'invoice.pdf'))).toBe(true);
  });

  it('reverses a batch back to exactly the original layout', () => {
    const before = tree();
    const { moves } = checkMoves({
      moves: [
        { op: 'mkdir', path: 'sorted' },
        { op: 'move', from: 'invoice.pdf', to: 'sorted/invoice.pdf' },
        { op: 'move', from: 'photo.jpg', to: 'sorted/photo.jpg' },
      ],
    });
    const run = executeMoves(moves!, root, []);
    expect(run.failed).toEqual([]);
    const undo = reverseMoves(run.done, root);
    expect(undo.failed).toEqual([]);
    expect(tree()).toEqual(before); // the mkdir's empty dir is removed too
  });

  it('reversing leaves a folder that has since gained a file alone, never deleting it', () => {
    const { moves } = checkMoves({ moves: [{ op: 'mkdir', path: 'keep' }] });
    executeMoves(moves!, root, []);
    writeFileSync(path.join(root, 'keep', 'new.txt'), 'arrived after'); // someone filled it
    const undo = reverseMoves(moves!.moves, root);
    expect(undo.failed).toHaveLength(1); // rmdir refused a non-empty dir
    expect(existsSync(path.join(root, 'keep', 'new.txt'))).toBe(true);
  });
});
