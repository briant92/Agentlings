import { describe, expect, it } from 'vitest';
import { refusalDesk, whoSuffix } from './planLine';

describe('the plan line says its fallbacks out loud', () => {
  it('says nothing when a trade matched and someone holds it', () => {
    expect(whoSuffix({ role: 'clerk', noOneHasRole: false, agentling: { role: 'clerk' } })).toBe('');
  });

  it('keeps the nobody-holds-it sentence', () => {
    expect(
      whoSuffix({ role: 'researcher', noOneHasRole: true, agentling: { role: 'worker' } }),
    ).toBe(' — nobody here is a researcher, so it goes to your worker');
  });

  /**
   * The no-match fallback was the silent one (D-192): a typo'd research
   * sentence fell to the generalist and its shorter wall with no word said.
   * The nudge names who takes it and how to route a specialist instead.
   */
  it('says when no trade recognised the words, and how to route one', () => {
    const line = whoSuffix({ role: null, agentling: { role: 'worker' } });
    expect(line).toContain('no trade recognised these words');
    expect(line).toContain('your worker takes it');
    expect(line).toContain('research, analysis, a write-up');
  });

  it('stays quiet with no crew at all — the hire line owns that case', () => {
    expect(whoSuffix({ role: null, agentling: null })).toBe('');
  });
});

/**
 * The refusal lines (#22): what the bar shows under the plan for a sentence
 * the crew will refuse.
 *
 * `refusalDesk` is only half of that — the rows to draw from and one tail
 * string. The `.map` that draws them and the single `<p>` that draws the tail
 * are still in `WorkBar.tsx` and unreachable from here (D-177, D-178), so
 * "one tail, however many rows" is counted in the real DOM by
 * `scripts/prove-refusal-ui.mjs` and not below.
 */
describe('the desk says what it refuses', () => {
  /**
   * Placeholders, deliberately: every word on the row is the server's, and
   * this function never reads one. Copying the board's real sentences in here
   * would add somewhere for them to drift without testing anything —
   * `refusals.test.ts` imports `BOUNDARIES` and holds them to the real thing.
   */
  const MONEY = { row: 'money', keys: ['money'], lead: '<lead>', why: '<why>', does: '<does>' };
  const ACT = { row: 'act', keys: ['act'], lead: '<lead 2>', why: '<why 2>', does: '<does 2>' };

  it('shows nothing at all for ordinary work', () => {
    expect(refusalDesk(undefined)).toEqual({ lines: [], tail: null });
    expect(refusalDesk([])).toEqual({ lines: [], tail: null });
  });

  it('passes each row through untouched — every word on the line is the server’s', () => {
    expect(refusalDesk([MONEY]).lines).toEqual([MONEY]);
  });

  /** D-259 settled the behaviour; this is the UI saying it in its own words. */
  it('says Start still works — once, however many rows', () => {
    const one = refusalDesk([MONEY]);
    const two = refusalDesk([MONEY, ACT]);
    expect(two.lines).toHaveLength(2);
    expect(one.tail).toBe(two.tail);
    expect(two.tail).toContain('Start still works');
  });

  it('never says a word that would read as a block', () => {
    const { tail } = refusalDesk([MONEY]);
    for (const word of ['cannot', "can't", 'blocked', 'disabled', 'remove']) {
      expect(tail?.toLowerCase()).not.toContain(word);
    }
  });
});
