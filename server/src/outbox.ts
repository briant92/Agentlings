import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  MAX_OUTBOX_BODY_CHARS,
  MAX_OUTBOX_FILE_BYTES,
  MAX_OUTBOX_FILES,
  MAX_OUTBOX_FILES_TOTAL_BYTES,
  MAX_OUTBOX_MESSAGES,
  MAX_OUTBOX_PARAM_CHARS,
  MAX_OUTBOX_PARAMS,
  MAX_OUTBOX_SUBJECT_CHARS,
  MAX_OUTBOX_TO_CHARS,
  type Outbox,
  type OutboxEvent,
  type OutboxMessage,
  type OutboxTemplate,
} from '@agentlings/shared';
import { safeAttachmentName } from './outputs';

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

const MAX_EVENT_ATTENDEES = 20;

/**
 * The channels that can carry a file (D-159). A `files` block anywhere else
 * is refused at parse for the event block's reason: a field that parses and
 * then silently does nothing puts two different truths on the review card
 * and in the send.
 */
export const FILE_CHANNELS = new Set(['telegram', 'gmail']);

/**
 * Why this is not a valid outbox file name, or null when it is.
 *
 * Two shapes exist: a bare name (a file the run wrote at the sandbox root)
 * or `input/<name>` (a file the user attached at Start). Forward slashes
 * only, nothing deeper, and the leaf is held to `safeAttachmentName`'s own
 * rules — the name reaches `path.join` against the sandbox at send, so this
 * is a security boundary, not tidiness.
 */
export function outboxFileNameProblem(name: string): string | null {
  if (name.includes('\\')) return 'uses backslashes — write forward slashes';
  const segments = name.split('/');
  if (segments.length > 2 || (segments.length === 2 && segments[0] !== 'input')) {
    return 'must be a file at the sandbox root, or input/<name> for an attached one';
  }
  const leaf = segments[segments.length - 1];
  if (safeAttachmentName(leaf) !== leaf) return 'is not a plain visible file name';
  return null;
}

/** The file's real path in this sandbox, or null when the name is not one the contract takes. */
export function outboxFilePath(dir: string, name: string): string | null {
  if (outboxFileNameProblem(name)) return null;
  return path.join(dir, ...name.split('/'));
}

/** The files block, when a message carries one (D-159). Shape only — existence is the caller's dir to ask. */
function checkFiles(raw: unknown, n: number): { files?: string[]; error?: string } {
  if (!Array.isArray(raw) || raw.some((f) => typeof f !== 'string')) {
    return { error: `message ${n}: "files" must be an array of file names when present` };
  }
  if (raw.length > MAX_OUTBOX_FILES) {
    return { error: `message ${n}: ${raw.length} files — the cap is ${MAX_OUTBOX_FILES}` };
  }
  const clean: string[] = [];
  for (const f of raw as string[]) {
    const name = f.trim();
    const problem = outboxFileNameProblem(name);
    if (problem) return { error: `message ${n}: "${name}" ${problem}` };
    if (clean.includes(name)) {
      return { error: `message ${n}: "${name}" appears twice in "files"` };
    }
    clean.push(name);
  }
  return { files: clean };
}

/**
 * The event block, when a message carries one (D-104). Dates only have to
 * parse and run forwards — the channel client decides the timezone story,
 * because "when" is a send-time question and this is a parse-time gate.
 */
function checkEvent(raw: unknown, n: number): { event?: OutboxEvent; error?: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: `message ${n}: "event" must be an object with "start" and "end"` };
  }
  const { start, end, attendees } = raw as {
    start?: unknown;
    end?: unknown;
    attendees?: unknown;
  };
  if (typeof start !== 'string' || Number.isNaN(Date.parse(start))) {
    return {
      error: `message ${n}: "event.start" must be a date-time like 2026-08-13T18:00:00`,
    };
  }
  if (typeof end !== 'string' || Number.isNaN(Date.parse(end))) {
    return { error: `message ${n}: "event.end" must be a date-time like 2026-08-13T19:00:00` };
  }
  if (Date.parse(end) <= Date.parse(start)) {
    return { error: `message ${n}: the event ends before it starts` };
  }
  let cleanAttendees: string[] | undefined;
  if (attendees !== undefined) {
    if (!Array.isArray(attendees) || attendees.some((a) => typeof a !== 'string')) {
      return { error: `message ${n}: "event.attendees" must be an array of email addresses` };
    }
    if (attendees.length > MAX_EVENT_ATTENDEES) {
      return {
        error: `message ${n}: ${attendees.length} attendees — the cap is ${MAX_EVENT_ATTENDEES}`,
      };
    }
    for (const a of attendees as string[]) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.trim())) {
        return { error: `message ${n}: "${a}" is not an email address` };
      }
    }
    cleanAttendees = (attendees as string[]).map((a) => a.trim());
  }
  return {
    event: {
      start: start.trim(),
      end: end.trim(),
      ...(cleanAttendees && cleanAttendees.length > 0 ? { attendees: cleanAttendees } : {}),
    },
  };
}

function checkMessage(raw: unknown, n: number): { message?: OutboxMessage; error?: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: `message ${n} is not an object` };
  }
  const { to, name, subject, params, event, files, body } = raw as {
    to?: unknown;
    name?: unknown;
    subject?: unknown;
    params?: unknown;
    event?: unknown;
    files?: unknown;
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
  let cleanEvent: OutboxEvent | undefined;
  if (event !== undefined) {
    const checked = checkEvent(event, n);
    if (checked.error) return { error: checked.error };
    cleanEvent = checked.event;
  }
  let cleanFiles: string[] | undefined;
  if (files !== undefined) {
    const checked = checkFiles(files, n);
    if (checked.error) return { error: checked.error };
    cleanFiles = checked.files;
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
      ...(cleanEvent ? { event: cleanEvent } : {}),
      ...(cleanFiles && cleanFiles.length > 0 ? { files: cleanFiles } : {}),
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
 *
 * `files` are the user's own Start attachments as `input/<name>` (D-159) —
 * a file attached to a job whose whole point is one send can only have been
 * meant to ride it. `dir` is the sandbox they live in, so the composed
 * outbox passes the same existence check a session's file would.
 */
export function composeOutbox(
  channel: string,
  recipient: string,
  words: string,
  files?: string[],
  dir?: string,
): OutboxRead {
  const { to, name } = splitRecipient(recipient);
  return checkOutbox(
    {
      channel,
      messages: [
        {
          to,
          body: words,
          ...(name ? { name } : {}),
          ...(files && files.length > 0 ? { files } : {}),
        },
      ],
    },
    dir,
  );
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
  return checkOutbox(parsed, dir);
}

/**
 * The contract itself, over an already-parsed value.
 *
 * Split out from `readOutbox` so the deterministic composer (D-097) is held
 * to exactly the same contract as a session's own file — the caps, the
 * one-message-per-recipient rule, the fields that survive parsing. An outbox
 * built in code and an outbox written by a model must be the same object or
 * review and replay are looking at two different things.
 *
 * `dir` is the sandbox the outbox's `files` live in. With it, every named
 * file is required to exist and fit the caps — a message claiming a file the
 * run never wrote is the lie D-134 arrests at Start, told at the other end,
 * and it must not reach a review card. Without a dir only the shapes are
 * checked.
 */
export function checkOutbox(parsed: unknown, dir?: string): OutboxRead {
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
  // The calendar channel's own rules (D-104): one event per outbox — sends
  // are idempotent by recipient, and two events land on one calendar, so the
  // outbox that could double-book is refused rather than half-replayed. The
  // event block is likewise refused anywhere else, where no client reads it:
  // a field that parses and then silently does nothing is how a review card
  // and a send end up describing different things.
  const channelName = channel.trim().toLowerCase();
  if (channelName === 'calendar') {
    if (out.length !== 1) {
      return { error: 'the calendar channel takes exactly one event per outbox' };
    }
    if (!out[0].event) {
      return { error: 'a calendar outbox needs an "event" block with "start" and "end"' };
    }
    if (!out[0].subject) {
      return { error: 'a calendar event needs a "subject" — the event title' };
    }
  } else if (out.some((m) => m.event)) {
    return { error: `only the calendar channel takes an "event" block, not "${channelName}"` };
  }
  // Files ride only where a client can carry them (D-159) — the event
  // block's rule again: parsing a field no send would honour splits the
  // review card from the send.
  if (!FILE_CHANNELS.has(channelName) && out.some((m) => m.files)) {
    return {
      error: `only ${[...FILE_CHANNELS].join(' and ')} send "files", not "${channelName}"`,
    };
  }
  if (dir) {
    for (const [i, m] of out.entries()) {
      let total = 0;
      for (const f of m.files ?? []) {
        const full = outboxFilePath(dir, f);
        if (!full || !existsSync(full) || !statSync(full).isFile()) {
          return {
            error: `message ${i + 1}: "files" names "${f}" but no such file exists in the sandbox`,
          };
        }
        const bytes = statSync(full).size;
        if (bytes > MAX_OUTBOX_FILE_BYTES) {
          return {
            error: `message ${i + 1}: "${f}" is ${Math.round(bytes / (1024 * 1024))} MB — the cap per file is ${MAX_OUTBOX_FILE_BYTES / (1024 * 1024)} MB`,
          };
        }
        total += bytes;
      }
      if (total > MAX_OUTBOX_FILES_TOTAL_BYTES) {
        return {
          error: `message ${i + 1}: its files total ${Math.round(total / (1024 * 1024))} MB — the cap per message is ${MAX_OUTBOX_FILES_TOTAL_BYTES / (1024 * 1024)} MB`,
        };
      }
    }
  }
  return {
    outbox: {
      channel: channelName,
      ...(cleanTemplate ? { template: cleanTemplate } : {}),
      messages: out,
    },
  };
}
