import { describe, expect, it } from 'vitest';
import type { ReconciliationSummary } from '@agentlings/shared';
import { adjustmentLine, amountText, balanceWording, countsLine } from './reconcile';

function summary(over: Partial<ReconciliationSummary> = {}): ReconciliationSummary {
  return {
    period: '2026-05',
    currency: 'CLP',
    statement: { label: 'cartola-mayo-2026.csv', closing: 4118500, adjusted: 4240650 },
    records: { label: 'libro-mayor-banco-mayo-2026.csv', closing: 4250000, adjusted: 4240650 },
    adjustments: [],
    difference: 0,
    balances: true,
    counts: { matched: 8, unmatchedStatement: 3, unmatchedRecords: 2, adjustments: 5, entries: 2 },
    ...over,
  };
}

describe('the reconciliation card words (D-222)', () => {
  it('formats whole money whole and decimal money to cents', () => {
    expect(amountText(4240650)).toBe('4,240,650');
    expect(amountText(26745.5)).toBe('26,745.50');
  });

  it('spells an adjustment with its sign and kind', () => {
    expect(
      adjustmentLine({ side: 'statement', kind: 'in-transit', amount: 242150, what: 'depósito 31/05' }),
    ).toBe('+ 242,150 in-transit — depósito 31/05');
    expect(adjustmentLine({ side: 'records', kind: 'fee', amount: -15000, what: 'comisión' })).toBe(
      '− 15,000 fee — comisión',
    );
  });

  it('says the verdict the reviewer can act on', () => {
    expect(balanceWording(summary())).toBe('Balances — both sides meet at 4,240,650 CLP');
    expect(
      balanceWording(
        summary({
          currency: 'USD',
          statement: { label: 'bank', closing: 27395, adjusted: 26745 },
          records: { label: 'ledger', closing: 24457, adjusted: 27105 },
          difference: -360,
          balances: false,
        }),
      ),
    ).toBe(
      'Does not balance — off by 360 USD (statement 26,745 · records 27,105); approving is refused until the sides meet',
    );
  });

  it('counts the residue, and only mentions entries when there are some', () => {
    expect(countsLine(summary())).toBe('8 matched · 3 statement-only · 2 records-only · 2 entries proposed');
    expect(countsLine(summary({ counts: { matched: 1, unmatchedStatement: 0, unmatchedRecords: 0, adjustments: 0, entries: 0 } }))).toBe(
      '1 matched · 0 statement-only · 0 records-only',
    );
  });
});
