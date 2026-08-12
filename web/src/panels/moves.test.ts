import { describe, expect, it } from 'vitest';
import type { MoveOp } from '@agentlings/shared';
import { moveRows, movesLeft, movesSummary } from './moves';

const ops: MoveOp[] = [
  { op: 'mkdir', path: 'photos' },
  { op: 'move', from: 'b.jpg', to: 'photos/b.jpg' },
  { op: 'mkdir', path: 'docs' },
  { op: 'move', from: 'a.pdf', to: 'docs/a.pdf' },
];

describe('movesLeft', () => {
  it('a done spacey op never marks its lookalike done — `a b`→`c` is not `a`→`b c`', () => {
    // The card and the server key ops the same way now (one opKey, D-161);
    // under the old space-separated copy these two collided and this failed.
    const done: MoveOp[] = [{ op: 'move', from: 'a b', to: 'c' }];
    const remaining: MoveOp[] = [{ op: 'move', from: 'a', to: 'b c' }];
    expect(movesLeft(remaining, done)).toEqual(remaining);
    expect(movesLeft(done, done)).toEqual([]);
  });
});

describe('movesSummary', () => {
  it('counts folders and files in words a person would use', () => {
    expect(movesSummary(ops)).toBe('2 folders, 2 files moved');
    expect(movesSummary([{ op: 'move', from: 'x', to: 'y/x' }])).toBe('1 file moved');
  });
});

describe('moveRows', () => {
  it('shows from→to for moves only, sorted by destination', () => {
    const rows = moveRows(ops);
    expect(rows).toEqual([
      { from: 'a.pdf', to: 'docs/a.pdf' },
      { from: 'b.jpg', to: 'photos/b.jpg' },
    ]);
  });
});
