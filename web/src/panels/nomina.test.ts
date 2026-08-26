import { describe, expect, it } from 'vitest';
import type { NominaCheck } from '@agentlings/shared';
import { batchLine, payeeLine, refusedCount, verdictWording } from './nomina';

const CLEAN: NominaCheck = {
  paymentType: 'PRV',
  rows: [
    { rut: '76123456-0', amount: 450000, name: 'Imprenta Norte SpA', allowed: true },
    { rut: '9876543-3', amount: 800000, name: 'Ana Rivas', allowed: true },
  ],
  total: 1250000,
  refusal: null,
  fileName: 'nomina.txt',
};

const BLOCKED: NominaCheck = {
  ...CLEAN,
  rows: [
    CLEAN.rows[0]!,
    {
      rut: '11111111-1',
      amount: 9000000,
      name: null,
      allowed: false,
      problem: 'not on the payee allowlist',
    },
  ],
  total: 9450000,
  refusal: '1 of 2 payees are not approved to be paid: 11111111-1 (not on the payee allowlist).',
};

describe('the batch card’s words (D-268)', () => {
  it('says the count, the money and what the batch is for', () => {
    expect(batchLine(CLEAN)).toBe('2 payees · 1,250,000 · suppliers');
  });

  it('counts one payee as one', () => {
    expect(batchLine({ ...CLEAN, rows: [CLEAN.rows[0]!], total: 450000 })).toBe(
      '1 payee · 450,000 · suppliers',
    );
  });

  it('names an approved payee by the name the allowlist holds', () => {
    expect(payeeLine(CLEAN.rows[0]!)).toBe('Imprenta Norte SpA — 450,000');
  });

  it('names a stranger by RUT, with why it is a stranger', () => {
    expect(payeeLine(BLOCKED.rows[1]!)).toBe('11111111-1 — 9,000,000 · not on the payee allowlist');
  });

  it('gives the server’s refusal verbatim rather than a second opinion about it', () => {
    expect(verdictWording(BLOCKED)).toBe(BLOCKED.refusal);
    expect(refusedCount(BLOCKED)).toBe(1);
  });

  it('never says a clean batch pays anybody — approving writes a file', () => {
    const said = verdictWording(CLEAN);
    expect(said).toContain('composes nomina.txt');
    expect(said).toContain('2 lines');
    expect(said).toContain('Nobody is paid');
    expect(said).toContain('authorise it at the bank');
    expect(said.toLowerCase()).not.toContain('sends');
    expect(refusedCount(CLEAN)).toBe(0);
  });
});
