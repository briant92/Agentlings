import { appendFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One line per door call — what a run actually asked and what came back.
 *
 * Born from a false brief (D-192): the mail desk's first firing reported an
 * empty inbox that held sixteen messages, and nothing recorded what
 * `mail_search` really answered — sandboxes keep no transcript, so the cause
 * was unknowable after the fact. The doors are the one choke point every
 * outside read passes through, which makes them the cheapest place to leave
 * a trace.
 *
 * Heads and args are truncated hard: this is a diagnostic trail, not a copy
 * of the answer. Secrets never appear — a door's args carry queries, ids and
 * urls, and the credential is added server-side after this line is built.
 */

const ARGS_CHARS = 200;
const HEAD_CHARS = 160;
const FILE = 'doors.log';

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}…` : s);

/** The line itself, pure so it can be pinned: one JSON object, no newline. */
export function doorLine(
  door: string,
  tool: string,
  args: Record<string, unknown>,
  result: { text?: unknown; error?: unknown },
  at: number,
): string {
  const error = typeof result.error === 'string' ? result.error : undefined;
  const head =
    error !== undefined
      ? error
      : typeof result.text === 'string'
        ? (result.text.split('\n', 1)[0] ?? '')
        : JSON.stringify(result);
  return JSON.stringify({
    at,
    door,
    tool,
    args: clip(JSON.stringify(args), ARGS_CHARS),
    ok: error === undefined,
    head: clip(head, HEAD_CHARS),
  });
}

/** Append the line under the sandbox root. A log must never take a door down. */
export function logDoor(
  root: string,
  door: string,
  tool: string,
  args: Record<string, unknown>,
  result: { text?: unknown; error?: unknown },
  at: number = Date.now(),
): void {
  try {
    appendFileSync(path.join(root, FILE), `${doorLine(door, tool, args, result, at)}\n`);
  } catch {
    // Diagnostics only: a full disk or a locked file is not a door problem.
  }
}
