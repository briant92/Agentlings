import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { DoorUsage } from '@agentlings/shared';

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

/**
 * Every door's use, read off the trail (UI.md, step 8): calls, refusals,
 * first and last call, and calls per tool — what Settings shows beside each
 * switch, so a door nobody has knocked on since the trail began says so
 * instead of looking like every other one. The whole file is read on each
 * ask; it is a few hundred lines. A torn line is skipped, never an error.
 */
export function readDoorUsage(root: string): DoorUsage[] {
  const file = path.join(root, FILE);
  if (!existsSync(file)) return [];
  const byDoor = new Map<string, DoorUsage>();
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let line: { at?: unknown; door?: unknown; tool?: unknown; ok?: unknown };
    try {
      line = JSON.parse(raw) as typeof line;
    } catch {
      continue;
    }
    if (typeof line.door !== 'string' || typeof line.at !== 'number') continue;
    const use = byDoor.get(line.door) ?? {
      door: line.door,
      calls: 0,
      errors: 0,
      firstAt: line.at,
      lastAt: line.at,
      // Keyed by whatever the log names: a null prototype, so a tool called
      // 'constructor' counts like any other instead of reading the slot
      // Object already has there (review of 2026-08-22).
      tools: Object.create(null) as Record<string, number>,
    };
    use.calls += 1;
    if (line.ok === false) use.errors += 1;
    use.firstAt = Math.min(use.firstAt, line.at);
    use.lastAt = Math.max(use.lastAt, line.at);
    const tool = typeof line.tool === 'string' ? line.tool : '?';
    use.tools[tool] = (use.tools[tool] ?? 0) + 1;
    byDoor.set(line.door, use);
  }
  return [...byDoor.values()].sort((a, b) => b.calls - a.calls || a.door.localeCompare(b.door));
}
