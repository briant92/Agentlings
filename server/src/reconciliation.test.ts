import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkReconciliation,
  readReconciliation,
  latestRollForward,
  PRIOR_RECONCILIATION_FILE,
  reconciliationBrief,
  reconciliationRefusal,
  RECONCILIATION_FILE,
  RECONCILIATIONS_DIR,
  summariseReconciliation,
  wantsReconciliation,
  writeRollForward,
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

  it('reads an empty optional as absent — "ref": "" is an honest spelling of none, not a malformed file', () => {
    const written = {
      ...EDIG,
      period: '',
      adjustments: [{ side: 'records', kind: 'returned', amount: -350, what: 'NSF', ref: '' }],
      matched: [{ statement: 'a', records: ['b'], amount: 1, date: '' }],
      // A deposit line has no reference of its own — the second US run wrote "".
      unmatched: {
        statement: [{ ref: '', date: '2026-09-19', amount: -350, what: 'Returned check', category: 'returned' }],
        records: [{ amount: 6700, what: 'Night drop', category: 'in-transit' }],
      },
      entries: [{ debit: 'a', credit: 'b', amount: 1, memo: '   ' }],
    };
    const read = checkReconciliation(written);
    expect(read.error).toBeUndefined();
    expect(read.reconciliation?.period).toBeUndefined();
    expect(read.reconciliation?.unmatched.statement[0]).toEqual({
      date: '2026-09-19',
      amount: -350,
      what: 'Returned check',
      category: 'returned',
    });
    expect(read.reconciliation?.unmatched.records[0].ref).toBeUndefined();
    expect(read.reconciliation?.adjustments[0]).toEqual({ side: 'records', kind: 'returned', amount: -350, what: 'NSF' });
    expect(read.reconciliation?.matched[0]).toEqual({ statement: 'a', records: ['b'], amount: 1 });
    expect(read.reconciliation?.entries[0]).toEqual({ debit: 'a', credit: 'b', amount: 1 });
    // Non-empty still has to be a string.
    expect(checkReconciliation({ ...EDIG, period: 5 }).error).toBe('period must be a non-empty string');
  });

  it('reads one record spelled as the ref itself — "records": "DEP" is one-to-one, not malformed', () => {
    const scalar = { ...EDIG, matched: [{ ...EDIG.matched[0], records: 'CI-1201' }] };
    const read = checkReconciliation(scalar);
    expect(read.error).toBeUndefined();
    expect(read.reconciliation?.matched[0].records).toEqual(['CI-1201']);
    // An empty list, or an empty ref, is still nothing to match against.
    expect(checkReconciliation({ ...EDIG, matched: [{ ...EDIG.matched[0], records: [] }] }).error).toBe(
      'matched 1: "records" must be a non-empty array of record refs',
    );
    expect(checkReconciliation({ ...EDIG, matched: [{ ...EDIG.matched[0], records: '' }] }).error).toBe(
      'matched 1: a record ref must be a non-empty string',
    );
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
  it('names the file, the shape, the side rule, the invariant and the categories, compactly', () => {
    const brief = reconciliationBrief();
    expect(brief).toContain(RECONCILIATION_FILE);
    expect(brief).toContain('"adjustments"');
    expect(brief).toContain('Adjusted balances must then be equal');
    expect(brief).toContain('open-invoice');
    // The first two contract-carrying runs: one put every adjustment on the
    // wrong side, one forced the sides to meet with a 720 plug, and one
    // copied the example's CLP into a dollar report. Each rule is a sentence.
    expect(brief).toContain('the side that does NOT yet have the item');
    expect(brief).toContain('in-transit on the statement side (+)');
    expect(brief).toContain('Never add a plug');
    expect(brief).toContain('is -360 on the records side');
    expect(brief).toContain('the values are placeholders');
    expect(brief).not.toContain('4118500');
    expect(brief).toContain('rather than writing an empty string');
    // The first post-roll-forward run filed every timing item under
    // unmatched and one under adjustments, then claimed the balance in prose.
    expect(brief).toContain('must appear in both');
    expect(brief.split('\n').length).toBeLessThanOrEqual(15);
  });
});

describe('roll-forward state (D-223)', () => {
  const summary = () => summariseReconciliation(checkReconciliation(EDIG).reconciliation!);
  const job = (id: string, over: Partial<Parameters<typeof writeRollForward>[1]> = {}) => ({
    id,
    attachments: [
      { name: 'cartola.csv', bytes: 1, shape: 'csv:fecha|descripción|cargos|abonos|saldo' },
      { name: 'libro.csv', bytes: 1, shape: 'csv:fecha|glosa|debe|haber|saldo' },
    ],
    reconciliation: summary(),
    ...over,
  });
  const SHAPE = ['csv:fecha|descripción|cargos|abonos|saldo', 'csv:fecha|glosa|debe|haber|saldo'];

  it('banks an approved statement as <jobId>.json — the summary verbatim, the shape, the stamp', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rollfwd-'));
    writeRollForward(dir, job('ab12cd34'), 1700000000000);
    const state = JSON.parse(
      readFileSync(path.join(dir, RECONCILIATIONS_DIR, 'ab12cd34.json'), 'utf8'),
    );
    expect(state.jobId).toBe('ab12cd34');
    expect(state.approvedAt).toBe(1700000000000);
    expect(state.inputShape).toEqual([...SHAPE].sort());
    expect(state.reconciliation).toEqual(summary());
  });

  it('refuses to bank a statement that does not balance — the gate\'s check, repeated at the write', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rollfwd-'));
    const bad = summary();
    writeRollForward(dir, job('bad00000', { reconciliation: { ...bad, balances: false } }));
    expect(existsSync(path.join(dir, RECONCILIATIONS_DIR))).toBe(false);
  });

  it('serves the newest state of the same shape and never another shape\'s', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rollfwd-'));
    writeRollForward(dir, job('older111'), 1000);
    writeRollForward(dir, job('newer222'), 2000);
    writeRollForward(
      dir,
      job('usa33333', {
        attachments: [{ name: 'statement.csv', bytes: 1, shape: 'csv:date|desc|amount' }],
      }),
      3000,
    );
    expect(latestRollForward(dir, SHAPE)?.jobId).toBe('newer222');
    expect(latestRollForward(dir, ['csv:date|desc|amount'])?.jobId).toBe('usa33333');
    expect(latestRollForward(dir, ['csv:something|else'])).toBeUndefined();
  });

  it('a state banked without a shape is unknown provenance — served only to a shapeless job', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rollfwd-'));
    writeRollForward(dir, job('noshape1', { attachments: [] }), 1000);
    expect(latestRollForward(dir, SHAPE)).toBeUndefined();
    expect(latestRollForward(dir, undefined)?.jobId).toBe('noshape1');
  });

  it('a file that does not parse loses itself, never the feature', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rollfwd-'));
    writeRollForward(dir, job('good1111'), 1000);
    writeFileSync(path.join(dir, RECONCILIATIONS_DIR, 'junk.json'), '{not json');
    writeFileSync(path.join(dir, RECONCILIATIONS_DIR, 'hollow.json'), '{"jobId": 7}');
    expect(latestRollForward(dir, SHAPE)?.jobId).toBe('good1111');
  });

  it('the brief names the prior file and its number only when a state is handed in', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rollfwd-'));
    writeRollForward(dir, job('prior001'), 1000);
    const prior = latestRollForward(dir, SHAPE);
    const brief = reconciliationBrief(prior);
    expect(brief).toContain(PRIOR_RECONCILIATION_FILE);
    expect(brief).toContain('4,240,650 CLP');
    // The October run looked for September's records-side items in October's
    // STATEMENT, found them absent, and adjusted again what the books had
    // already posted — the side-agnostic "check against this period's files"
    // broke exactly there. Each side is now looked for in its own file.
    expect(brief).toContain("looked for in this period's STATEMENT");
    expect(brief).toContain("looked for in this period's RECORDS");
    expect(brief).toContain('carry it again on the records side, same sign');
    expect(brief).toContain('a third input to your matching script');
    expect(reconciliationBrief()).not.toContain(PRIOR_RECONCILIATION_FILE);
  });
});
