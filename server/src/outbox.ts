import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MAX_OUTBOX_BODY_CHARS,
  MAX_OUTBOX_MESSAGES,
  MAX_OUTBOX_PARAM_CHARS,
  MAX_OUTBOX_PARAMS,
  MAX_OUTBOX_SUBJECT_CHARS,
  MAX_OUTBOX_TO_CHARS,
  type Outbox,
  type OutboxMessage,
  type OutboxTemplate,
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
  const { to, name, subject, params, body } = raw as {
    to?: unknown;
    name?: unknown;
    subject?: unknown;
    params?: unknown;
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
  let cleanParams: string[] | undefined;
  if (params !== undefined) {
    if (!Array.isArray(params) || params.some((p) => typeof p !== 'string')) {
      return { error: `message ${n}: "params" must be an array of strings when present` };
    }
    if (params.length > MAX_OUTBOX_PARAMS) {
      return { error: `message ${n}: ${params.length} params — the cap is ${MAX_OUTBOX_PARAMS}` };
    }
    for (const p of params as string[]) {
      if (p.trim() === '' || p.length > MAX_OUTBOX_PARAM_CHARS) {
        return {
          error: `message ${n}: every param must be 1–${MAX_OUTBOX_PARAM_CHARS} characters`,
        };
      }
      // Meta refuses newlines and tabs inside template parameters; better the
      // run hears that at parse time than the whole batch at send time.
      if (/[\n\r\t]/.test(p)) {
        return { error: `message ${n}: params may not contain line breaks or tabs` };
      }
    }
    cleanParams = (params as string[]).map((p) => p.trim());
  }
  // Only the fields the contract names survive parsing — whatever else the
  // model wrote never reaches a channel client.
  return {
    message: {
      to: to.trim(),
      body,
      ...(name && name.trim() ? { name: name.trim() } : {}),
      ...(subject && subject.trim() ? { subject: subject.trim() } : {}),
      ...(cleanParams && cleanParams.length > 0 ? { params: cleanParams } : {}),
    },
  };
}

/**
 * The desk's recipient field split back into an address and a display name.
 *
 * `RecipientPicker` writes "Name — id" when someone is picked off the roster
 * and the bare address when one is pasted, so those are the two shapes this
 * has to read — and the em-dash is the picker's own separator, not a guess.
 * A name with no address behind it never reaches here: the Start arrest
 * refuses a To the channel's contract cannot reach (D-091).
 */
export function splitRecipient(value: string): { to: string; name?: string } {
  // The picker's em-dash, plus the two a person typing the same shape by hand
  // reaches for. The *last* separator, because names carry hyphens far more
  // often than addresses do — "Jean-Luc Picard — 123" splits once, correctly.
  const at = Math.max(value.lastIndexOf('—'), value.lastIndexOf('–'), value.lastIndexOf(' - '));
  if (at === -1) return { to: value.trim() };
  const name = value.slice(0, at).trim();
  const to = value.slice(at + (value.startsWith(' - ', at) ? 3 : 1)).trim();
  // A separator with nothing after it is not a split, it is a name — leaving
  // `to` empty here would be refused by the contract with a confusing reason.
  return to ? { to, ...(name ? { name } : {}) } : { to: value.trim() };
}

/**
 * The outbox a job the desk already holds whole (D-097) — one recipient, the
 * user's own words, nothing decided. Returns the contract's own error rather
 * than throwing, because the caller's fallback is a session and a refusal
 * here has to be able to say why.
 */
export function composeOutbox(channel: string, recipient: string, words: string): OutboxRead {
  const { to, name } = splitRecipient(recipient);
  return checkOutbox({
    channel,
    messages: [{ to, body: words, ...(name ? { name } : {}) }],
  });
}

/** The template block, when the outbox carries one — Meta's own shapes. */
function checkTemplate(raw: unknown): { template?: OutboxTemplate; error?: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: '"template" must be an object with "name" and "language"' };
  }
  const { name, language } = raw as { name?: unknown; language?: unknown };
  if (typeof name !== 'string' || !/^[a-z0-9_]{1,512}$/.test(name)) {
    return {
      error: '"template.name" must be lowercase letters, digits and underscores — the name Meta approved',
    };
  }
  if (typeof language !== 'string' || !/^[a-z]{2}(_[A-Z]{2})?$/.test(language)) {
    return { error: '"template.language" must be a code like "es" or "en_US"' };
  }
  return { template: { name, language } };
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
  return checkOutbox(parsed);
}

/**
 * The contract itself, over an already-parsed value.
 *
 * Split out from `readOutbox` so the deterministic composer (D-097) is held
 * to exactly the same contract as a session's own file — the caps, the
 * one-message-per-recipient rule, the fields that survive parsing. An outbox
 * built in code and an outbox written by a model must be the same object or
 * review and replay are looking at two different things.
 */
export function checkOutbox(parsed: unknown): OutboxRead {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'not an object with "channel" and "messages"' };
  }
  const { channel, template, messages } = parsed as {
    channel?: unknown;
    template?: unknown;
    messages?: unknown;
  };
  if (typeof channel !== 'string' || channel.trim() === '') {
    return { error: '"channel" must be a non-empty string' };
  }
  let cleanTemplate: OutboxTemplate | undefined;
  if (template !== undefined) {
    const checked = checkTemplate(template);
    if (checked.error) return { error: checked.error };
    cleanTemplate = checked.template;
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
  return {
    outbox: {
      channel: channel.trim().toLowerCase(),
      ...(cleanTemplate ? { template: cleanTemplate } : {}),
      messages: out,
    },
  };
}
