import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NEVER_CHANNELS } from './channel';
import { BOUNDARIES } from './coverage';
import { CLAIMS, NOT_BUILT, readRefusals, recordRefusals, refusalKeys, refusalsFile } from './refusals';

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

  it('names the shelf-of-never row a payment claims', () => {
    expect(refusalKeys(PAY)).toEqual(['money']);
    expect(refusalKeys('Wire $2,500 to the landlord before Friday')).toEqual(['money']);
    expect(refusalKeys('Transfer the funds to the savings account and reimburse Ana')).toEqual(['money']);
    expect(refusalKeys('Run the payroll for August')).toEqual(['money']);
  });

  it('names the row a licensed act claims', () => {
    expect(refusalKeys(SIGN)).toEqual(['sign']);
    expect(refusalKeys('Notarise the power of attorney')).toEqual(['sign']);
    expect(refusalKeys('Certify the translation as accurate')).toEqual(['sign']);
  });

  it('names the row an act on the world claims', () => {
    expect(refusalKeys('Deploy it to production once the tests pass')).toEqual(['act']);
    expect(refusalKeys('Publish the package to npm')).toEqual(['act']);
    expect(refusalKeys('File my tax return for 2025')).toEqual(['act']);
  });

  it('names the row a manager or a conversation claims', () => {
    expect(refusalKeys("Plan the crew's week and assign the work to each of them")).toEqual(['people']);
    expect(refusalKeys('Call the bank and negotiate with them about the fee')).toEqual(['people']);
    expect(refusalKeys('Join the standup at 9 and take notes')).toEqual(['people']);
  });

  it('names a not-built capability by its own key, once, however many of its words the sentence uses', () => {
    expect(refusalKeys(VIDEO)).toEqual(['video']);
    expect(refusalKeys('Produce a short animation and a screencast of the flow')).toEqual(['video']);
    expect(refusalKeys('Record a voice-over for the podcast intro and generate a photoreal cover image')).toEqual([
      'audio',
      'image',
    ]);
    expect(refusalKeys('Design the landing page in Figma')).toEqual(['design-tool']);
  });

  it('never counts a medium that is only read, or a making verb with no medium — reading is built', () => {
    expect(refusalKeys('Summarise the video transcript attached to this mail')).toEqual([]);
    expect(refusalKeys('Animate the transition on the title screen')).toEqual([]);
    expect(refusalKeys('Export the Figma file names from the attached list')).toEqual([]);
  });

  it('names a channel refused by decision, when the sentence claims a send on it', () => {
    expect(refusalKeys('Send the summary to Ana on WhatsApp')).toEqual(['whatsapp']);
    expect(refusalKeys('Message Pepo on LinkedIn with the pitch')).toEqual(['linkedin']);
  });

  it('lists a sentence claiming two rows in the board’s order, the channel last', () => {
    expect(refusalKeys('Pay the deposit, sign the contract and send the receipt on Signal')).toEqual([
      'money',
      'sign',
      'signal',
    ]);
  });

  it('names nothing for ordinary work', () => {
    expect(refusalKeys(ORDINARY)).toEqual([]);
  });

  it('never counts a soft boundary — a send on a wired channel, a watch, a login are partial, not refused', () => {
    expect(refusalKeys('Email me a summary of the attached report')).toEqual([]);
    expect(refusalKeys('Send the brief to Brian on Telegram every Monday')).toEqual([]);
    expect(refusalKeys('Log in to the portal and read the balance')).toEqual([]);
  });

  it('never counts a mention: a channel word with no send verb is a question, not a claim', () => {
    expect(refusalKeys('Summarise the WhatsApp export in the attached file')).toEqual([]);
  });

  it('never counts the words the board’s duty lists fired on in real sentences here (D-259)', () => {
    for (const sentence of [
      'Stamp them at compile time in server/src/index.ts, where writeTool already stamps capabilities',
      'For every figure give the latest reading published as of today, with the reference period beside it',
      'Author a level pack: a lighthouse lamp room at dawn',
      'Extend the tests to cover those gaps, following the naming voice already in those files',
      'Get the pitch ready to send to Pepo on Telegram. Don’t send anything without my approval.',
      'We need to sell that if we open source the platform the repo stays the product',
      'Draw the three office blueprints from the attached offer document as one continuous plan',
      'Pay attention to the walk-through in docs/executors.md and the machinery around installed packs',
      'Install the pack and describe how the patch layer is enforced against the clone',
      'Order the list by date, then buy-vs-build is the second section',
    ]) {
      expect(refusalKeys(sentence), sentence).toEqual([]);
    }
  });
});

describe('recordRefusals', () => {
  it('appends exactly one line per row hit, with time, level and key — and nothing of the sentence', () => {
    recordRefusals(root, 'hq', PAY, 1_700_000_000_000);
    const raw = readFileSync(refusalsFile(root), 'utf8');
    expect(raw.split('\n').filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(raw.trim())).toEqual({ at: 1_700_000_000_000, level: 'hq', key: 'money' });
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
      { at: 1, level: 'hq', key: 'sign' },
      { at: 2, level: 'home', key: 'money' },
      { at: 2, level: 'home', key: 'sign' },
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
    appendFileSync(refusalsFile(root), '{"at":3,"level":"hq","ke');
    expect(readRefusals(root)).toEqual([
      { at: 1, level: 'hq', key: 'sign' },
      { at: 2, level: 'hq', key: 'video' },
    ]);
  });
});
