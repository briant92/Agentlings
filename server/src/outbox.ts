import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MAX_OUTBOX_BODY_CHARS,
  MAX_OUTBOX_MESSAGES,
  MAX_OUTBOX_SUBJECT_CHARS,
  MAX_OUTBOX_TO_CHARS,
  type Outbox,
  type OutboxMessage,
} from '@agentlings/shared';

/**
 * The outbox contract: how a run asks for something to be sent (D-075).
 *
 * A session never holds a send tool. It writes this file at the sandbox root —
 * one channel, up to MAX_OUTBOX_MESSAGES messages — where it counts as a
 * deliverable by the existing top-level rule. Review shows the messages, and
 * Approve is the send: the server replays the reviewed outbox through the
 * channel's client, exactly as a reviewed patch is replayed by `git apply`.
 *
 * Validation is strict and every refusal names its reason: this file is
 * written by a model, and a malformed outbox that silently read as "no
 * messages" would promote a job while dropping the half the user cared about.
 */
export const OUTBOX_FILE = 'OUTBOX.json';

export type OutboxRead =
  | { outbox: Outbox; error?: undefined }
  | { outbox?: undefined; error: string };

function checkMessage(raw: unknown, n: number): { message?: OutboxMessage; error?: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: `message ${n} is not an object` };
  }
  const { to, name, subject, body } = raw as {
    to?: unknown;
    name?: unknown;
    subject?: unknown;
    body?: unknown;
  };
  if (typeof to !== 'string' || to.trim() === '') {
    return { error: `message ${n}: "to" must be a non-empty string` };
  }
  if (to.length > MAX_OUTBOX_TO_CHARS) {
    return { error: `message ${n}: "to" is over ${MAX_OUTBOX_TO_CHARS} characters` };
  }
  if (typeof body !== 'string' || body.trim() === '') {
    return { error: `message ${n}: "body" must be a non-empty string` };
  }
  if (body.length > MAX_OUTBOX_BODY_CHARS) {
    return { error: `message ${n}: "body" is over ${MAX_OUTBOX_BODY_CHARS} characters` };
  }
  if (name !== undefined && typeof name !== 'string') {
    return { error: `message ${n}: "name" must be a string when present` };
  }
  if (subject !== undefined && typeof subject !== 'string') {
    return { error: `message ${n}: "subject" must be a string when present` };
  }
  if (typeof subject === 'string' && subject.length > MAX_OUTBOX_SUBJECT_CHARS) {
    return { error: `message ${n}: "subject" is over ${MAX_OUTBOX_SUBJECT_CHARS} characters` };
  }
  // Only the fields the contract names survive parsing — whatever else the
  // model wrote never reaches a channel client.
  return {
    message: {
      to: to.trim(),
      body,
      ...(name && name.trim() ? { name: name.trim() } : {}),
      ...(subject && subject.trim() ? { subject: subject.trim() } : {}),
    },
  };
}

/** Parses OUTBOX.json from a sandbox: null when absent, the reason when invalid. */
export function readOutbox(dir: string): OutboxRead | null {
  const file = path.join(dir, OUTBOX_FILE);
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { error: 'not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'not an object with "channel" and "messages"' };
  }
  const { channel, messages } = parsed as { channel?: unknown; messages?: unknown };
  if (typeof channel !== 'string' || channel.trim() === '') {
    return { error: '"channel" must be a non-empty string' };
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: '"messages" must be a non-empty array' };
  }
  if (messages.length > MAX_OUTBOX_MESSAGES) {
    return { error: `${messages.length} messages — the cap is ${MAX_OUTBOX_MESSAGES}` };
  }
  const out: OutboxMessage[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of messages.entries()) {
    const { message, error } = checkMessage(raw, i + 1);
    if (error) return { error };
    // A duplicate recipient is refused rather than deduplicated: sends are
    // idempotent *by recipient*, so two messages to one address could only
    // ever deliver the first — better the run hears that than half-sends.
    if (seen.has(message!.to)) {
      return { error: `"${message!.to}" appears twice — one message per recipient` };
    }
    seen.add(message!.to);
    out.push(message!);
  }
  return { outbox: { channel: channel.trim().toLowerCase(), messages: out } };
}
