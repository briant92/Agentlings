import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Cadence, ScheduleInfo } from '@agentlings/shared';
import type { StandingInput } from './standing';

/**
 * The recurrence timer (D-103). A schedule is a sentence queued again on a
 * calendar cadence — the missing piece between an engine that rewards
 * recurring work (recipe → leash → tool, standing approval) and jobs that
 * were still queued by hand.
 *
 * The prompt rides verbatim, because the recipe key IS the prompt (D-072):
 * a reworded repeat is a different job to the crew, and saying it the same
 * way every time is most of what a schedule is for.
 *
 * What fires it is a server sweep, not the OS and not a session: quotes,
 * channels and the queue live here, so the firing has to happen where they
 * are. Every firing goes through the same glue `/work` uses — a scheduled
 * job is a new way in, and an unquoted way in is the D-027 bug over again.
 *
 * Cadences are calendar shapes in the machine's local time — every day,
 * every <weekday>, monthly on day N — not cron syntax. This is M3's app:
 * the person it is for says "every Thursday at 9", not "0 9 * * 4".
 */
/**
 * What a mail trigger remembers between polls (D-248). `sinceMs` starts at
 * creation — a new rule never fires on the mailbox's past — and advances with
 * what it has seen; `seen` holds recently fired message ids because Gmail's
 * `after:` is second-granular, so the window alone can re-offer a message.
 * `day`/`count` carry the daily cap.
 */
export interface TriggerState {
  sinceMs: number;
  seen: string[];
  day?: string;
  count?: number;
}

export interface Schedule {
  id: string;
  /** The sentence, verbatim — the recipe key is the prompt (D-072). */
  prompt: string;
  /** Absent on a mail-triggered row — exactly one of cadence/trigger is set. */
  cadence?: Cadence;
  /**
   * Fires on mail arriving instead of on a calendar (D-248): a Gmail query in
   * the language `mail_search` already speaks. The poll appends `-from:me`
   * itself, so the user's own sends — including everything this app's outbox
   * sends — can never fire a rule, whatever the query says.
   */
  trigger?: { mail: string };
  triggerState?: TriggerState;
  /** The channel settled when the schedule was made, replayed on firing. */
  channel?: string;
  /** The send facts as the desk collected them (D-097's answers). */
  answers?: Record<string, string>;
  /**
   * Files the firing reads afresh, resolved at fire time (D-246). A schedule
   * could carry a prompt and nothing else, so recurring work could only reach
   * what was ambient — this is how a monthly reconciliation gets the month's
   * own statement without anyone attaching it again.
   */
  inputs?: StandingInput[];
  createdAt: number;
  /** The next occurrence. Advanced *before* the firing is attempted. */
  nextDueAt: number;
  lastFiredAt?: number;
  /** How the last firing failed, when it did. Cleared by a clean one. */
  lastError?: string;
  paused?: boolean;
}

/** How often the server looks for due schedules. */
export const SCHEDULE_SWEEP_MS = 30_000;

export function schedulesFile(dir: string): string {
  return path.join(dir, 'schedules.json');
}

export function readSchedules(dir: string): Schedule[] {
  const file = schedulesFile(dir);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Schedule[];
    return Array.isArray(parsed)
      ? parsed.filter((s) => s?.id && s?.prompt && (s?.cadence || s?.trigger))
      : [];
  } catch {
    return []; // a torn file must not take the level down
  }
}

function writeSchedules(dir: string, list: Schedule[]): void {
  writeFileSync(schedulesFile(dir), `${JSON.stringify(list, null, 2)}\n`, 'utf8');
}

/** The reason a cadence cannot be one, or null when it can. */
export function validCadence(cadence: Cadence | undefined): string | null {
  if (!cadence || typeof cadence !== 'object') return 'a cadence is required';
  const int = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
  if (!['daily', 'weekly', 'monthly'].includes(cadence.kind)) {
    return 'cadence must be daily, weekly or monthly';
  }
  if (!int(cadence.hour) || cadence.hour < 0 || cadence.hour > 23) return 'hour must be 0–23';
  if (!int(cadence.minute) || cadence.minute < 0 || cadence.minute > 59) {
    return 'minute must be 0–59';
  }
  if (cadence.kind === 'weekly' && (!int(cadence.dow) || cadence.dow < 0 || cadence.dow > 6)) {
    return 'weekly needs a day of the week (0–6, Sunday 0)';
  }
  if (cadence.kind === 'monthly' && (!int(cadence.day) || cadence.day < 1 || cadence.day > 31)) {
    return 'monthly needs a day of the month (1–31)';
  }
  return null;
}

/** As long as a Gmail query reasonably gets — past this it is a script, not a rule. */
export const MAX_TRIGGER_QUERY_CHARS = 300;

/**
 * The reason a mail trigger cannot be one, or null when it can (D-248).
 * Checked at creation for D-246's reason: a rule that could never work is a
 * mistake someone is making now, and now is when they can still fix it.
 */
export function validTrigger(trigger: { mail?: unknown } | undefined): string | null {
  if (!trigger || typeof trigger !== 'object') return 'a trigger is required';
  const query = typeof trigger.mail === 'string' ? trigger.mail.trim() : '';
  if (!query) return 'a mail trigger needs a Gmail query — from:someone, subject:invoice';
  if (query.length > MAX_TRIGGER_QUERY_CHARS) {
    return `the query is longer than ${MAX_TRIGGER_QUERY_CHARS} characters`;
  }
  // The query is spliced into a URL parameter next to terms the poll adds
  // (-from:me, after:); a line break would smuggle nothing today, but a rule
  // nobody can read back off one line is already wrong.
  if (/[\r\n]/.test(query)) return 'the query must be one line';
  return null;
}

/**
 * The next occurrence strictly after `from`, in local time.
 *
 * Calendar arithmetic throughout — days are added through the Date
 * constructor rather than by milliseconds, so a daylight-saving day is
 * still "tomorrow at 09:00" and not 23 or 25 hours away. A monthly day
 * beyond the month's end lands on its last day (31st → Feb 28), never in
 * the month after.
 */
export function computeNextDue(cadence: Cadence, from: number): number {
  const base = new Date(from);
  const build = (year: number, month: number, day: number) =>
    new Date(year, month, day, cadence.hour, cadence.minute, 0, 0);

  if (cadence.kind === 'daily') {
    const today = build(base.getFullYear(), base.getMonth(), base.getDate());
    if (today.getTime() > from) return today.getTime();
    return build(base.getFullYear(), base.getMonth(), base.getDate() + 1).getTime();
  }

  if (cadence.kind === 'weekly') {
    const dow = cadence.dow ?? 0;
    const shift = (dow - base.getDay() + 7) % 7;
    const candidate = build(base.getFullYear(), base.getMonth(), base.getDate() + shift);
    if (candidate.getTime() > from) return candidate.getTime();
    return build(
      candidate.getFullYear(),
      candidate.getMonth(),
      candidate.getDate() + 7,
    ).getTime();
  }

  const day = cadence.day ?? 1;
  const lastOf = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const inMonth = (year: number, month: number) =>
    build(year, month, Math.min(day, lastOf(year, month)));
  const thisMonth = inMonth(base.getFullYear(), base.getMonth());
  if (thisMonth.getTime() > from) return thisMonth.getTime();
  const year = base.getMonth() === 11 ? base.getFullYear() + 1 : base.getFullYear();
  return inMonth(year, (base.getMonth() + 1) % 12).getTime();
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`;
}

/**
 * A cadence written into the sentence (D-184): "every Monday at 9", "email me
 * the open PR list every morning".
 *
 * Read, never acted on. A schedule spends money on a timer, so this only
 * *fills in* the repeat controls the desk already has and says in words what
 * it read — Start still creates the schedule, and one click turns it off. That
 * is the split's doctrine rather than the send card's: a wrong reading here is
 * visible before anything is queued, so under-firing costs the feature while
 * over-firing costs a glance.
 *
 * The phrase comes back with the cadence because the line has to quote what it
 * matched. "Reads *every Monday at 9* as weekly" is checkable by the person
 * reading it; "this repeats weekly" is a claim they cannot check.
 */
export interface ReadCadence {
  cadence: Cadence;
  /** The words this was read from, quoted back on the card. */
  phrase: string;
}

/**
 * Recurrence words. Without one of these, nothing here claims anything.
 *
 * A *plural* weekday is its own recurrence word — "on Mondays" is a cadence
 * where "on Monday" is a date — which is the whole difference between a
 * standing job and a one-off, carried by one letter.
 */
const RECURS = /\b(every|each|daily|weekly|monthly|nightly)\b/i;
const PLURAL_DAY = /\bon\s+(?:sun|mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?)(?:day)?s\b/i;

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * A weekday named as a recurrence — "every Monday", "on Mondays". The
 * possessive is excluded: "every Monday's standup notes" names a subject, not
 * a cadence.
 */
const WEEKDAY =
  /\b(?:every|each|on)\s+(sun|mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?)(?:day)?s?\b(?!['’]s)/i;

/** "on the 12th", "on the 1st of each month" — the day a monthly cadence lands. */
const MONTH_DAY = /\bon the (\d{1,2})(?:st|nd|rd|th)?\b/i;

/**
 * A clock time — "at 9", "at 9am", "at 18:30", "at 6 pm". Bare "at 9" reads as
 * 09:00 rather than 21:00: a person who means the evening says so, and the
 * control is right there to correct either way.
 */
const AT_TIME = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;

/** Parts of the day, for sentences that name one instead of a clock time. */
const PART_OF_DAY: [RegExp, number][] = [
  [/\bevery morning\b|\beach morning\b|\bmornings\b/i, 9],
  [/\bevery afternoon\b|\bafternoons\b/i, 14],
  [/\bevery evening\b|\bevenings\b|\bevery night\b|\bnightly\b|\bnights\b/i, 18],
];

export function cadenceFrom(text: string): ReadCadence | null {
  if (!RECURS.test(text) && !PLURAL_DAY.test(text)) return null;
  const said: string[] = [];

  let hour = 9;
  let minute = 0;
  const clock = AT_TIME.exec(text);
  if (clock) {
    const raw = Number(clock[1]);
    if (raw > 23) return null;
    const suffix = clock[3]?.toLowerCase();
    hour = suffix === 'pm' && raw < 12 ? raw + 12 : suffix === 'am' && raw === 12 ? 0 : raw;
    minute = Number(clock[2] ?? 0);
    if (minute > 59) return null;
    said.push(clock[0].trim());
  } else {
    for (const [re, at] of PART_OF_DAY) {
      const part = re.exec(text);
      if (part) {
        hour = at;
        said.push(part[0].trim());
        break;
      }
    }
  }

  const weekday = WEEKDAY.exec(text);
  if (weekday) {
    const stem = weekday[1].toLowerCase();
    const dow = DAYS.findIndex((name) => name.startsWith(stem.replace(/s$/, '')));
    if (dow < 0) return null;
    said.unshift(weekday[0].trim());
    return { cadence: { kind: 'weekly', dow, hour, minute }, phrase: said.join(' ') };
  }

  const monthly = /\b(monthly|every month|each month)\b/i.exec(text);
  if (monthly) {
    const day = MONTH_DAY.exec(text);
    const on = day ? Number(day[1]) : 1;
    if (on < 1 || on > 31) return null;
    said.unshift(day ? `${monthly[0]} ${day[0]}`.trim() : monthly[0]);
    return { cadence: { kind: 'monthly', day: on, hour, minute }, phrase: said.join(' ') };
  }

  const daily = /\b(daily|every day|each day|every morning|every afternoon|every evening|every night|nightly)\b/i.exec(
    text,
  );
  if (daily) {
    if (!said.includes(daily[0].trim())) said.unshift(daily[0].trim());
    return { cadence: { kind: 'daily', hour, minute }, phrase: said.join(' ') };
  }

  const weekly = /\b(weekly|every week|each week)\b/i.exec(text);
  if (weekly) {
    // No day named, so the control's own default stands and the line says so.
    said.unshift(weekly[0].trim());
    return { cadence: { kind: 'weekly', dow: 1, hour, minute }, phrase: said.join(' ') };
  }
  return null;
}

/**
 * A mail trigger written into the sentence (D-248, on D-184's doctrine):
 * "when mail from the bank arrives", "whenever an email comes in", "when the
 * bank mails me", "on receiving a message". Read and quoted back, NEVER turned
 * into a query — "the bank" is not an address, and a guessed rule is a rule
 * that spends money on a timer nobody set. The reading only turns the chip
 * on; the words that reach Gmail are the ones typed into the field.
 *
 * Deliberately narrow: "mail the report every Monday" is a send, not a
 * trigger, so a mail word alone claims nothing — it takes an arrival verb or
 * "mails me" / "get an email" beside a "when".
 */
const TRIGGER_PATTERNS: RegExp[] = [
  // when [a|an|the] [up to four words] mail|email|message [from …] arrives|comes in|lands|is received
  /\bwhen(?:ever)?\s+(?:(?:a|an|the|any|new)\s+)?(?:[\p{L}\p{N}'’-]+\s+){0,4}?(?:e-?mails?|mails?|messages?)\s+(?:from\s+[^,;]+?\s+)?(?:arrives?|comes?\s+in|lands?|is\s+received|hits?\s+(?:my|the)\s+inbox)\b/iu,
  // when [the bank] mails|emails me
  /\bwhen(?:ever)?\s+(?:[\p{L}\p{N}'’-]+\s+){1,4}?(?:e-?mails?|mails?)\s+me\b/iu,
  // when I get|receive [a|an|the] mail|email|message
  /\bwhen(?:ever)?\s+(?:I\s+)?(?:get|receive)\s+(?:(?:a|an|the|any|new)\s+)?(?:e-?mail|mail|message)s?\b/iu,
  // on|upon receiving|getting [a|an] mail|email|message
  /\b(?:on|upon)\s+(?:receiving|getting)\s+(?:(?:a|an|the|any|new)\s+)?(?:e-?mail|mail|message)s?\b/iu,
];

export function triggerFrom(text: string): { phrase: string } | null {
  for (const re of TRIGGER_PATTERNS) {
    const hit = re.exec(text);
    if (hit) return { phrase: hit[0].trim() };
  }
  return null;
}

/** The cadence in words — one wording, used by the panel and the terminal alike. */
export function describeCadence(cadence: Cadence): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const at = `${pad(cadence.hour)}:${pad(cadence.minute)}`;
  if (cadence.kind === 'daily') return `every day at ${at}`;
  if (cadence.kind === 'weekly') return `every ${DAY_NAMES[cadence.dow ?? 0]} at ${at}`;
  return `monthly on the ${ordinal(cadence.day ?? 1)} at ${at}`;
}

export function createSchedule(
  dir: string,
  args: {
    prompt: string;
    /** Exactly one of cadence/trigger — the route refuses anything else. */
    cadence?: Cadence;
    trigger?: { mail: string };
    channel?: string;
    answers?: Record<string, string>;
    inputs?: StandingInput[];
  },
  now: number,
): Schedule {
  const schedule: Schedule = {
    id: randomUUID().slice(0, 8),
    prompt: args.prompt,
    ...(args.cadence ? { cadence: args.cadence } : {}),
    ...(args.trigger
      ? {
          trigger: { mail: args.trigger.mail.trim() },
          // `sinceMs: now` is the rule that a new trigger never fires on the
          // mailbox's past — only mail arriving after someone made it.
          triggerState: { sinceMs: now, seen: [] },
        }
      : {}),
    ...(args.channel ? { channel: args.channel } : {}),
    ...(args.answers && Object.keys(args.answers).length ? { answers: args.answers } : {}),
    ...(args.inputs?.length ? { inputs: args.inputs } : {}),
    createdAt: now,
    // A trigger row has no next occurrence; 0 must never read as "due now",
    // which is why dueNow demands a cadence before it looks at the clock.
    nextDueAt: args.cadence ? computeNextDue(args.cadence, now) : 0,
  };
  const list = readSchedules(dir);
  list.push(schedule);
  writeSchedules(dir, list);
  return schedule;
}

/**
 * Everything the CALENDAR sweep should fire now: cadence rows, unpaused and
 * past due. Trigger rows never come due by the clock — their `nextDueAt` is 0,
 * which without the cadence guard would read as "always due" (D-248).
 */
export function dueNow(list: Schedule[], now: number): (Schedule & { cadence: Cadence })[] {
  return list.filter(
    (s): s is Schedule & { cadence: Cadence } => !!s.cadence && !s.paused && s.nextDueAt <= now,
  );
}

/**
 * Record one mail-trigger poll (D-248): advance the watermark and the seen
 * ring, count firings against the daily cap, and land or clear the row's
 * error — the same row-as-record shape as markFired, for the same reason.
 */
export function noteTriggerPoll(
  dir: string,
  id: string,
  patch: {
    sinceMs?: number;
    seen?: string[];
    fired?: number;
    day?: string;
    firedAt?: number;
    error?: string | null;
  },
): Schedule | undefined {
  const list = readSchedules(dir);
  const schedule = list.find((s) => s.id === id);
  if (!schedule?.trigger) return undefined;
  const state = schedule.triggerState ?? { sinceMs: schedule.createdAt, seen: [] };
  if (patch.sinceMs !== undefined) state.sinceMs = Math.max(state.sinceMs, patch.sinceMs);
  if (patch.seen) state.seen = patch.seen.slice(-TRIGGER_SEEN_CAP);
  if (patch.day !== undefined) {
    if (state.day !== patch.day) {
      state.day = patch.day;
      state.count = 0;
    }
    if (patch.fired) state.count = (state.count ?? 0) + patch.fired;
  }
  schedule.triggerState = state;
  if (patch.firedAt !== undefined) schedule.lastFiredAt = patch.firedAt;
  if (patch.error === null) delete schedule.lastError;
  else if (patch.error !== undefined) schedule.lastError = patch.error;
  writeSchedules(dir, list);
  return schedule;
}

/**
 * Fired message ids kept per rule. Enough that nothing inside the `after:`
 * second-window can double-fire, small enough that the file stays a file.
 */
export const TRIGGER_SEEN_CAP = 200;

/**
 * Advance a schedule past a firing. The caller calls this *before*
 * attempting to queue, so a firing that throws cannot come due again
 * thirty seconds later — the error lands on the row instead, and the next
 * occurrence stands. Advancing from `now` rather than from the missed slot
 * is also what collapses downtime: a server off for three weeks fires a
 * weekly schedule once, not three times.
 */
export function markFired(
  dir: string,
  id: string,
  now: number,
  error?: string,
): Schedule | undefined {
  const list = readSchedules(dir);
  const schedule = list.find((s) => s.id === id);
  if (!schedule?.cadence) return undefined;
  schedule.nextDueAt = computeNextDue(schedule.cadence, now);
  schedule.lastFiredAt = now;
  if (error) schedule.lastError = error;
  else delete schedule.lastError;
  writeSchedules(dir, list);
  return schedule;
}

/**
 * Pause means "not while paused", and resume means "from the next
 * occurrence" — resuming recomputes from now, so a schedule paused past
 * its moment does not fire the backlog the instant it is switched back on.
 */
export function setPaused(
  dir: string,
  id: string,
  paused: boolean,
  now: number,
): Schedule | undefined {
  const list = readSchedules(dir);
  const schedule = list.find((s) => s.id === id);
  if (!schedule) return undefined;
  if (paused) schedule.paused = true;
  else {
    delete schedule.paused;
    // A trigger row resumes the same way a cadence one does — from now, never
    // the backlog: mail that arrived while paused stays unfired.
    if (schedule.cadence) schedule.nextDueAt = computeNextDue(schedule.cadence, now);
    else if (schedule.triggerState) schedule.triggerState.sinceMs = now;
  }
  writeSchedules(dir, list);
  return schedule;
}

export function removeSchedule(dir: string, id: string): boolean {
  const list = readSchedules(dir);
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  writeSchedules(dir, next);
  return true;
}

/** The trigger in words — the same one-wording rule as describeCadence. */
export function describeTrigger(trigger: { mail: string }): string {
  return `when mail matching "${trigger.mail}" arrives`;
}

export function describeSchedule(schedule: Schedule): ScheduleInfo {
  return {
    id: schedule.id,
    prompt: schedule.prompt,
    ...(schedule.cadence ? { cadence: schedule.cadence } : {}),
    ...(schedule.trigger ? { trigger: { mail: schedule.trigger.mail } } : {}),
    cadenceLabel: schedule.cadence
      ? describeCadence(schedule.cadence)
      : describeTrigger(schedule.trigger!),
    ...(schedule.channel ? { channel: schedule.channel } : {}),
    createdAt: schedule.createdAt,
    ...(schedule.cadence ? { nextDueAt: schedule.nextDueAt } : {}),
    ...(schedule.lastFiredAt ? { lastFiredAt: schedule.lastFiredAt } : {}),
    ...(schedule.lastError ? { lastError: schedule.lastError } : {}),
    paused: !!schedule.paused,
  };
}
