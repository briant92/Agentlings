import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Cadence } from '@agentlings/shared';
import {
  cadenceFrom,
  computeNextDue,
  createSchedule,
  describeCadence,
  describeSchedule,
  describeTrigger,
  dueNow,
  LEGACY_DOORS_NOTE,
  markFired,
  MAX_TRIGGER_QUERY_CHARS,
  noteTriggerPoll,
  readSchedules,
  removeSchedule,
  schedulesFile,
  setPaused,
  TRIGGER_SEEN_CAP,
  triggerFrom,
  validCadence,
  validReport,
  validTools,
  validTrigger,
} from './schedules';

// Local-time fixtures, built the way the implementation builds them so the
// assertions say "same calendar moment" rather than repeating the arithmetic.
const at = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(y, mo, d, h, mi, 0, 0).getTime();

const daily = (hour: number, minute: number): Cadence => ({ kind: 'daily', hour, minute });
const weekly = (dow: number, hour: number, minute: number): Cadence => ({
  kind: 'weekly',
  dow,
  hour,
  minute,
});
const monthly = (day: number, hour: number, minute: number): Cadence => ({
  kind: 'monthly',
  day,
  hour,
  minute,
});

describe('computeNextDue', () => {
  // 2026-08-06 is a Thursday (getDay() === 4).
  const thursday0800 = at(2026, 7, 6, 8, 0);

  it('daily: later today when the time has not passed', () => {
    expect(computeNextDue(daily(9, 30), thursday0800)).toBe(at(2026, 7, 6, 9, 30));
  });

  it('daily: tomorrow when the time has passed', () => {
    expect(computeNextDue(daily(7, 0), thursday0800)).toBe(at(2026, 7, 7, 7, 0));
  });

  it('daily: strictly after — exactly on the moment rolls to tomorrow', () => {
    expect(computeNextDue(daily(8, 0), thursday0800)).toBe(at(2026, 7, 7, 8, 0));
  });

  it('weekly: today when the day matches and the time is still ahead', () => {
    expect(computeNextDue(weekly(4, 9, 0), thursday0800)).toBe(at(2026, 7, 6, 9, 0));
  });

  it('weekly: next week when today matched but the time has passed', () => {
    expect(computeNextDue(weekly(4, 7, 0), thursday0800)).toBe(at(2026, 7, 13, 7, 0));
  });

  it('weekly: the coming occurrence of another day', () => {
    // Monday after Thursday 2026-08-06 is 2026-08-10.
    expect(computeNextDue(weekly(1, 18, 30), thursday0800)).toBe(at(2026, 7, 10, 18, 30));
  });

  it('monthly: this month when the day is still ahead', () => {
    expect(computeNextDue(monthly(15, 9, 0), thursday0800)).toBe(at(2026, 7, 15, 9, 0));
  });

  it('monthly: next month when the day has passed', () => {
    expect(computeNextDue(monthly(1, 9, 0), thursday0800)).toBe(at(2026, 8, 1, 9, 0));
  });

  it('monthly: day 31 lands on the last day of a short month', () => {
    // From April 1: April has 30 days, so the 31st clamps to the 30th.
    expect(computeNextDue(monthly(31, 9, 0), at(2026, 3, 1, 0, 0))).toBe(at(2026, 3, 30, 9, 0));
  });

  it('monthly: day 31 from late January clamps into February', () => {
    // 2026 is not a leap year.
    expect(computeNextDue(monthly(31, 9, 0), at(2026, 0, 31, 10, 0))).toBe(at(2026, 1, 28, 9, 0));
  });

  it('monthly: December rolls the year', () => {
    expect(computeNextDue(monthly(5, 9, 0), at(2026, 11, 20, 0, 0))).toBe(at(2027, 0, 5, 9, 0));
  });
});

describe('describeCadence', () => {
  it('words each shape, zero-padded', () => {
    expect(describeCadence(daily(7, 5))).toBe('every day at 07:05');
    expect(describeCadence(weekly(4, 18, 30))).toBe('every Thursday at 18:30');
    expect(describeCadence(monthly(1, 9, 0))).toBe('monthly on the 1st at 09:00');
  });

  it('gets the awkward ordinals right', () => {
    expect(describeCadence(monthly(2, 9, 0))).toContain('2nd');
    expect(describeCadence(monthly(3, 9, 0))).toContain('3rd');
    expect(describeCadence(monthly(11, 9, 0))).toContain('11th');
    expect(describeCadence(monthly(23, 9, 0))).toContain('23rd');
  });
});

describe('validCadence', () => {
  it('requires a cadence and a known kind', () => {
    expect(validCadence(undefined)).toMatch(/required/);
    expect(validCadence({ kind: 'hourly' } as unknown as Cadence)).toMatch(/daily, weekly/);
  });

  it('bounds the clock fields', () => {
    expect(validCadence({ kind: 'daily', hour: 24, minute: 0 })).toMatch(/hour/);
    expect(validCadence({ kind: 'daily', hour: 9, minute: 60 })).toMatch(/minute/);
  });

  it('weekly needs a day of the week, monthly a day of the month', () => {
    expect(validCadence({ kind: 'weekly', hour: 9, minute: 0 })).toMatch(/day of the week/);
    expect(validCadence({ kind: 'monthly', hour: 9, minute: 0 })).toMatch(/day of the month/);
    expect(validCadence({ kind: 'monthly', day: 32, hour: 9, minute: 0 })).toMatch(
      /day of the month/,
    );
  });

  it('accepts the three real shapes', () => {
    expect(validCadence(daily(9, 0))).toBeNull();
    expect(validCadence(weekly(0, 23, 59))).toBeNull();
    expect(validCadence(monthly(31, 0, 0))).toBeNull();
  });
});

describe('the store', () => {
  let dir: string;
  const now = at(2026, 7, 6, 8, 0);

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sched-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates with the next occurrence already computed, and persists the send facts', () => {
    const s = createSchedule(
      dir,
      {
        prompt: 'Send a Telegram to Brian',
        cadence: weekly(4, 9, 0),
        channel: 'telegram',
        answers: { 'send-to': 'Brian — 1000000001', 'send-say': 'padel tonight' },
      },
      now,
    );
    expect(s.nextDueAt).toBeGreaterThan(now);
    const read = readSchedules(dir);
    expect(read).toHaveLength(1);
    expect(read[0].channel).toBe('telegram');
    expect(read[0].answers?.['send-to']).toBe('Brian — 1000000001');
  });

  it('drops empty answers rather than storing an empty object', () => {
    const s = createSchedule(dir, { prompt: 'x', cadence: daily(9, 0), answers: {} }, now);
    expect(readSchedules(dir)[0].answers).toBeUndefined();
    expect(s.answers).toBeUndefined();
  });

  it('a torn file reads as empty, not as a crash', () => {
    writeFileSync(schedulesFile(dir), '{ not json', 'utf8');
    expect(readSchedules(dir)).toEqual([]);
  });

  it('dueNow takes only the unpaused past-due', () => {
    const past = createSchedule(dir, { prompt: 'a', cadence: daily(9, 0) }, now);
    const paused = createSchedule(dir, { prompt: 'b', cadence: daily(9, 0) }, now);
    setPaused(dir, paused.id, true, now);
    createSchedule(dir, { prompt: 'c', cadence: daily(23, 0) }, now); // still ahead at 09:01
    const later = at(2026, 7, 6, 9, 1);
    const due = dueNow(readSchedules(dir), later);
    expect(due.map((s) => s.id)).toEqual([past.id]);
  });

  it('markFired advances past downtime in one step — a missed month fires once', () => {
    const s = createSchedule(dir, { prompt: 'monthly note', cadence: monthly(1, 9, 0) }, now);
    // The server slept through September's firing and wakes mid-October.
    const wake = at(2026, 9, 15, 12, 0);
    const fired = markFired(dir, s.id, wake);
    expect(fired?.lastFiredAt).toBe(wake);
    // One step: the next occurrence is November's, not September's backlog.
    expect(fired?.nextDueAt).toBe(at(2026, 10, 1, 9, 0));
    expect(dueNow(readSchedules(dir), wake)).toEqual([]);
  });

  it('markFired records a firing error, and a clean firing clears it', () => {
    const s = createSchedule(dir, { prompt: 'x', cadence: daily(9, 0) }, now);
    markFired(dir, s.id, at(2026, 7, 6, 9, 0), 'the level was busy');
    expect(readSchedules(dir)[0].lastError).toBe('the level was busy');
    markFired(dir, s.id, at(2026, 7, 7, 9, 0));
    expect(readSchedules(dir)[0].lastError).toBeUndefined();
  });

  it('resume recomputes from now — a pause is never a backlog', () => {
    const s = createSchedule(dir, { prompt: 'x', cadence: weekly(4, 9, 0) }, now);
    setPaused(dir, s.id, true, now);
    // Resumed three weeks later: the next firing is the coming Thursday,
    // not the three that were slept through.
    const resumeAt = at(2026, 7, 27, 10, 0); // a Thursday, after 09:00
    const resumed = setPaused(dir, s.id, false, resumeAt);
    expect(resumed?.paused).toBeUndefined();
    expect(resumed?.nextDueAt).toBe(at(2026, 8, 3, 9, 0));
    expect(dueNow(readSchedules(dir), resumeAt)).toEqual([]);
  });

  it('removeSchedule removes, and says so honestly for a stranger', () => {
    const s = createSchedule(dir, { prompt: 'x', cadence: daily(9, 0) }, now);
    expect(removeSchedule(dir, 'nope')).toBe(false);
    expect(removeSchedule(dir, s.id)).toBe(true);
    expect(readSchedules(dir)).toEqual([]);
  });

  it('describeSchedule carries the wording and a real boolean', () => {
    const s = createSchedule(dir, { prompt: 'x', cadence: weekly(1, 18, 30) }, now);
    const info = describeSchedule(s);
    expect(info.cadenceLabel).toBe('every Monday at 18:30');
    expect(info.paused).toBe(false);
    expect(info.lastError).toBeUndefined();
  });
});

/**
 * A cadence written into the sentence (D-184). Read and shown, never acted on
 * — Start with a repeat set creates a schedule that spends money on a timer,
 * so these pin both halves: what it reads, and what it leaves alone.
 */
describe('cadenceFrom', () => {
  it('reads the two sentences the corpus was built around', () => {
    expect(cadenceFrom('Every Monday at 9, telegram me the UF and the dollar')).toEqual({
      cadence: { kind: 'weekly', dow: 1, hour: 9, minute: 0 },
      phrase: 'Every Monday at 9',
    });
    expect(cadenceFrom('Email me the open PR list every morning')?.cadence).toEqual({
      kind: 'daily',
      hour: 9,
      minute: 0,
    });
  });

  it('reads the weekdays, in the numbering Date.getDay uses', () => {
    expect(cadenceFrom('every Sunday')?.cadence.dow).toBe(0);
    expect(cadenceFrom('every Friday')?.cadence.dow).toBe(5);
    expect(cadenceFrom('on Tuesdays')?.cadence.dow).toBe(2);
    expect(cadenceFrom('every Weds')?.cadence.dow).toBe(3);
  });

  it('reads a clock time, am and pm alike', () => {
    expect(cadenceFrom('every day at 18:30')?.cadence).toMatchObject({ hour: 18, minute: 30 });
    expect(cadenceFrom('every day at 6pm')?.cadence).toMatchObject({ hour: 18, minute: 0 });
    expect(cadenceFrom('every day at 7 am')?.cadence).toMatchObject({ hour: 7, minute: 0 });
    // Bare "at 9" is nine in the morning; a person who means the evening says so.
    expect(cadenceFrom('every day at 9')?.cadence.hour).toBe(9);
  });

  it('reads monthly, with or without the day', () => {
    expect(cadenceFrom('monthly on the 12th')?.cadence).toEqual({
      kind: 'monthly',
      day: 12,
      hour: 9,
      minute: 0,
    });
    expect(cadenceFrom('every month')?.cadence).toMatchObject({ kind: 'monthly', day: 1 });
  });

  it('says nothing without a recurrence word — a one-off keeps its date', () => {
    expect(cadenceFrom('telegram me the UF on Monday')).toBeNull();
    expect(cadenceFrom('put the dentist on my calendar for Thursday at 6pm')).toBeNull();
    expect(cadenceFrom('summarise the expenses CSV')).toBeNull();
  });

  it('a weekday as a subject is not a cadence', () => {
    // "every Monday's standup notes" names what to work on, not when to run.
    expect(cadenceFrom("summarise every Monday's standup notes")).toBeNull();
  });

  it('refuses a time that is not one, rather than inventing an hour', () => {
    expect(cadenceFrom('every day at 99')).toBeNull();
    expect(cadenceFrom('every day at 9:77')).toBeNull();
  });

  /** The phrase is quoted on the card, so it has to be the words that were read. */
  it('hands back the words it read, for the card to quote', () => {
    expect(cadenceFrom('Email me the open PR list every morning')?.phrase).toBe('every morning');
    expect(cadenceFrom('run it monthly on the 12th at 07:30')?.phrase).toContain('monthly on the 12th');
  });

  it('the wording it produces is the one every surface already uses', () => {
    const read = cadenceFrom('every Monday at 9')!;
    expect(describeCadence(read.cadence)).toBe('every Monday at 09:00');
  });
});


describe('standing inputs on a schedule (D-246)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sched-standing-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const cadence: Cadence = { kind: 'monthly', day: 1, hour: 8, minute: 10 };
  const inputs = [{ dir: path.resolve('/books'), match: 'estado', as: 'statement.xlsx' }];

  /**
   * The seam this project keeps re-learning: a field complete in the type and
   * the route, dropped by the one function that builds the object. Read back
   * off disk rather than off the return value, because that is the path a
   * firing actually takes.
   */
  it('survives the round trip to disk', () => {
    createSchedule(dir, { prompt: 'reconcile the books', cadence, inputs }, 1000);
    expect(readSchedules(dir)[0].inputs).toEqual(inputs);
  });

  it('stays absent when none were given, rather than becoming an empty list', () => {
    createSchedule(dir, { prompt: 'say hi', cadence }, 1000);
    expect(readSchedules(dir)[0]).not.toHaveProperty('inputs');
  });
});

describe('mail triggers on a schedule (D-248)', () => {
  let dir: string;
  const now = at(2026, 7, 24, 10, 0);
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sched-trigger-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const make = (query = 'from:banco subject:estado') =>
    createSchedule(dir, { prompt: 'reconcile what arrived', trigger: { mail: query } }, now);

  describe('validTrigger', () => {
    it('needs a query', () => {
      expect(validTrigger(undefined)).toContain('required');
      expect(validTrigger({ mail: '   ' })).toContain('Gmail query');
    });
    it('bounds the query and keeps it one line', () => {
      expect(validTrigger({ mail: 'x'.repeat(MAX_TRIGGER_QUERY_CHARS + 1) })).toContain('longer');
      expect(validTrigger({ mail: 'from:a\nto:b' })).toContain('one line');
      expect(validTrigger({ mail: 'from:banco' })).toBeNull();
    });
  });

  it('creates watching from now — a new rule never fires on the mailbox past', () => {
    const s = make();
    expect(s.cadence).toBeUndefined();
    expect(s.triggerState).toEqual({ sinceMs: now, seen: [] });
    const read = readSchedules(dir)[0];
    expect(read.trigger?.mail).toBe('from:banco subject:estado');
    expect(read.triggerState?.sinceMs).toBe(now);
  });

  /**
   * The hazard the cadence guard closes: a trigger row's nextDueAt is 0,
   * which without the guard reads as "due since 1970" — the calendar sweep
   * would fire the prompt every thirty seconds with no mail anywhere.
   */
  it('the calendar sweep never takes a trigger row', () => {
    make();
    expect(dueNow(readSchedules(dir), now + 1)).toEqual([]);
  });

  it('markFired refuses a trigger row — it has no next occurrence to compute', () => {
    const s = make();
    expect(markFired(dir, s.id, now + 1000)).toBeUndefined();
  });

  it('resume moves the watermark to now — mail during a pause stays unfired', () => {
    const s = make();
    setPaused(dir, s.id, true, now + 1000);
    const resumed = setPaused(dir, s.id, false, now + 5000);
    expect(resumed?.triggerState?.sinceMs).toBe(now + 5000);
  });

  describe('noteTriggerPoll', () => {
    it('advances the watermark forwards only, and caps the seen ring', () => {
      const s = make();
      noteTriggerPoll(dir, s.id, { sinceMs: now + 9000, seen: ['a', 'b'] });
      // A poll answering out of order must not rewind past what was seen.
      noteTriggerPoll(dir, s.id, { sinceMs: now + 4000 });
      const read = readSchedules(dir)[0];
      expect(read.triggerState?.sinceMs).toBe(now + 9000);
      const many = Array.from({ length: TRIGGER_SEEN_CAP + 50 }, (_, i) => `id${i}`);
      noteTriggerPoll(dir, s.id, { seen: many });
      expect(readSchedules(dir)[0].triggerState?.seen).toHaveLength(TRIGGER_SEEN_CAP);
      expect(readSchedules(dir)[0].triggerState?.seen.at(-1)).toBe(`id${TRIGGER_SEEN_CAP + 49}`);
    });

    it('counts firings within a day and resets on the next', () => {
      const s = make();
      noteTriggerPoll(dir, s.id, { day: '2026-08-24', fired: 3 });
      noteTriggerPoll(dir, s.id, { day: '2026-08-24', fired: 2 });
      expect(readSchedules(dir)[0].triggerState?.count).toBe(5);
      noteTriggerPoll(dir, s.id, { day: '2026-08-25', fired: 1 });
      expect(readSchedules(dir)[0].triggerState?.count).toBe(1);
    });

    it('lands an error, clears it on null, and leaves it on undefined', () => {
      const s = make();
      noteTriggerPoll(dir, s.id, { error: 'Google refused the mailbox' });
      expect(readSchedules(dir)[0].lastError).toBe('Google refused the mailbox');
      noteTriggerPoll(dir, s.id, { firedAt: now + 100 });
      expect(readSchedules(dir)[0].lastError).toBe('Google refused the mailbox');
      noteTriggerPoll(dir, s.id, { error: null });
      expect(readSchedules(dir)[0].lastError).toBeUndefined();
    });

    it('refuses a cadence row — trigger bookkeeping belongs to trigger rows', () => {
      const s = createSchedule(
        dir,
        { prompt: 'x', cadence: { kind: 'daily', hour: 9, minute: 0 } },
        now,
      );
      expect(noteTriggerPoll(dir, s.id, { error: 'nope' })).toBeUndefined();
      expect(readSchedules(dir)[0].lastError).toBeUndefined();
    });
  });

  /**
   * A trigger written into the sentence (D-248, on D-184's doctrine): read
   * and quoted back, never turned into a query. Both halves are pinned —
   * what it reads, and the send sentences it must leave alone, because a
   * chip that comes on by itself makes Start arm a rule that spends money.
   */
  describe('triggerFrom', () => {
    it('reads the arrival shapes and quotes the words', () => {
      expect(triggerFrom('When mail from the bank arrives, summarise input/mail.txt')).toEqual({
        phrase: 'When mail from the bank arrives',
      });
      expect(triggerFrom('whenever an email comes in, read it')?.phrase).toBe(
        'whenever an email comes in',
      );
      expect(triggerFrom('when the bank mails me, reconcile the books')?.phrase).toBe(
        'when the bank mails me',
      );
      expect(triggerFrom('when I get a message about the invoice, file it')?.phrase).toBe(
        'when I get a message',
      );
      expect(triggerFrom('on receiving an e-mail, summarise it')?.phrase).toBe(
        'on receiving an e-mail',
      );
    });

    it('never reads a send as a trigger', () => {
      for (const sentence of [
        'mail the report to Ana every Monday',
        'email me the open PR list every morning',
        'send a mail to the bank asking for the statement',
        'read my mail and summarise it',
        'when you are done, mail Ana the summary',
      ]) {
        expect(triggerFrom(sentence)).toBeNull();
      }
    });

    it('never produces a query — the words name no address', () => {
      const read = triggerFrom('when mail from cartola@banco.cl arrives, read it')!;
      expect(Object.keys(read)).toEqual(['phrase']);
    });
  });

  it('describeSchedule labels the trigger and names no next occurrence', () => {
    const info = describeSchedule(make('from:banco'));
    expect(info.cadenceLabel).toBe(describeTrigger({ mail: 'from:banco' }));
    expect(info.cadenceLabel).toContain('when mail matching');
    expect(info.cadence).toBeUndefined();
    expect(info.nextDueAt).toBeUndefined();
    expect(info.trigger?.mail).toBe('from:banco');
  });
});

/**
 * A rule's firing holds only the doors it names (D-254, #9). The row carries
 * `tools`; a row that names none holds none; a row written before the field
 * existed is legacy — it keeps the old grant (every door) and says so.
 */
describe('the doors a row names', () => {
  let dir: string;
  const now = at(2026, 7, 6, 8, 0);

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sched-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('a row naming no doors persists an EMPTY list — none, not absent', () => {
    createSchedule(dir, { prompt: 'x', cadence: daily(9, 0) }, now);
    expect(readSchedules(dir)[0].tools).toEqual([]);
  });

  it('a row naming doors persists exactly those', () => {
    createSchedule(dir, { prompt: 'x', cadence: daily(9, 0), tools: ['bls', 'web'] }, now);
    expect(readSchedules(dir)[0].tools).toEqual(['bls', 'web']);
  });

  it('a mail rule persists its doors the same way', () => {
    createSchedule(dir, { prompt: 'x', trigger: { mail: 'from:a@b.c' }, tools: [] }, now);
    expect(readSchedules(dir)[0].tools).toEqual([]);
  });

  it('a legacy row — written before the field — reads with tools absent and says so', () => {
    writeFileSync(
      schedulesFile(dir),
      JSON.stringify([
        { id: 'old1', prompt: 'old', cadence: daily(9, 0), createdAt: 1, nextDueAt: 2 },
      ]),
      'utf8',
    );
    const [row] = readSchedules(dir);
    expect(row.tools).toBeUndefined();
    const info = describeSchedule(row);
    expect(info.tools).toBeUndefined();
    expect(info.cadenceLabel).toBe(`every day at 09:00 — ${LEGACY_DOORS_NOTE}`);
  });

  it('a row with the field describes its doors and carries no legacy note', () => {
    const none = createSchedule(dir, { prompt: 'x', cadence: daily(9, 0) }, now);
    const some = createSchedule(dir, { prompt: 'y', trigger: { mail: 'from:a' }, tools: ['mail'] }, now);
    expect(describeSchedule(none).tools).toEqual([]);
    expect(describeSchedule(none).cadenceLabel).toBe('every day at 09:00');
    expect(describeSchedule(some).tools).toEqual(['mail']);
    expect(describeSchedule(some).cadenceLabel).not.toContain(LEGACY_DOORS_NOTE);
  });

  describe('validTools', () => {
    const doors = ['web', 'bls', 'calendar'];

    it('accepts an omitted list, an empty list and door names', () => {
      expect(validTools(undefined, doors)).toBeNull();
      expect(validTools([], doors)).toBeNull();
      expect(validTools(['bls', 'web'], doors)).toBeNull();
    });

    it('refuses a name that is not a door, naming it', () => {
      expect(validTools(['bls', 'telegram'], doors)).toMatch(/telegram/);
      expect(validTools(['nosuch'], doors)).toMatch(/nosuch/);
    });

    it('refuses a list that is not a list of strings', () => {
      expect(validTools('bls' as unknown as string[], doors)).not.toBeNull();
      expect(validTools([1] as unknown as string[], doors)).not.toBeNull();
    });

    // D-255: a supervised door is one a person watches — a firing has nobody
    // at the window, so a rule naming it is refused at creation, by name and
    // with the reason, even though it is otherwise a door a job may hold.
    it('refuses a supervised door by name, saying only a hand-queued job may hold it', () => {
      const reason = validTools(['web', 'browser-act'], [...doors, 'browser-act'], ['browser-act']);
      expect(reason).toMatch(/browser-act/);
      expect(reason).toMatch(/by hand/);
      expect(validTools(['web'], [...doors, 'browser-act'], ['browser-act'])).toBeNull();
    });
  });

  // The score arrives on Monday (D-261): a row that sends the week's real
  // work, composed by the app — a channel and a recipient, and no doors.
  describe('a report row', () => {
    const cadence = weekly(1, 8, 5);

    it('is written with its report and read back with it', () => {
      const made = createSchedule(
        dir,
        { prompt: 'the score', cadence, channel: 'telegram', answers: { 'send-to:telegram': '1' }, report: 'realwork' },
        now,
      );
      expect(made.report).toBe('realwork');
      expect(made.tools).toEqual([]);
      const [row] = readSchedules(dir);
      expect(row.report).toBe('realwork');
      expect(row.channel).toBe('telegram');
      expect(row.answers).toEqual({ 'send-to:telegram': '1' });
    });

    it('describes itself as the score at $0 with no model, and carries the field', () => {
      const made = createSchedule(
        dir,
        { prompt: 'the score', cadence, channel: 'telegram', report: 'realwork' },
        now,
      );
      const info = describeSchedule(made);
      expect(info.report).toBe('realwork');
      expect(info.cadenceLabel).toBe('every Monday at 08:05 — the score, $0, no model');
      expect(describeSchedule(createSchedule(dir, { prompt: 'x', cadence }, now)).report).toBeUndefined();
    });

    describe('validReport', () => {
      const good = { report: 'realwork', channel: 'telegram', to: '1000000001' };

      it('accepts realwork with a channel and a recipient', () => {
        expect(validReport(good)).toBeNull();
        expect(validReport({ ...good, tools: [] })).toBeNull();
      });

      it('refuses a report it does not know', () => {
        expect(validReport({ ...good, report: 'weather' })).toMatch(/weather/);
        expect(validReport({ ...good, report: 1 })).not.toBeNull();
      });

      it('refuses a report without a channel or without a recipient', () => {
        expect(validReport({ report: 'realwork', to: '1' })).toMatch(/channel/);
        expect(validReport({ report: 'realwork', channel: 'telegram' })).toMatch(/recipient/);
        expect(validReport({ report: 'realwork', channel: 'telegram', to: '  ' })).toMatch(/recipient/);
      });

      it('refuses doors and a mail trigger — the block is read off disk, on a calendar', () => {
        expect(validReport({ ...good, tools: ['mail'] })).toMatch(/door/);
        expect(validReport({ ...good, trigger: { mail: 'from:a' } })).toMatch(/calendar/);
      });
    });
  });
});
