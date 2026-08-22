import { describe, expect, it } from 'vitest';
import { approvalLine, approvalsSummary, litDots } from './standing';

describe('litDots', () => {
  it('lights one dot per unchanged approval, all three once it sends itself', () => {
    expect(litDots({ approvals: 1, auto: false })).toBe(1);
    expect(litDots({ approvals: 5, auto: false })).toBe(3);
    expect(litDots({ approvals: 0, auto: true })).toBe(3);
  });
});

describe('approvalLine', () => {
  it('says what the next approvals do', () => {
    expect(approvalLine({ approvals: 1, auto: false, eligible: false })).toBe(
      '1 of 3 unchanged · 2 to go',
    );
    expect(approvalLine({ approvals: 3, auto: false, eligible: true })).toBe(
      '3 of 3 unchanged · the offer waits at the next review',
    );
    expect(approvalLine({ approvals: 6, auto: true, eligible: false })).toBe('sends itself');
  });
});

describe('approvalsSummary', () => {
  it('reads the whole section in one line', () => {
    expect(
      approvalsSummary([
        { approvals: 1, auto: false },
        { approvals: 1, auto: false },
      ]),
    ).toBe('1 of 3 each · none sends itself yet');
    expect(
      approvalsSummary([
        { approvals: 2, auto: false },
        { approvals: 6, auto: true },
      ]),
    ).toBe('2 of 3 each · 1 sends itself');
    expect(
      approvalsSummary([
        { approvals: 1, auto: false },
        { approvals: 3, auto: false },
      ]),
    ).toBe('1–3 of 3 · none sends itself yet');
    expect(approvalsSummary([{ approvals: 6, auto: true }])).toBe('1 sends itself');
  });
});
