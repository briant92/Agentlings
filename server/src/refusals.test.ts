import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NEVER_CHANNELS } from './channel';
import { BOUNDARIES } from './coverage';
import { CLAIMS, NOT_BUILT, readRefusals, recordRefusals, refusalKeys, refusalsFile } from './refusals';

/**
 * The bar (D-259): asks with the rows they claim, and the bookkeeping,
 * media-reading and coding sentences that claim nothing. Every sentence was
 * a mistake someone found by typing it; the next one goes here first.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/refusals/desk-sentences.json'), 'utf8')) as {
  text: string;
  keys: string[];
}[];

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'refusals-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const PAY = "Pay the supplier's March invoice from the business account";
const SIGN = 'Sign the lease renewal on my behalf';
const VIDEO = 'Make a two-minute video walkthrough of the new onboarding flow';
const ORDINARY = "Summarise last quarter's numbers into a one-page PDF";

describe('refusalKeys', () => {
  it('keys every row as the job board does, a not-built capability by its own name, a channel as the shelf names it', () => {
    const hard = new Set(BOUNDARIES.filter((b) => b.hard).map((b) => b.id));
    expect(hard.has('not-built')).toBe(true);
    for (const c of CLAIMS) expect(hard.has(c.key) || NOT_BUILT.includes(c.key), c.key).toBe(true);
    expect(NEVER_CHANNELS).toContain('whatsapp');
    expect(NEVER_CHANNELS).not.toContain('telegram');
  });

  it('the fixture covers every row at least once, and holds more sentences that claim nothing than ones that do', () => {
    const claimed = new Set(FIXTURE.flatMap((s) => s.keys));
    for (const c of CLAIMS) expect(claimed.has(c.key), c.key).toBe(true);
    const positives = FIXTURE.filter((s) => s.keys.length > 0).length;
    expect(FIXTURE.length - positives).toBeGreaterThan(positives);
  });

  for (const s of FIXTURE) {
    it(`${s.keys.length ? `claims ${s.keys.join(', ')}` : 'claims nothing'}: ${s.text}`, () => {
      expect(refusalKeys(s.text)).toEqual(s.keys);
    });
  }
});

describe('recordRefusals', () => {
  it('appends exactly one line per row hit, with time, levelId (the ledger’s name for it) and key — and nothing of the sentence', () => {
    recordRefusals(root, 'hq', PAY, 1_700_000_000_000);
    const raw = readFileSync(refusalsFile(root), 'utf8');
    expect(raw.split('\n').filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(raw.trim())).toEqual({ at: 1_700_000_000_000, levelId: 'hq', key: 'money' });
    for (const word of ['supplier', 'invoice', 'March', 'Pay']) expect(raw).not.toContain(word);
  });

  it('appends nothing for a sentence that hits nothing — not even the file', () => {
    recordRefusals(root, 'hq', ORDINARY, 1);
    expect(existsSync(refusalsFile(root))).toBe(false);
    expect(readRefusals(root)).toEqual([]);
  });

  it('is append-only: a second sentence adds its lines after the first, which stays whole', () => {
    recordRefusals(root, 'hq', SIGN, 1);
    recordRefusals(root, 'home', 'Pay the deposit and sign the contract', 2);
    expect(readRefusals(root)).toEqual([
      { at: 1, levelId: 'hq', key: 'sign' },
      { at: 2, levelId: 'home', key: 'money' },
      { at: 2, levelId: 'home', key: 'sign' },
    ]);
  });

  it('lives beside the ledger', () => {
    expect(refusalsFile(root)).toBe(path.join(root, 'refusals.jsonl'));
  });
});

describe('readRefusals', () => {
  it('skips a torn line and keeps the rest, as the ledger does', () => {
    recordRefusals(root, 'hq', SIGN, 1);
    recordRefusals(root, 'hq', VIDEO, 2);
    appendFileSync(refusalsFile(root), '{"at":3,"levelId":"hq","ke');
    expect(readRefusals(root)).toEqual([
      { at: 1, levelId: 'hq', key: 'sign' },
      { at: 2, levelId: 'hq', key: 'video' },
    ]);
  });
});
