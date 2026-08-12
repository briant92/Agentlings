import type { MoveOp, MovesManifest } from '@agentlings/shared';
import {
  appendMovesJournal,
  executeMoves,
  opKey,
  reverseMoves,
  type MovesRunResult,
} from './moves';

/**
 * The one door through which a reviewed reorganization touches the real
 * folder (D-161) — the replay and the undo both, because they contend for
 * the same files.
 *
 * D-160 closed the outbox's read→send→stamp window and flagged this seam as
 * the same shape. By inspection it is the same shape with one difference:
 * today the middle is synchronous (`renameSync` all the way down), so the
 * event loop happens to serialize the window and a concurrent double-Approve
 * cannot interleave it. That guarantee is an accident of the executor,
 * stated nowhere and pinned by nothing — one awaited progress event or
 * async-fs migration away from reopening D-160's hole against a folder of
 * real files, where a replay racing itself fails on gone sources, pollutes
 * the failed list, and interleaves the journal the undo replays. So the
 * claim is taken by construction rather than by synchrony: per job, held
 * from before the done-list read until after the stamp, released in a
 * `finally`. A concurrent caller — a second Approve, or an undo against a
 * mid-flight replay, either order — gets `null`, refused by name with
 * nothing moved. The claim is process-local on purpose; every caller lives
 * in this one server.
 */
const inFlight = new Set<string>();

export interface MovesReplayOpts {
  manifest: MovesManifest;
  jobId: string;
  /** The folder the job was pointed at — never a root the model named. */
  root: string;
  /** The job's sandbox — where `moves.jsonl` lives. */
  sandboxDir: string;
  /**
   * Ops a prior Approve already did, as a thunk on purpose: it is called
   * under the claim, so it always reads the stamp the previous replay
   * finished writing — a plain array argument would be the pre-claim stale
   * read D-160 exists to forbid.
   */
  alreadyDone: () => readonly MoveOp[];
  /** Stamps the run onto the job (queue.recordMoves); runs before the claim releases. */
  record: (run: MovesRunResult) => void;
  /** Injectable for tests; the real one is executeMoves. */
  executeFn?: (
    manifest: MovesManifest,
    root: string,
    alreadyDone: readonly string[],
  ) => MovesRunResult | Promise<MovesRunResult>;
}

/**
 * Replays, journals and stamps one Approve's moves — or returns null when
 * this job's moves are already mid-flight, in which case nothing moved and
 * the caller should say so. The claim always releases, success or failure:
 * a failed replay must leave the job retryable, not locked.
 */
export async function performMovesReplay(opts: MovesReplayOpts): Promise<MovesRunResult | null> {
  if (inFlight.has(opts.jobId)) return null;
  inFlight.add(opts.jobId);
  try {
    const alreadyDone = opts.alreadyDone().map(opKey);
    const run = await (opts.executeFn ?? executeMoves)(opts.manifest, opts.root, alreadyDone);
    appendMovesJournal(opts.sandboxDir, {
      at: Date.now(),
      root: opts.root,
      done: run.done,
      failed: run.failed,
    });
    opts.record(run);
    return run;
  } finally {
    inFlight.delete(opts.jobId);
  }
}

export interface MovesUndoOpts {
  jobId: string;
  root: string;
  sandboxDir: string;
  /** The ops currently in force, read under the same claim as the replay. */
  done: () => readonly MoveOp[];
  /** Persists what is still in force after the undo (queue.setMovesDone). */
  setDone: (remaining: MoveOp[]) => void;
  /** Injectable for tests; the real one is reverseMoves. */
  reverseFn?: (
    done: readonly MoveOp[],
    root: string,
  ) => MovesRunResult | Promise<MovesRunResult>;
}

/**
 * Walks the done list backwards through the same door: an undo arriving
 * while a replay is mid-flight (or the reverse) is refused with nothing
 * moved, because both sides reach for the same real files.
 */
export async function performMovesUndo(opts: MovesUndoOpts): Promise<MovesRunResult | null> {
  if (inFlight.has(opts.jobId)) return null;
  inFlight.add(opts.jobId);
  try {
    const done = opts.done();
    const undo = await (opts.reverseFn ?? reverseMoves)(done, opts.root);
    appendMovesJournal(opts.sandboxDir, {
      at: Date.now(),
      root: opts.root,
      done: undo.done.map((op) => (op.op === 'move' ? { op: 'move', from: op.to, to: op.from } : op)),
      failed: undo.failed,
    });
    // Drop what went back from the accumulator; anything that could not
    // reverse stays recorded, so the picture matches the folder.
    const reversed = new Set(undo.done.map(opKey));
    opts.setDone(done.filter((op) => !reversed.has(opKey(op))));
    return undo;
  } finally {
    inFlight.delete(opts.jobId);
  }
}
