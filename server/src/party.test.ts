import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GATHER_SENTENCE,
  MAX_HANDS,
  PARTY_FILE,
  PLAN_SENTENCE,
  gatherBrief,
  handFileName,
  handReportName,
  partyAsk,
  planBrief,
  planParty,
  readPartyDraft,
} from './party';

describe('partyAsk — licensed by a number beside worker-words, nothing less', () => {
  it.each([
    ['research A, B and C as a team of three', 3],
    ['do this with a party of two', 2],
    ['split it between two workers', 2],
    ['three researchers on the boutique hotel market: pricing, brands, chains', 3],
    ['a group of 3 should handle these', 3],
  ])('claims: %s → %d hands', (text, n) => {
    expect(partyAsk(text)?.n).toBe(n);
  });

  it.each([
    // Bare "team" lives in send sentences already — channel.ts's own example.
    'post the release notes to the team on Slack',
    'tell the team the deploy is done',
    'summarise the team meeting notes',
    // A number without worker-words is content, not a licence.
    'compare the three options in the doc',
    'list two examples of each',
    // The gather's own sentence must never claim, or gathers recurse.
    GATHER_SENTENCE,
  ])('stays quiet: %s', (text) => {
    expect(partyAsk(text)).toBeNull();
  });
});

describe('planParty — the sentence own enumeration, or the reason it parks', () => {
  it('splits a shared-verb list and distributes the one lead word', () => {
    const plan = planParty(
      'Research the pricing, the competitors and the market size — as a team of three',
    );
    expect(plan && 'hands' in plan ? plan.hands : plan).toEqual([
      'Research the pricing',
      'Research the competitors',
      'Research the market size',
    ]);
  });

  it('keeps pieces that already carry their own verb', () => {
    const plan = planParty(
      'research the pricing; summarise the reviews — as a team of two',
    );
    expect(plan && 'hands' in plan ? plan.hands : plan).toEqual([
      'research the pricing',
      'summarise the reviews',
    ]);
  });

  it('cuts a trailing send for the gather', () => {
    const plan = planParty(
      'Research the pricing, the competitors and the market size as a team of three, and telegram me the result',
    );
    expect(plan && 'hands' in plan).toBe(true);
    if (plan && 'hands' in plan) {
      expect(plan.hands).toHaveLength(3);
      expect(plan.hands.every((h) => h.startsWith('Research'))).toBe(true);
      expect(plan.sendTail).toBe('telegram me the result');
    }
  });

  it('does not distribute off an article lead — hands ride verbatim, visible at the desk', () => {
    const plan = planParty('the pricing, the competitors and the market size as a team of three');
    expect(plan && 'hands' in plan ? plan.hands : plan).toEqual([
      'the pricing',
      'the competitors',
      'the market size',
    ]);
  });

  it('returns null when no party was asked', () => {
    expect(planParty('Research the pricing, the competitors and the market size')).toBeNull();
  });

  it.each([
    [
      // Three pieces and an ask of four: only the ask-cap can park this —
      // a survived mutation taught that a four-piece list trips the list
      // cap too, and the two messages shared words (D-158's lesson: a
      // survived mutation is a finding about what the test binds).
      `over the cap parks by name`,
      'research A, B and C as a team of four',
      `at most ${MAX_HANDS} hands today`,
    ],
    ['no list parks with the example', 'fix the login bug as a team of three', 'pieces named'],
    [
      'a send inside a piece parks with the fix',
      'telegram me the UF, the dollar and the euro as a team of three',
      'never sends',
    ],
  ])('%s', (_, text, reason) => {
    const plan = planParty(text);
    expect(plan && 'blocked' in plan ? plan.blocked : plan).toContain(reason);
  });

  it('a list longer than the cap parks even when the ask was in bounds', () => {
    const plan = planParty('research A, B, C and D with a team of three');
    expect(plan && 'blocked' in plan ? plan.blocked : String(plan)).toContain('4 pieces');
  });
});

describe('gatherBrief', () => {
  const base = {
    asked: 'Research the pricing, the competitors and the market size as a team of three',
    hands: [
      {
        hand: 1,
        piece: 'Research the pricing',
        hadReport: true,
        files: [handFileName(1, 'pricing.md')],
        leftBehind: [],
      },
      {
        hand: 2,
        piece: 'Research the competitors',
        hadReport: true,
        files: [],
        leftBehind: ['huge.pdf'],
      },
      {
        hand: 3,
        piece: 'Research the market size',
        hadReport: false,
        files: [],
        leftBehind: [],
        failed: true,
      },
    ],
  };

  it('quotes the request, points at each hand report by name, and names the uncovered piece', () => {
    const brief = gatherBrief(base);
    expect(brief).toContain(`"${base.asked}"`);
    expect(brief).toContain(`input/${handReportName(1)}`);
    expect(brief).toContain('input/hand-1-pricing.md');
    expect(brief).toContain('huge.pdf');
    expect(brief).toContain('Hand 3 failed and its piece is uncovered');
    expect(brief).toContain('material from other runs');
    expect(brief).toContain('which hand each part came from');
  });

  it('carries the send tail and the recipient lines when the request sends', () => {
    const brief = gatherBrief({
      ...base,
      sendTail: 'telegram me the result',
      sendLines: ['Send the result on telegram to 8633678680 — write OUTBOX.json as briefed.'],
    });
    expect(brief).toContain('telegram me the result');
    expect(brief).toContain('8633678680');
  });
});

describe('readPartyDraft — the planner contract, refused loud (T3)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'party-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const write = (value: unknown) =>
    writeFileSync(path.join(dir, PARTY_FILE), typeof value === 'string' ? value : JSON.stringify(value));

  it('reads a sound plan whole, with loadBearing and why', () => {
    write({
      hands: [
        { prompt: 'Survey the module layout of the repo', loadBearing: true, why: 'everything hangs off it' },
        { prompt: 'List the untested exported functions' },
      ],
      notes: 'two hands suffice',
    });
    const read = readPartyDraft(dir);
    expect(read && 'draft' in read ? read.draft.hands : read).toEqual([
      {
        prompt: 'Survey the module layout of the repo',
        loadBearing: true,
        why: 'everything hangs off it',
      },
      { prompt: 'List the untested exported functions' },
    ]);
  });

  it('no file is null — the stamp says nothing', () => {
    expect(readPartyDraft(dir)).toBeNull();
  });

  it.each([
    ['torn JSON', '{"hands": [', 'not valid JSON'],
    ['no hands list', { notes: 'x' }, 'names no hands'],
    ['one hand', { hands: [{ prompt: 'do the whole thing' }] }, '2 to'],
    [
      'too many hands',
      { hands: [1, 2, 3, 4].map((n) => ({ prompt: `piece number ${n}` })) },
      '2 to',
    ],
    ['a fragment prompt', { hands: [{ prompt: 'x' }, { prompt: 'survey the repo' }] }, 'no usable prompt'],
    [
      'a hand that sends',
      { hands: [{ prompt: 'survey the repo layout' }, { prompt: 'telegram Brian the findings' }] },
      'sends ride the gather',
    ],
  ])('%s is refused by name', (_, value, reason) => {
    write(value as never);
    const read = readPartyDraft(dir);
    expect(read && 'error' in read ? read.error : read).toContain(reason);
  });
});

describe('planBrief', () => {
  it('quotes the task and carries the contract', () => {
    const brief = planBrief({ asked: 'reorganise the test suite as a team of three', sends: false });
    expect(brief).toContain('"reorganise the test suite as a team of three"');
    expect(brief).toContain(PARTY_FILE);
    expect(brief).toContain('loadBearing');
    expect(brief).toContain('IN PARALLEL');
    expect(brief).toContain('No prompt may ask to send');
    expect(brief).toContain('approving it is what queues the hands');
  });

  it('tells the planner the request sends, when it does', () => {
    expect(planBrief({ asked: 'x y z', sends: true })).toContain('The request itself sends');
    expect(planBrief({ asked: 'x y z', sends: false })).not.toContain('The request itself sends');
  });

  it('the fixed plan sentence never claims a party itself', () => {
    expect(partyAsk(PLAN_SENTENCE)).toBeNull();
  });
});
