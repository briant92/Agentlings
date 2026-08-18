import { describe, expect, it } from 'vitest';
import {
  GATHER_SENTENCE,
  MAX_HANDS,
  gatherBrief,
  handFileName,
  handReportName,
  partyAsk,
  planParty,
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
      `over the cap parks by name`,
      'research A, B, C and D as a team of four',
      `at most ${MAX_HANDS}`,
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
