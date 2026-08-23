import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkReconciliation,
  readReconciliation,
  reconciliationBrief,
  reconciliationRefusal,
  RECONCILIATION_FILE,
  summariseReconciliation,
  wantsReconciliation,
} from './reconciliation';

/** Edig's worked example, 31 May 2026 — the cl/ fixture's answer key. */
const EDIG = {
  period: '2026-05',
  currency: 'CLP',
  statement: { label: 'cartola-mayo-2026.csv', closing: 4118500 },
  records: { label: 'libro-mayor-banco-mayo-2026.csv', closing: 4250000 },
  adjustments: [
    { side: 'statement', kind: 'in-transit', amount: 242150, what: 'Depósito 31/05, factura 4516' },
    { side: 'statement', kind: 'outstanding', amount: -120000, what: 'Transferencia Imprenta Norte, factura 5610' },
    { side: 'records', kind: 'interest', amount: 8500, what: 'Intereses ganados 31/05' },
    { side: 'records', kind: 'fee', amount: -15000, what: 'Comisión mantención' },
    { side: 'records', kind: 'fee', amount: -2850, what: 'IVA comisión' },
  ],
  matched: [{ statement: '04/05 4512', records: ['CI-1201'], amount: 1190000, date: '04/05/2026' }],
  unmatched: {
    statement: [{ ref: '15/05 comisión', amount: -15000, what: 'Comisión mantención', category: 'fee' }],
    records: [{ ref: 'CE-3311', amount: -120000, what: 'Imprenta Norte', category: 'outstanding' }],
  },
  entries: [{ debit: 'Gastos bancarios', credit: 'Banco', amount: 17850, memo: 'comisión + IVA' }],
};

describe('wantsReconciliation (D-222)', () => {
  it('hears the verb in either language, word-bounded', () => {
    for (const s of [
      'Reconcile the attached bank statement against the attached records',
      'the bank reconciliation for May',
      'Concilia la cartola con el libro mayor',
      'necesito la conciliación bancaria de mayo',
      'cuadrar la cartola contra las facturas',
    ]) {
      expect(wantsReconciliation(s)).toBe(true);
    }
    for (const s of ['reconnect the printer', 'walk three cuadras north', 'summarise the attached expenses']) {
      expect(wantsReconciliation(s)).toBe(false);
    }
  });
});

describe('checkReconciliation (D-222)', () => {
  it('accepts the worked example and keeps every field', () => {
    const read = checkReconciliation(EDIG);
    expect(read.error).toBeUndefined();
    expect(read.reconciliation?.adjustments).toHaveLength(5);
    expect(read.reconciliation?.entries[0]).toEqual(EDIG.entries[0]);
    expect(read.reconciliation?.currency).toBe('CLP');
  });

  it('refuses by name rather than reading a malformed file as nothing to check', () => {
    expect(checkReconciliation([]).error).toBe('not an object');
    expect(checkReconciliation({ ...EDIG, statement: { label: 'x' } }).error).toBe(
      'statement.closing must be a plain number',
    );
    expect(checkReconciliation({ ...EDIG, records: { label: '', closing: 1 } }).error).toBe(
      'records.label must be a non-empty string',
    );
    expect(checkReconciliation({ ...EDIG, adjustments: undefined }).error).toMatch(/"adjustments" must be an array/);
    expect(
      checkReconciliation({ ...EDIG, adjustments: [{ side: 'bank', kind: 'fee', amount: 1, what: 'x' }] }).error,
    ).toBe('adjustment 1: "side" must be "statement" or "records"');
    expect(
      checkReconciliation({ ...EDIG, adjustments: [{ side: 'records', kind: 'fee', amount: 0, what: 'x' }] }).error,
    ).toBe('adjustment 1: an amount of 0 adjusts nothing');
    expect(checkReconciliation({ ...EDIG, matched: [{ statement: 'a', records: [], amount: 1 }] }).error).toMatch(
      /matched 1: "records" must be a non-empty array/,
    );
    expect(checkReconciliation({ ...EDIG, unmatched: { statement: [] } }).error).toBe(
      '"unmatched.records" must be an array',
    );
    expect(
      checkReconciliation({ ...EDIG, entries: [{ debit: 'a', credit: 'b', amount: -1 }] }).error,
    ).toMatch(/entry 1: "amount" must be positive/);
    expect(checkReconciliation({ ...EDIG, period: 5 }).error).toBe('period must be a non-empty string');
  });

  it('treats "entries" as optional — a personal register has no books to post to', () => {
    const { entries: _gone, ...noEntries } = EDIG;
    const read = checkReconciliation(noEntries);
    expect(read.error).toBeUndefined();
    expect(read.reconciliation?.entries).toEqual([]);
  });

  it('reads the file from a sandbox, and says when it is not JSON', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'agentlings-recon-'));
    expect(readReconciliation(dir)).toBeNull();
    writeFileSync(path.join(dir, RECONCILIATION_FILE), '{ not json');
    expect(readReconciliation(dir)?.error).toBe('not valid JSON');
    writeFileSync(path.join(dir, RECONCILIATION_FILE), JSON.stringify(EDIG));
    expect(readReconciliation(dir)?.reconciliation?.records.closing).toBe(4250000);
  });
});

describe('summariseReconciliation and the gate (D-222)', () => {
  it('recomputes both sides from the adjustments and finds the worked example meets at 4.240.650', () => {
    const s = summariseReconciliation(checkReconciliation(EDIG).reconciliation!);
    expect(s.statement.adjusted).toBe(4240650);
    expect(s.records.adjusted).toBe(4240650);
    expect(s.difference).toBe(0);
    expect(s.balances).toBe(true);
    expect(s.counts).toEqual({ matched: 1, unmatchedStatement: 1, unmatchedRecords: 1, adjustments: 5, entries: 1 });
    expect(reconciliationRefusal({ reconciliation: s })).toBeNull();
  });

  it('never trusts a balance the file claims — the sum is its own', () => {
    // Drop the IVA adjustment: the run "forgot" 2.850 and the sides no longer meet.
    const short = { ...EDIG, adjustments: EDIG.adjustments.slice(0, 4) };
    const s = summariseReconciliation(checkReconciliation(short).reconciliation!);
    expect(s.balances).toBe(false);
    expect(s.difference).toBe(-2850);
    expect(reconciliationRefusal({ reconciliation: s })).toBe(
      'not reconciled — the two sides differ by 2,850 CLP (statement 4,240,650 against records 4,243,500). Approving is refused until they meet; reply to the job with what is missing.',
    );
  });

  it('adds in cents, so decimal money does not drift into a false difference', () => {
    const usd = {
      ...EDIG,
      currency: 'USD',
      statement: { label: 'bank', closing: 27395 },
      records: { label: 'ledger', closing: 24457 },
      adjustments: [
        { side: 'statement', kind: 'in-transit', amount: 6700, what: 'night drop' },
        { side: 'statement', kind: 'outstanding', amount: -7350, what: 'checks 2004 2008 2009 2012' },
        { side: 'records', kind: 'interest', amount: 0.1, what: 'interest' },
        { side: 'records', kind: 'interest', amount: 0.2, what: 'interest' },
        { side: 'records', kind: 'other', amount: 2287.7, what: 'note less fee less NSF less charge less error' },
      ],
    };
    const s = summariseReconciliation(checkReconciliation(usd).reconciliation!);
    expect(s.statement.adjusted).toBe(26745);
    expect(s.records.adjusted).toBe(26745);
    expect(s.balances).toBe(true);
  });

  it('refuses a declaration that did not parse, for WITHHELD\'s reason', () => {
    expect(reconciliationRefusal({ reconciliationError: 'RECONCILIATION.json: not valid JSON' })).toMatch(
      /^not reconciled — RECONCILIATION.json: not valid JSON/,
    );
    expect(reconciliationRefusal({})).toBeNull();
  });
});

describe('reconciliationBrief (D-222)', () => {
  it('names the file, the shape, the invariant and the categories, compactly', () => {
    const brief = reconciliationBrief();
    expect(brief).toContain(RECONCILIATION_FILE);
    expect(brief).toContain('"adjustments"');
    expect(brief).toContain('Adjusted balances must be equal');
    expect(brief).toContain('open-invoice');
    expect(brief.split('\n').length).toBeLessThanOrEqual(14);
  });
});
