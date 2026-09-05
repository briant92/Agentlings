import { existsSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Connection } from './connections';
import { createLevelFiles, levelDir, type LevelMeta } from './levels';
import { MatchIndex } from './match';
import { refusalsFile } from './refusals';
import { RoleRegistry, listSkills } from './roles';
import { readSettings } from './settings';
import { writeAudience } from './audience';
import type { InstallContext } from './verdict';
import { type CatalogContext, type IntakeContext, type IntakeRuntime, read } from './intake';

/**
 * `read` through its interface alone (D-287): a temp level on disk, the real
 * role catalog, a fake connection for the one channel, and assertions on the
 * shape it decides and the card it returns. `read` is pure — nothing here
 * reaches past it, and the refusals file is asserted absent before and after.
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

describe('read (D-287)', () => {
  let root: string;
  let rt: IntakeRuntime;
  let ctx: IntakeContext;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-intake-'));
    const meta: LevelMeta = createLevelFiles(root, { name: 'HQ', project: 'HQ', theme: 'default' });
    const dir = levelDir(root, meta.id);
    // Someone on Telegram, so a bare send reads as a send and not as content
    // (clarify.ts, bareSend): the name is a recipient, not a subject.
    writeAudience(root, 'telegram', [{ id: '1', name: 'Sammy', viaStart: true, sends: 0 }]);
    rt = { meta, dir, sim: { agentlings: [] } };
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

    it('the planner press makes the shape a party plan', () => {
      const reading = read(rt, PARTY, ctx, { planParty: true });
      expect(reading.shape).toBe('party plan');
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
      const bareQuote = bare.card.quote as { ceilingUsd: number };
      const factsQuote = withFacts.card.quote as { ceilingUsd: number };
      // Both in hand, the send is built in code and costs nothing; without
      // them it is a session that has words to write.
      expect(factsQuote.ceilingUsd).toBe(0);
      expect(bareQuote.ceilingUsd).toBeGreaterThan(0);
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
  });
});
