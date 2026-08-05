import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The audit of what left the machine — every send attempt, kept or refused
 * (D-075, closing for the one path that sends the gap AGENTLING.md §11 names).
 *
 * Beside the ledger rather than in it, on purpose: a ledger row is written at
 * completion and priced, a send happens later at review and costs no model
 * anything, and an append-only price history must not gain rows for events
 * with no price. Same idioms as ledger.jsonl — append-only, parsed line by
 * line, a torn line skipped rather than fatal.
 */
export interface SendRecord {
  at: number;
  levelId: string;
  jobId: string;
  channel: string;
  to: string;
  /** Who this was, as the reviewed outbox named them (D-092) — the audit
   *  should not need a phonebook to be readable, and the audience roster
   *  reads names back from here for people who never tapped Start. */
  name?: string;
  /**
   * What was said, verbatim, on sends that happened (D-094) — the audit of
   * what left the machine records what left, and "send the same again"
   * reuses this instead of rebuilding from source and drifting.
   */
  body?: string;
  ok: boolean;
  /** The channel's own sentence for a failure ("chat not found"). */
  reason?: string;
  /**
   * What the channel charged for this message, when the channel prices one.
   * Telegram never sets it; WhatsApp will, per delivered template (D-077).
   */
  usd?: number;
}

export function sendsFile(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'sends.jsonl');
}

export function appendSends(sandboxRoot: string, records: SendRecord[]): void {
  if (records.length === 0) return;
  mkdirSync(sandboxRoot, { recursive: true });
  appendFileSync(sendsFile(sandboxRoot), records.map((r) => `${JSON.stringify(r)}\n`).join(''));
}

export function readSends(sandboxRoot: string): SendRecord[] {
  const file = sendsFile(sandboxRoot);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as SendRecord];
      } catch {
        return []; // a torn last line must not lose the rest of the audit
      }
    });
}
