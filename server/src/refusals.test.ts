import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NEVER_CHANNELS } from './channel';
import { BOUNDARIES } from './coverage';
import { CLAIMS, NOT_BUILT, readRefusals, recordRefusals, refusalKeys, refusalRows, refusalsFile } from './refusals';

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

/**
 * The desk's reading (#22): the same keys, turned into what the bar says
 * before Start. The reason is the job board's own, verbatim — the point of
 * the test below is that no second copy of it exists to drift.
 */
describe('refusalRows', () => {
  const why = (id: string) => BOUNDARIES.find((b) => b.id === id)!.why;

  it('says nothing for ordinary work', () => {
    expect(refusalRows(ORDINARY)).toEqual([]);
    expect(refusalRows('Reconcile the two statements and chart the difference')).toEqual([]);
  });

  it('names the row, the keys under it, the desk’s lead-in and the board’s own reason', () => {
    expect(refusalRows(PAY)).toEqual([
      {
        row: 'money',
        keys: ['money'],
        lead: 'this asks for a payment',
        why: why('money'),
        does: 'It will draft the instruction for you to send.',
      },
    ]);
  });

  it('carries the board’s sentence verbatim — cite and all — for every row it can show', () => {
    for (const text of [PAY, SIGN, 'Deploy the fix to production', 'Supervise the team this week', VIDEO]) {
      for (const r of refusalRows(text)) expect(r.why).toBe(why(r.row));
    }
  });

  it('reads one line per row when a sentence claims two', () => {
    const rows = refusalRows('Pay the supplier, then deploy the fix to production');
    expect(rows.map((r) => r.row)).toEqual(['money', 'act']);
    expect(rows.map((r) => r.lead)).toEqual([
      'this asks for a payment',
      'this asks the crew to act on the world',
    ]);
  });

  /**
   * The order is the METER's, not the board's, and the two really do differ:
   * `CLAIMS` runs money, sign, act, people; `BOUNDARIES` runs money, people,
   * act, sign. `sign` + `people` is the pair that can tell them apart — the
   * money/act pair above cannot, which is how the first version of this
   * carried "in the board's order" in its own doc while doing something else.
   */
  it('orders rows as the meter counts them, which is NOT the board’s order', () => {
    const boardOrder = BOUNDARIES.map((b) => b.id).filter((id) => ['sign', 'people'].includes(id));
    expect(boardOrder).toEqual(['people', 'sign']);
    const rows = refusalRows('Sign the lease on my behalf and supervise the crew');
    expect(rows.map((r) => r.row)).toEqual(['sign', 'people']);
    expect(rows.map((r) => r.row)).toEqual(refusalKeys('Sign the lease on my behalf and supervise the crew'));
  });

  it('every claim key has a reading, so the skip in the loop can only ever be a never-channel', () => {
    for (const c of CLAIMS) expect(refusalRows(`__${c.key}__`), c.key).toBeDefined();
    const withReading = new Set(refusalRows('Pay it, sign it, deploy it, supervise them, make a video, record audio, generate an image, lay it out in Figma').flatMap((r) => r.keys));
    for (const c of CLAIMS) expect(withReading.has(c.key), c.key).toBe(true);
  });

  it('names what the crew will do instead — the ticket’s second half, the desk’s own words', () => {
    expect(refusalRows(PAY)[0]?.does).toBe('It will draft the instruction for you to send.');
    expect(refusalRows(SIGN)[0]?.does).toBe('It will draft it for you to sign.');
    for (const text of [PAY, SIGN, 'Deploy the fix to production', 'Supervise the team this week']) {
      const does = refusalRows(text)[0]?.does ?? '';
      expect(does, text).not.toBe('');
      // The desk's alone: the board is written about a duty and names no other side.
      expect(BOUNDARIES.map((b) => b.why).join(' '), text).not.toContain(does);
    }
  });

  it('offers no other side for the not-built row, because there is none', () => {
    expect(refusalRows(VIDEO)[0]?.row).toBe('not-built');
    expect(refusalRows(VIDEO)[0]?.does).toBeUndefined();
  });

  it('collapses the not-built capabilities onto their one board row, naming each medium once', () => {
    const rows = refusalRows('Make a video of the launch and generate an image for the thumbnail');
    expect(rows).toEqual([
      {
        row: 'not-built',
        keys: ['video', 'image'],
        lead: 'this asks for a video and an image',
        why: why('not-built'),
      },
    ]);
  });

  it('names three mediums with commas and a final “and”', () => {
    expect(refusalRows('Make a video, record a voiceover and generate an image')[0]?.lead).toBe(
      'this asks for a video, audio and an image',
    );
  });

  it('leaves a never-channel to the ask card, which already states it and offers the channels that can', () => {
    expect(refusalKeys('Send the invoice to Ana on WhatsApp')).toEqual(['whatsapp']);
    expect(refusalRows('Send the invoice to Ana on WhatsApp')).toEqual([]);
  });

  it('reads exactly the rows the meter would count, for every sentence in the fixture', () => {
    for (const s of FIXTURE) {
      const shown = new Set(refusalRows(s.text).flatMap((r) => r.keys));
      const counted = s.keys.filter((k) => !NEVER_CHANNELS.includes(k));
      expect([...shown], s.text).toEqual(counted);
    }
  });
});
