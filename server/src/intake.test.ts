import { existsSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Job, JobEvent, Quote } from '@agentlings/shared';
import type { Connection } from './connections';
import { EventLog } from './events';
import { createLevelFiles, levelDir, readRoster, type LevelMeta } from './levels';
import { MatchIndex } from './match';
import { GATHER_SENTENCE, PLAN_SENTENCE } from './party';
import { JobQueue } from './queue';
import { readRefusals, recordRefusalKeys, refusalsFile } from './refusals';
import { RoleRegistry, listSkills } from './roles';
import { readSettings } from './settings';
import { writeAudience } from './audience';
import type { InstallContext } from './verdict';
import {
  type CatalogContext,
  type IntakeContext,
  type IntakeRuntime,
  PLAIN_ONLY,
  queue,
  queueParty,
  read,
} from './intake';

/**
 * Intake through its two verbs alone (D-287): a temp level on disk with a real
 * queue, the real role catalog, a fake connection for the one channel, and
 * assertions on the shape `read` decides, the card it returns, and the jobs
 * `queue` then adds. `read` is pure — nothing here reaches past it, and the
 * refusals file is asserted absent before and after — and `queue` counts
 * nothing either: the meter is Start's, fed from the reading's keys.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

/** The real installed catalog — roles and skills as the app ships them. */
const registry = new RoleRegistry(path.join(REPO, 'roles'));
registry.load();
const matchIndex = new MatchIndex(registry.loaded(), listSkills(path.join(REPO, 'skills')));

/** The one connection the fixture's channel needs, its secret in the env. */
const TELEGRAM: Connection = {
  name: 'telegram',
  label: 'Telegram',
  transport: 'builtin',
  defaultOn: true,
  secrets: { TELEGRAM_BOT_TOKEN: 'the bot token' },
};
const ENV = { TELEGRAM_BOT_TOKEN: 't' };

/** A "then" sentence: two steps, the second a send. */
const CHAIN = 'summarise the expenses csv, then telegram Brian the total';
/** A party the grammar reads as three hands (party.test.ts's own example). */
const PARTY = 'Research the pricing, the competitors and the market size — as a team of three';
/** A chain whose withholding sits in the last step (D-183's own shape). */
const CHAIN_WITHHOLDING =
  'summarise the expenses csv, then redact the client names before it goes out';

const quoteOf = (card: Record<string, unknown>): Quote => card.quote as Quote;

describe('intake (D-287)', () => {
  let root: string;
  let rt: IntakeRuntime;
  let ctx: IntakeContext;
  /** What the feed received, in order; the sink also pins add-before-emit. */
  let events: Omit<JobEvent, 'id' | 'at'>[];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-intake-'));
    const meta: LevelMeta = createLevelFiles(root, { name: 'HQ', project: 'HQ', theme: 'default' });
    const dir = levelDir(root, meta.id);
    // Someone on Telegram, so a bare send reads as a send and not as content
    // (clarify.ts, bareSend): the name is a recipient, not a subject.
    writeAudience(root, 'telegram', [{ id: '1', name: 'Sammy', viaStart: true, sends: 0 }]);
    events = [];
    const jobQueue = new JobQueue(dir);
    rt = {
      meta,
      dir,
      sim: { agentlings: [] },
      queue: jobQueue,
      eventLog: new EventLog((event) => {
        // Add, then emit (D-287): by the time the feed hears of a job, the
        // queue already holds it — a listener acting on the event finds it.
        if (event.type === 'queued') expect(jobQueue.get(event.jobId)).toBeDefined();
        events.push(event);
      }),
      roster: readRoster(dir),
    };
    const install: InstallContext = {
      sandboxRoot: root,
      repoRoot: root,
      env: ENV,
      http: async () => {
        throw new Error('nothing here reaches the network');
      },
      connections: () => [TELEGRAM],
      settings: () => readSettings(root),
    };
    const catalog: CatalogContext = {
      sandboxRoot: root,
      registry,
      surfaceFor: () => [],
      searchToken: () => undefined,
      matcher: () => matchIndex,
    };
    ctx = { install, catalog };
  });

  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  describe('the shape, among the caller’s admissions', () => {
    it('a plain sentence is plain, with no steps and no party', () => {
      const reading = read(rt, 'summarise the expenses csv', ctx, {});
      expect(reading.shape).toBe('plain');
      expect(reading.card.steps).toBeUndefined();
      expect(reading.card.party).toBeUndefined();
      // The shape rides the card, byte-for-byte the old body plus this.
      expect(reading.card.shape).toBe('plain');
    });

    it('a "then" sentence is a chain, each step on the card', () => {
      const reading = read(rt, CHAIN, ctx, {});
      expect(reading.shape).toBe('chain');
      expect(Array.isArray(reading.card.steps)).toBe(true);
      expect((reading.card.steps as unknown[]).length).toBe(2);
      expect(reading.card.party).toBeUndefined();
    });

    it('a party-licensing sentence is a party, hands on the card', () => {
      const reading = read(rt, PARTY, ctx, {});
      expect(reading.shape).toBe('party');
      const party = reading.card.party as { hands: unknown[] };
      expect(party.hands.length).toBe(3);
    });

    it('the planner press makes the shape a party plan, priced on the card', () => {
      const reading = read(rt, PARTY, ctx, { planParty: true });
      expect(reading.shape).toBe('party plan');
      // The card carries what Start would queue: the plan job's quote, and
      // not the hands the press declined.
      expect(reading.card.planQuote).toBeDefined();
      expect(reading.card.party).toBeUndefined();
    });

    it('a firing admits no party — the same sentence reads plain', () => {
      const reading = read(rt, PARTY, ctx, { admits: { party: false } });
      expect(reading.shape).toBe('plain');
      expect(reading.card.party).toBeUndefined();
    });

    it('single admits plain only — a "then" sentence runs as one job', () => {
      const reading = read(rt, CHAIN, ctx, { single: true });
      expect(reading.shape).toBe('plain');
      expect(reading.card.steps).toBeUndefined();
    });
  });

  describe('the wired-channel settlement (D-179, #50)', () => {
    it('a wired, connected channel leads the ask', () => {
      const reading = read(rt, 'telegram Sammy the total', ctx, {});
      const ask = reading.card.channelAsk as { channel?: string; state: string };
      expect(ask.channel).toBe('telegram');
      expect(ask.state).toBe('ready');
    });

    it('a never-channel is surfaced on the card and carries nothing', () => {
      const reading = read(rt, 'send the total to Sammy on whatsapp', ctx, {});
      const ask = reading.card.channelAsk as { state: string; channel?: string };
      expect(ask.state).toBe('never');
      // Nothing was settled to carry — no channel rode into the questions.
      expect(ask.channel).toBeUndefined();
    });

    it('a pick counts only if the channel is wired', () => {
      // A plain-object property name that is not a channel: `toString` was the
      // pick a bare `CHANNELS[name]` once let through (#50). It is not honoured,
      // so the sentence reads exactly as it did with no pick at all.
      const withBogus = read(rt, 'summarise the expenses csv', ctx, { channel: 'toString' });
      const plain = read(rt, 'summarise the expenses csv', ctx, {});
      expect(withBogus.shape).toBe('plain');
      expect(withBogus.card.channelAsk).toEqual(plain.card.channelAsk);
    });
  });

  describe('the send facts flip the quote free (D-097)', () => {
    it('a bare send with the recipient and words in hand is composed, not run', () => {
      const bare = read(rt, 'telegram Sammy', ctx, {});
      const withFacts = read(rt, 'telegram Sammy', ctx, {
        answers: { 'send-to:telegram': 'Sammy', 'send-say': 'A darle' },
      });
      // Both in hand, the send is built in code and costs nothing; without
      // them it is a session that has words to write.
      expect(quoteOf(withFacts.card).ceilingUsd).toBe(0);
      expect(quoteOf(bare.card).ceilingUsd).toBeGreaterThan(0);
    });

    it('never for a step of a chain — the answers were given under the whole sentence’s promise', () => {
      // D-097 inverted: a step whose own words read as a bare send must not
      // compose the card's answers verbatim, so the shortcut is refused on
      // any reading that is a step (queueSentence's `inChain`).
      const reading = read(rt, 'telegram Sammy', ctx, {
        answers: { 'send-to:telegram': 'Sammy', 'send-say': 'A darle' },
        steps: [],
        step: { n: 2, of: 2 },
      });
      expect(quoteOf(reading.card).ceilingUsd).toBeGreaterThan(0);
      const job = queue(rt, reading, {});
      expect(job.send).toBeUndefined();
      expect(job.step).toEqual({ n: 2, of: 2 });
    });
  });

  describe('refusal rows are read and never counted (D-259)', () => {
    it('a money claim shows its row, and read writes nothing', () => {
      expect(existsSync(refusalsFile(root))).toBe(false);
      const reading = read(rt, 'pay the deposit to the supplier', ctx, {});
      const refuses = reading.card.refuses as { row: string }[] | undefined;
      expect(refuses?.some((r) => r.row === 'money')).toBe(true);
      // The preview re-runs on every keystroke, so it must never count.
      expect(existsSync(refusalsFile(root))).toBe(false);
    });

    it('queue counts nothing either; Start counts the reading’s keys, once', () => {
      const reading = read(rt, 'pay the deposit to the supplier', ctx, {});
      queue(rt, reading, {});
      // The job exists and the meter has not moved: counting is Start's act.
      expect(rt.queue.list().length).toBe(1);
      expect(existsSync(refusalsFile(root))).toBe(false);
      // Start feeds the meter from the reading — one read serves the card
      // and the count — and one Start is one count.
      expect(reading.refusalKeys).toEqual(['money']);
      recordRefusalKeys(root, rt.meta.id, reading.refusalKeys, 1_700_000_000_000);
      expect(readRefusals(root)).toEqual([
        { at: 1_700_000_000_000, levelId: rt.meta.id, key: 'money' },
      ]);
    });
  });

  describe('queue performs the reading', () => {
    it('a plain job: the card’s quote is the queued quote, add then emit', () => {
      const reading = read(rt, 'summarise the expenses csv', ctx, { tools: [] });
      const job = queue(rt, reading, { note: 'from a test' });
      // The promise the move is for: what the desk showed is what was queued.
      expect(job.quotedUsd).toBe(quoteOf(reading.card).ceilingUsd);
      expect(job.prompt).toBe('summarise the expenses csv');
      expect(job.preferredRole).toBe((reading.card as { role: string }).role);
      expect(rt.queue.get(job.id)).toBeDefined();
      // Exactly one queued event, carrying the way in's note.
      expect(events.map((e) => e.type)).toEqual(['queued']);
      expect(events[0]).toMatchObject({ jobId: job.id, title: job.title });
      expect(events[0].detail).toContain('from a test');
      // A plain reading is one job: no chain, no party.
      expect(job.steps).toBeUndefined();
      expect(job.party).toBeUndefined();
    });

    it('a chain queues step one with the rest, the withholding read off the whole sentence (D-183)', () => {
      const reading = read(rt, CHAIN_WITHHOLDING, ctx, {});
      expect(reading.shape).toBe('chain');
      const steps = reading.card.steps as { sentence: string; quote: Quote }[];
      const job = queue(rt, reading, {});
      expect(job.prompt).toBe(steps[0].sentence);
      expect(job.steps).toEqual([steps[1].sentence]);
      expect(job.step).toEqual({ n: 1, of: 2 });
      // Step one's own words say nothing about a withholding; the chain
      // carries the flag read off the whole sentence.
      expect(job.withholding).toBe(true);
      // The card's step-one quote is step one's queued quote.
      expect(job.quotedUsd).toBe(steps[0].quote.ceilingUsd);
      // One job now; the next step does not exist until this one delivers.
      expect(rt.queue.list().length).toBe(1);
    });

    it('a party queues its hands with no channels, the gather carrying what Start settled', () => {
      // A party with a send written at its end is a chain first (the split's
      // send-"and", D-182), so the channel a party settles arrives as a
      // confirmed pick (D-093) — the near-miss the desk asked about.
      const reading = read(rt, PARTY, ctx, { channel: 'telegram' });
      expect(reading.shape).toBe('party');
      const hands = (reading.card.party as { hands: { sentence: string; quote: Quote }[] }).hands;
      const first = queue(rt, reading, { attachments: [{ name: 'brief.md', data: Buffer.from('x') }] });
      const queued = rt.queue.list().sort((a, b) => a.party!.hand - b.party!.hand);
      expect(queued.length).toBe(3);
      expect(first.id).toBe(queued[0].id);
      for (const [i, hand] of queued.entries()) {
        // A hand never sends: `channelsOverride` is empty, whatever was picked.
        expect(hand.channels).toBeUndefined();
        expect(hand.party).toMatchObject({ hand: i + 1, of: 3, asked: PARTY });
        // …but the party spec every hand carries holds what Start settled
        // for the whole request, for the gather to send on.
        expect(hand.party!.channels).toEqual(['telegram']);
        expect(hand.prompt).toBe(hands[i].sentence);
        expect(hand.quotedUsd).toBe(hands[i].quote.ceilingUsd);
        // The material rides every hand; the sandbox-only shape rides no repo.
        expect(hand.attachments?.map((a) => a.name)).toEqual(['brief.md']);
        expect(hand.repoPath).toBeUndefined();
      }
      // One party, three hands, and every hand was announced after it existed.
      expect(new Set(queued.map((j) => j.party!.id)).size).toBe(1);
      expect(events.filter((e) => e.type === 'queued').length).toBe(3);
    });

    it('a party plan queues the plan job, spec and brief from the reading', () => {
      const reading = read(rt, PARTY, ctx, { planParty: true, channel: 'telegram' });
      const job = queue(rt, reading, {});
      expect(job.prompt).toBe(PLAN_SENTENCE);
      expect(job.preferredRole).toBe('architect');
      expect(job.quotedUsd).toBe((reading.card.planQuote as Quote).ceilingUsd);
      expect(job.party).toMatchObject({ hand: 0, of: 0, plan: true, asked: PARTY, channels: ['telegram'] });
      expect(job.channels).toBeUndefined();
      expect(job.brief).toContain(PARTY);
      expect(rt.queue.list().length).toBe(1);
    });

    it('a firing cannot become a party — the reading it admits is one job', () => {
      const reading = read(rt, PARTY, ctx, { admits: { party: false } });
      const job = queue(rt, reading, { note: 'queued by its schedule' });
      expect(rt.queue.list().length).toBe(1);
      expect(job.party).toBeUndefined();
      expect(job.prompt).toBe(PARTY);
    });

    it('a pre-decided way in reads plain and its fields ride the job', () => {
      // The check pass, the gather and pack authoring know their shape and
      // role; `read` honours both and `queue` stamps what they decided.
      const reading = read(rt, 'check the delivered work against its brief', ctx, {
        admits: PLAIN_ONLY,
        role: 'worker',
        tools: [],
      });
      expect(reading.shape).toBe('plain');
      const job = queue(rt, reading, {
        check: { of: 'abcd1234', avoid: 'a1' },
        brief: 'the brief',
        withholding: true,
        checked: true,
      });
      expect(job.preferredRole).toBe('worker');
      expect(job.check).toEqual({ of: 'abcd1234', avoid: 'a1' });
      expect(job.brief).toBe('the brief');
      expect(job.withholding).toBe(true);
      expect(job.checked).toBe(true);
    });

    it('a chain’s next step: the rest and the link ride, and it is never re-split', () => {
      const reading = read(rt, 'summarise the csv, then telegram Sammy the total', ctx, {
        tools: [],
        steps: ['telegram Sammy the total'],
        step: { n: 2, of: 3 },
      });
      // The caller decided the chain; a "then" in the step's own words is inert.
      expect(reading.shape).toBe('plain');
      expect(reading.card.steps).toBeUndefined();
      const job = queue(rt, reading, { stepPrev: 'abcd1234' });
      expect(job.prompt).toBe('summarise the csv, then telegram Sammy the total');
      expect(job.steps).toEqual(['telegram Sammy the total']);
      expect(job.step).toEqual({ n: 2, of: 3 });
      expect(job.stepPrev).toBe('abcd1234');
    });
  });

  describe('the two firings (D-103, D-248)', () => {
    // A schedule coming due and a mail arriving are the two ways in that run
    // with nobody watching. Both read with `admits: { party: false }` — plain
    // and chain only — and queue what the row stored. The party side of the
    // admission is pinned above ('a firing admits no party', 'a firing cannot
    // become a party'); the chain side and the row's ride are pinned here.

    it('a "then" sentence from a firing is a chain — the split still happens at fire time (D-105)', () => {
      const reading = read(rt, CHAIN, ctx, { admits: { party: false } });
      expect(reading.shape).toBe('chain');
      const job = queue(rt, reading, { note: 'queued by its schedule — daily at 08:00' });
      // Step one is queued with the rest riding it, exactly as from the desk.
      expect(job.step).toEqual({ n: 1, of: 2 });
      expect(job.steps).toEqual(['telegram Brian the total']);
      expect(rt.queue.list().length).toBe(1);
      expect(events[0].detail).toContain('queued by its schedule');
    });

    it('chain wins over party: a sentence that is both is a chain at the desk and from a firing', () => {
      // A party with a send written at its end splits at the "then" (D-182),
      // and the split wins first (D-287 Q3) — so the desk never offers hands
      // for it, and a firing, which admits no party anyway, reads the same.
      const both = `${PARTY}, then telegram Sammy the summary`;
      const desk = read(rt, both, ctx, {});
      expect(desk.shape).toBe('chain');
      expect(desk.party).toBeUndefined();
      expect(desk.card.party).toBeUndefined();
      const firing = read(rt, both, ctx, { admits: { party: false } });
      expect(firing.shape).toBe('chain');
      expect((firing.card.steps as unknown[]).length).toBe(2);
    });

    it('the row rides the firing: doors passed bare (D-254), the channel and answers, the mail and its stamp', () => {
      // A door beside the channel, so the grant has something to hold.
      const WEB: Connection = { name: 'web', label: 'Web', transport: 'builtin', defaultOn: true };
      const doors: IntakeContext = {
        ...ctx,
        install: { ...ctx.install, connections: () => [TELEGRAM, WEB] },
      };
      const row = {
        channel: 'telegram',
        answers: { 'send-to:telegram': 'Sammy', 'send-say': 'A darle' },
        admits: { party: false },
      };
      // A legacy row — no list — holds the old grant, every enabled door; a
      // row naming one holds exactly that; a row naming none holds none. The
      // sweeps pass the field bare because `?? []` would collapse the first
      // into the last without a word.
      const legacy = queue(rt, read(rt, 'telegram Sammy', doors, row), {});
      expect(legacy.tools).toContain('web');
      const named = queue(rt, read(rt, 'telegram Sammy', doors, { ...row, tools: ['web'] }), {});
      expect(named.tools).toEqual(['web']);
      const mail = { id: 'm1', threadId: 't1', msgId: '<m1@example>', from: 'a@b.c', subject: 'receipt' };
      const none = queue(rt, read(rt, 'telegram Sammy', doors, { ...row, tools: [] }), {
        attachments: [{ name: 'mail.txt', data: Buffer.from('the mail\n') }],
        mailTrigger: mail,
        note: 'queued by mail arriving — a@b.c: receipt',
      });
      expect(none.tools).toBeUndefined();
      // The stored channel and answers replay: the send is composed, free.
      expect(none.channels).toEqual(['telegram']);
      expect(none.send).toEqual({ to: 'Sammy', words: 'A darle' });
      expect(none.quotedUsd).toBeUndefined();
      // The mail rides as material and as the stamp the reply path threads to.
      expect(none.attachments?.map((a) => a.name)).toEqual(['mail.txt']);
      expect(none.mailTrigger).toEqual(mail);
      expect(events[2].detail).toContain('queued by mail arriving');
    });
  });

  describe('the rules that moved inside, pinned by the mutation round (D-278 harness)', () => {
    // Six mutants of intake.ts survived the first round with 24 tests: each
    // is a rule the #52 move settled in one place and nothing asserted.

    it('PLAIN_ONLY on a "then" sentence reads plain — a pre-decided way in is one job whatever its words', () => {
      const reading = read(rt, CHAIN, ctx, { admits: PLAIN_ONLY });
      expect(reading.shape).toBe('plain');
      expect(reading.card.steps).toBeUndefined();
      const job = queue(rt, reading, {});
      expect(job.prompt).toBe(CHAIN);
      expect(job.steps).toBeUndefined();
      expect(job.step).toBeUndefined();
    });

    it('a plain job carries no withholding flag — its own words are the whole sentence (D-183)', () => {
      const reading = read(rt, 'summarise the expenses csv and redact the client names before it goes out', ctx, {});
      expect(reading.shape).toBe('plain');
      expect(reading.withholding).toBe(false);
      expect(queue(rt, reading, {}).withholding).toBeUndefined();
    });

    it('the channel override decides what a job carries, over what its words settle (TEAMWORK T2)', () => {
      // The gather's fixed sentence names no channel and carries the party's.
      const gather = queue(rt, read(rt, GATHER_SENTENCE, ctx, { admits: PLAIN_ONLY, channelsOverride: ['telegram'] }), {});
      expect(gather.channels).toEqual(['telegram']);
      // A hand whose own piece names a channel still carries none.
      const hand = queue(rt, read(rt, 'telegram Sammy the total', ctx, { channelsOverride: [] }), {});
      expect(hand.channels).toBeUndefined();
    });

    it('the card’s answers ride a chain while it has steps left, and not a plain job', () => {
      const answers = { 'send-to:telegram': 'Sammy' };
      const first = queue(rt, read(rt, CHAIN, ctx, { answers }), {});
      expect(first.answers).toEqual(answers);
      const plain = queue(rt, read(rt, 'summarise the expenses csv', ctx, { answers }), {});
      expect(plain.answers).toBeUndefined();
    });

    it('an organize sentence is forced to worker on every reading (D-132), card and job alike', () => {
      // The matcher reads this as the scribe's; the folder work is the worker's.
      const reading = read(rt, 'organize my downloads folder', ctx, {});
      expect(reading.card.organize).toBe(true);
      expect(reading.card.role).toBe('worker');
      expect(queue(rt, reading, {}).preferredRole).toBe('worker');
    });

    it('the clarifications are recomputed from the sentence and the answers, and ride the job', () => {
      // A recipient in hand but no words: a session runs, briefed on the To.
      const reading = read(rt, 'telegram Sammy the total', ctx, {
        answers: { 'send-to:telegram': 'Sammy' },
      });
      const job = queue(rt, reading, {});
      expect(job.send).toBeUndefined();
      expect(job.clarifications).toEqual(['Who should this go to? Sammy']);
    });
  });

  describe('a reviewed plan’s hands (TEAMWORK T3, D-287 Q7)', () => {
    it('queueParty carries the plan job’s spec forward onto every hand', () => {
      const hands = queueParty(
        rt,
        PARTY,
        ctx,
        {
          hands: ['Research the pricing', 'Research the competitors'],
          asked: { n: 2, words: 'a planned party' },
        },
        {
          tools: [],
          channels: ['telegram'],
          loadBearing: [1],
          partyId: 'p1234567',
          scopes: [undefined, ['docs/']],
        },
      );
      expect(hands.length).toBe(2);
      const [one, two] = hands as [Job, Job];
      expect(one.party).toMatchObject({ id: 'p1234567', hand: 1, of: 2, loadBearing: [1], channels: ['telegram'] });
      expect(two.party).toMatchObject({ id: 'p1234567', hand: 2, of: 2, scope: ['docs/'] });
      // A scoped hand is briefed on its scope; an unscoped one is not.
      expect(one.brief).toBeUndefined();
      expect(two.brief).toContain('docs/');
      // Hands never send, whatever the spec carries for the gather.
      expect(one.channels).toBeUndefined();
      expect(two.channels).toBeUndefined();
      expect(rt.queue.list().length).toBe(2);
      expect(events.filter((e) => e.type === 'queued').length).toBe(2);
    });
  });
});
