import { appendFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One line per thing a run did — what it called, what came back, what it
 * said between calls, and how it ended. The sandbox's own transcript, kept
 * as a dotfile beside `.session.json` so nothing that lists deliverables ever
 * sees it.
 *
 * Sandboxes kept no transcript (doorlog.ts says so in its first paragraph,
 * D-192), and the door trail covers only the seven doors: a run that reads
 * the wrong file, loops on a failing command, or never opens the attachment
 * it was given leaves nothing to read afterwards. The ledger has the turns
 * and the cost, `toolsUsed` has the names, and the order, the arguments and
 * the answers die with the child process. This keeps them (D-211).
 *
 * Same bargain as the door trail: heads and args are clipped hard, because
 * this is a trace and not a copy of the work, and an append that fails is
 * swallowed — a log must never take a run down. Recorded and, for now, read
 * by nobody but a person diagnosing a run; the report counts which sandboxes
 * carry one so the coverage is visible from the day it starts.
 */

export const TRAJECTORY_FILE = '.trajectory.jsonl';

const ARGS_CHARS = 200;
const HEAD_CHARS = 160;

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}…` : s);

/** Which child the line came from: the job's own session, or its write-up. */
export type Pass = 'session' | 'closeout';

/**
 * A line off the runner's stdout, as the server reads it. `progress` is the
 * call (name and input, as before); `observation` and `said` are the two the
 * runner emits for this trail and nothing else reads.
 */
export interface RunnerEvent {
  type?: string;
  name?: string;
  input?: unknown;
  id?: string;
  turn?: number;
  ok?: boolean;
  head?: string;
}

export type Outcome = 'result' | 'error' | 'timeout' | 'cancelled' | 'exit';

/** The line for a runner event the trail keeps, or null for one it does not. Pure so it can be pinned. */
export function trajectoryLine(event: RunnerEvent, pass: Pass, at: number): string | null {
  const turn = typeof event.turn === 'number' ? event.turn : undefined;
  if (event.type === 'progress' && event.name) {
    return JSON.stringify({
      at,
      pass,
      turn,
      kind: 'call',
      id: event.id,
      name: event.name,
      args: clip(JSON.stringify(event.input ?? {}), ARGS_CHARS),
    });
  }
  if (event.type === 'observation') {
    return JSON.stringify({
      at,
      pass,
      turn,
      kind: 'result',
      id: event.id,
      ok: event.ok !== false,
      head: clip(String(event.head ?? ''), HEAD_CHARS),
    });
  }
  if (event.type === 'said') {
    return JSON.stringify({ at, pass, turn, kind: 'said', head: clip(String(event.head ?? ''), HEAD_CHARS) });
  }
  return null;
}

/** How the child ended, with what the meter knew by then. */
export function endLine(
  pass: Pass,
  outcome: Outcome,
  meter: {
    costUsd?: number;
    turns?: number;
    durationMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
  },
  toolCalls: number,
  at: number,
  message?: string,
): string {
  return JSON.stringify({
    at,
    pass,
    kind: 'end',
    outcome,
    toolCalls,
    costUsd: meter.costUsd,
    turns: meter.turns,
    durationMs: meter.durationMs,
    inputTokens: meter.inputTokens,
    outputTokens: meter.outputTokens,
    cacheReadTokens: meter.cacheReadTokens,
    ...(message ? { message: clip(message, HEAD_CHARS) } : {}),
  });
}

/** Append under the sandbox root. Null is "nothing to record"; a failed write is nobody's problem. */
export function logTrajectory(sandboxDir: string, line: string | null): void {
  if (line === null) return;
  try {
    appendFileSync(path.join(sandboxDir, TRAJECTORY_FILE), `${line}\n`);
  } catch {
    // Diagnostics only: a full disk or a locked file is not a run problem.
  }
}
