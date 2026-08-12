import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MoveOp, MovesManifest } from '@agentlings/shared';
import { executeMoves, MOVES_JOURNAL, opKey, reverseMoves } from './moves';
import {
  performMovesReplay,
  performMovesUndo,
  type MovesReplayOpts,
  type MovesUndoOpts,
} from './movesreplay';

/**
 * D-160's sibling seam, closed (D-161): the moves window is read→replay→stamp,
 * and only the executor's synchrony serialized it. These tests hold the one
 * door to its claim by making the middle genuinely yield — a slowed executor —
 * so the claim, not the accident, is what refuses the second caller:
 * concurrent entry refused (replay and undo, either order), sequential retry
 * open, failure never locking the door.
 */

/** An executor stand-in that answers after a delay, so the replay has a real window. */
const delayed =
  <A extends unknown[], R>(fn: (...args: A) => R, ms: number) =>
  async (...args: A): Promise<R> => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return fn(...args);
  };

describe('performMovesReplay / performMovesUndo', () => {
  let sandbox: string; // where the journal lands
  let root: string; // the real folder being reorganized
  /** The job's stamp, exactly as the queue keeps it — grown by `record`. */
  let stamped: MoveOp[];

  beforeEach(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'agentlings-moves-door-sandbox-'));
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-moves-door-root-'));
    writeFileSync(path.join(root, 'invoice.pdf'), 'x');
    stamped = [];
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });

  const manifest: MovesManifest = {
    moves: [
      { op: 'mkdir', path: 'docs' },
      { op: 'move', from: 'invoice.pdf', to: 'docs/invoice.pdf' },
    ],
  };

  const replayOpts = (over: Partial<MovesReplayOpts> = {}): MovesReplayOpts => ({
    manifest,
    jobId: 'j1',
    root,
    sandboxDir: sandbox,
    alreadyDone: () => stamped,
    record: (run) => {
      const seen = new Set(stamped.map(opKey));
      stamped = [...stamped, ...run.done.filter((op) => !seen.has(opKey(op)))];
    },
    ...over,
  });

  const undoOpts = (over: Partial<MovesUndoOpts> = {}): MovesUndoOpts => ({
    jobId: 'j1',
    root,
    sandboxDir: sandbox,
    done: () => stamped,
    setDone: (remaining) => {
      stamped = remaining;
    },
    ...over,
  });

  const journal = () =>
    readFileSync(path.join(sandbox, MOVES_JOURNAL), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { done: MoveOp[]; failed: unknown[] });

  it('two concurrent Approves move once — the second is refused by the claim', async () => {
    const shared = replayOpts({ executeFn: delayed(executeMoves, 50) });
    const [a, b] = await Promise.all([performMovesReplay(shared), performMovesReplay(shared)]);
    const runs = [a, b].filter(Boolean);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.done).toHaveLength(2);
    expect(runs[0]!.failed).toEqual([]);
    expect(existsSync(path.join(root, 'docs', 'invoice.pdf'))).toBe(true);
    // One journal entry, because one replay happened.
    expect(journal()).toHaveLength(1);
    expect(stamped).toHaveLength(2);
  });

  it('the claim releases on finish — a later Approve enters and skips the stamped', async () => {
    await performMovesReplay(replayOpts());
    const again = await performMovesReplay(replayOpts());
    expect(again).not.toBeNull(); // entered — the door is not locked
    expect(again!.done).toEqual([]); // but the stamp, read under the claim, skips every op
    expect(again!.failed).toEqual([]);
  });

  it('the claim releases on a per-op failure — the retry door stays open', async () => {
    const blocked: MovesManifest = {
      moves: [
        { op: 'move', from: 'missing.pdf', to: 'docs/missing.pdf' },
        { op: 'move', from: 'invoice.pdf', to: 'docs/invoice.pdf' },
      ],
    };
    const first = await performMovesReplay(replayOpts({ manifest: blocked }));
    expect(first!.failed).toHaveLength(1); // the gone source failed; the rest still ran
    expect(first!.done).toEqual([{ op: 'move', from: 'invoice.pdf', to: 'docs/invoice.pdf' }]);
    writeFileSync(path.join(root, 'missing.pdf'), 'here now');
    const second = await performMovesReplay(replayOpts({ manifest: blocked }));
    expect(second).not.toBeNull();
    expect(second!.done).toEqual([{ op: 'move', from: 'missing.pdf', to: 'docs/missing.pdf' }]);
    expect(second!.failed).toEqual([]);
  });

  it('the claim releases on a thrown executor — the door is never left locked', async () => {
    const boom = replayOpts({
      executeFn: () => {
        throw new Error('disk on fire');
      },
    });
    await expect(performMovesReplay(boom)).rejects.toThrow('disk on fire');
    const after = await performMovesReplay(replayOpts());
    expect(after).not.toBeNull();
    expect(after!.done).toHaveLength(2);
  });

  it('an undo against a mid-flight replay is refused, and the reverse — nothing moved either way', async () => {
    // Forward mid-flight: the undo is refused with nothing moved back.
    const slowReplay = performMovesReplay(replayOpts({ executeFn: delayed(executeMoves, 50) }));
    expect(await performMovesUndo(undoOpts())).toBeNull();
    await slowReplay;
    expect(existsSync(path.join(root, 'docs', 'invoice.pdf'))).toBe(true); // the refused undo touched nothing
    expect(stamped).toHaveLength(2);

    // Undo mid-flight: the replay is refused with nothing moved.
    const slowUndo = performMovesUndo(undoOpts({ reverseFn: delayed(reverseMoves, 50) }));
    expect(await performMovesReplay(replayOpts())).toBeNull();
    const undone = await slowUndo;
    expect(undone!.failed).toEqual([]);
    expect(existsSync(path.join(root, 'invoice.pdf'))).toBe(true); // back home
    expect(stamped).toEqual([]); // nothing left in force
  });

  it('the undo journals the direction the files actually traveled and empties the stamp', async () => {
    await performMovesReplay(replayOpts());
    const undo = await performMovesUndo(undoOpts());
    expect(undo!.failed).toEqual([]);
    expect(stamped).toEqual([]);
    const entries = journal();
    expect(entries).toHaveLength(2);
    expect(entries[1].done).toContainEqual({
      op: 'move',
      from: 'docs/invoice.pdf',
      to: 'invoice.pdf',
    });
  });

  it('different jobs never block each other', async () => {
    const root2 = mkdtempSync(path.join(tmpdir(), 'agentlings-moves-door-root2-'));
    const sandbox2 = mkdtempSync(path.join(tmpdir(), 'agentlings-moves-door-sandbox2-'));
    writeFileSync(path.join(root2, 'invoice.pdf'), 'y');
    let stamped2: MoveOp[] = [];
    try {
      const [a, b] = await Promise.all([
        performMovesReplay(replayOpts({ executeFn: delayed(executeMoves, 50) })),
        performMovesReplay(
          replayOpts({
            jobId: 'j2',
            root: root2,
            sandboxDir: sandbox2,
            executeFn: delayed(executeMoves, 50),
            alreadyDone: () => stamped2,
            record: (run) => {
              stamped2 = [...stamped2, ...run.done];
            },
          }),
        ),
      ]);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(existsSync(path.join(root, 'docs', 'invoice.pdf'))).toBe(true);
      expect(existsSync(path.join(root2, 'docs', 'invoice.pdf'))).toBe(true);
    } finally {
      await rm(root2, { recursive: true, force: true });
      await rm(sandbox2, { recursive: true, force: true });
    }
  });
});
