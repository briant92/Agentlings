import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Nomina, WireSettings } from '@agentlings/shared';
import {
  BCI_LAYOUT,
  checkNomina,
  column,
  runWroteOutput,
  composeNomina,
  NOMINA_FILE,
  NOMINA_OUTPUT,
  nominaBrief,
  nominaCheck,
  nominaRefusal,
  normaliseRut,
  payeeProblem,
  readNomina,
  wantsNomina,
} from './nomina';

/** A wire that would compose: one account paying, two payees a person typed. */
const WIRE: WireSettings = {
  chargeAccount: '000012345678',
  format: 'bci',
  payees: [
    {
      rut: '76123456-0',
      name: 'Imprenta Norte SpA',
      bank: '016',
      account: '00000000012345678',
      accountLabel: 'Imprenta Norte',
    },
    { rut: '9876543-3', name: 'Ana Rivas', bank: '037', account: '77712345' },
  ],
};

const BATCH: Nomina = {
  paymentType: 'PRV',
  rows: [
    {
      rut: '76.123.456-0',
      amount: 450000,
      invoice: 'F-1234',
      purchaseOrder: 'OC-88',
      message: 'Agosto',
      email: 'pagos@imprentanorte.cl',
    },
  ],
};

describe('wantsNomina — the sentence that asks for a batch', () => {
  it('fires on the words a person actually uses, in both languages', () => {
    for (const said of [
      'compose the nómina for August',
      'arma la nomina de proveedores',
      'build a transfer batch from the attached sheet',
      'prepare the payment file for the suppliers',
    ]) {
      expect(wantsNomina(said), said).toBe(true);
    }
  });

  it('does not fire on words that merely contain them', () => {
    for (const said of [
      'summarise the expenses',
      'reconcile the cartola against the ledger',
      'read the nominal rate off the contract',
    ]) {
      expect(wantsNomina(said), said).toBe(false);
    }
  });
});

describe('normaliseRut — one spelling, and its own check digit', () => {
  it('takes any spelling down to body and verifying digit', () => {
    for (const spelling of ['76.123.456-0', '76123456-0', ' 76.123.456 - 0 ']) {
      expect(normaliseRut(spelling), spelling).toEqual({ body: '76123456', dv: '0' });
    }
  });

  it('upper-cases a K and keeps it', () => {
    expect(normaliseRut('10.000.013-k')).toEqual({ body: '10000013', dv: 'K' });
  });

  it("refuses the specification's own example RUT, which does not check", () => {
    // Measured 2026-08-26: BCI's page-5 example line carries 123455678-3, and
    // 123455678 checks to 5 under modulo-11. The example's digits are
    // fabricated — so the example is reproduced below with a RUT that checks,
    // and is otherwise byte for byte the bank's.
    expect(normaliseRut('123455678-3')).toBeNull();
    expect(normaliseRut('123455678-5')).toEqual({ body: '123455678', dv: '5' });
  });

  it('refuses one whose verifying digit does not match its number', () => {
    // 76123456 checks to 0, so 1 is a typo and never a payee.
    expect(normaliseRut('76123456-1')).toBeNull();
  });

  it('refuses one with no verifying digit at all', () => {
    // D-267 measured `@emisso/sii`'s validateRut calling this valid; here the
    // dash is the shape, because columns D and E are two fields.
    expect(normaliseRut('761234560')).toBeNull();
  });

  it('refuses what is not a RUT', () => {
    for (const no of ['', 'Imprenta Norte', '76123456', '-0', 'abc-1']) {
      expect(normaliseRut(no), no).toBeNull();
    }
  });
});

describe('checkNomina — the contract, every refusal named', () => {
  it('takes the batch a run should write', () => {
    expect(checkNomina(BATCH)).toEqual({ nomina: BATCH });
  });

  it('refuses what is not an object, and a missing rows array', () => {
    expect(checkNomina([]).error).toBe('not an object');
    expect(checkNomina({ paymentType: 'PRV' }).error).toContain('"rows" must be an array');
  });

  it('refuses an empty batch — a nómina of nobody pays nobody', () => {
    expect(checkNomina({ paymentType: 'PRV', rows: [] }).error).toContain('no rows');
  });

  it('names the four payment types the specification allows', () => {
    const refusal = checkNomina({ paymentType: 'SUELDO', rows: BATCH.rows }).error!;
    expect(refusal).toContain('PRV');
    expect(refusal).toContain('REM');
    expect(refusal).toContain('DIV');
    expect(refusal).toContain('OTR');
  });

  it('refuses an amount that is not whole pesos, and one that is not positive', () => {
    const row = { ...BATCH.rows[0]! };
    expect(checkNomina({ paymentType: 'PRV', rows: [{ ...row, amount: 4500.5 }] }).error).toContain(
      'whole pesos',
    );
    expect(checkNomina({ paymentType: 'PRV', rows: [{ ...row, amount: 0 }] }).error).toContain(
      'more than zero',
    );
    expect(checkNomina({ paymentType: 'PRV', rows: [{ ...row, amount: -1 }] }).error).toContain(
      'more than zero',
    );
  });

  it('requires the invoice and the purchase order for PRV, as the specification does', () => {
    const { invoice, ...noInvoice } = BATCH.rows[0]!;
    expect(checkNomina({ paymentType: 'PRV', rows: [noInvoice] }).error).toContain('invoice');
    const { purchaseOrder, ...noOrder } = BATCH.rows[0]!;
    expect(checkNomina({ paymentType: 'PRV', rows: [noOrder] }).error).toContain('purchaseOrder');
  });

  it('asks neither of them for a payroll run', () => {
    const read = checkNomina({ paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 800000 }] });
    expect(read.error).toBeUndefined();
  });

  it('refuses a row whose rut is missing', () => {
    expect(checkNomina({ paymentType: 'REM', rows: [{ amount: 1 }] }).error).toContain('rut');
  });

  it('names the row a refusal is about', () => {
    expect(
      checkNomina({ paymentType: 'REM', rows: [{ rut: 'a-1', amount: 1 }, { rut: 'b', amount: 0 }] })
        .error,
    ).toContain('row 2');
  });

  it('reads the file off a sandbox, and says so when it is not JSON', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'nomina-'));
    expect(readNomina(dir)).toBeNull();
    writeFileSync(path.join(dir, NOMINA_FILE), 'not json', 'utf8');
    expect(readNomina(dir)!.error).toBe('not valid JSON');
    writeFileSync(path.join(dir, NOMINA_FILE), JSON.stringify(BATCH), 'utf8');
    expect(readNomina(dir)!.nomina).toEqual(BATCH);
  });
});

describe('nominaCheck — every payee against the allowlist', () => {
  it('allows a batch whose payees are all on the list, and refuses nothing', () => {
    const check = nominaCheck(BATCH, WIRE);
    expect(check.refusal).toBeNull();
    expect(check.total).toBe(450000);
    expect(check.rows).toEqual([
      { rut: '76123456-0', amount: 450000, name: 'Imprenta Norte SpA', allowed: true },
    ]);
    expect(check.fileName).toBe(NOMINA_OUTPUT);
  });

  it('refuses the file whole and names the payee outside the list', () => {
    const stranger: Nomina = {
      paymentType: 'PRV',
      rows: [
        ...BATCH.rows,
        { rut: '11111111-1', amount: 9000000, invoice: 'F-1', purchaseOrder: 'OC-1' },
      ],
    };
    const check = nominaCheck(stranger, WIRE);
    expect(check.rows[0]!.allowed).toBe(true);
    expect(check.rows[1]!.allowed).toBe(false);
    expect(check.refusal).toContain('11111111-1');
    expect(check.refusal).toContain('payee allowlist');
    // Whole, never partial: the allowed line is refused with the stranger.
    expect(check.refusal).toContain('Nothing was composed');
    // The total is what would have left the account, stranger included.
    expect(check.total).toBe(9450000);
  });

  it('names every payee outside the list, not only the first', () => {
    const check = nominaCheck(
      {
        paymentType: 'REM',
        rows: [
          { rut: '11111111-1', amount: 1000 },
          { rut: '22222222-2', amount: 2000 },
        ],
      },
      WIRE,
    );
    expect(check.refusal).toContain('11111111-1');
    expect(check.refusal).toContain('22222222-2');
  });

  it('calls a row whose rut is not a rut exactly that, rather than "not on the list"', () => {
    const check = nominaCheck({ paymentType: 'REM', rows: [{ rut: '76123456-1', amount: 1 }] }, WIRE);
    expect(check.rows[0]!.problem).toContain('not a RUT');
    expect(check.refusal).toContain('not a RUT');
  });

  it('matches on the whole RUT — a right number with a wrong digit is a stranger', () => {
    // 76123456-0 is on the list; 7612345-4 is a different taxpayer entirely,
    // and its own check digit is sound — so it is refused as a stranger
    // rather than as a malformed RUT.
    const check = nominaCheck({ paymentType: 'REM', rows: [{ rut: '7612345-4', amount: 1 }] }, WIRE);
    expect(check.rows[0]!.problem).toBe('not on the payee allowlist');
    expect(check.refusal).toContain('7612345-4');
  });

  it('refuses when no charge account has been set, before any payee question', () => {
    const check = nominaCheck(BATCH, { ...WIRE, chargeAccount: '' });
    expect(check.refusal).toContain('charge account');
    expect(check.refusal).toContain('Settings');
  });

  it('is asked fresh — adding the payee makes the same batch approvable', () => {
    const stranger: Nomina = { paymentType: 'REM', rows: [{ rut: '11111111-1', amount: 1000 }] };
    expect(nominaCheck(stranger, WIRE).refusal).not.toBeNull();
    const widened: WireSettings = {
      ...WIRE,
      payees: [...WIRE.payees, { rut: '11111111-1', name: 'Nuevo', bank: '012', account: '999' }],
    };
    expect(nominaCheck(stranger, widened).refusal).toBeNull();
  });
});

describe('nominaRefusal — the gate at Approve', () => {
  it('says nothing about a job that declared no batch', () => {
    expect(nominaRefusal({}, WIRE)).toBeNull();
  });

  it('refuses a declaration that did not parse, rather than reading it as no batch', () => {
    const refusal = nominaRefusal({ nominaError: 'NOMINA.json: not an object' }, WIRE)!;
    expect(refusal).toContain('not an object');
    expect(refusal).toContain('Nothing was composed');
  });

  it('passes a batch whose payees are all on the list', () => {
    expect(nominaRefusal({ nomina: BATCH }, WIRE)).toBeNull();
  });

  it('refuses one that names a stranger', () => {
    const nomina: Nomina = { paymentType: 'REM', rows: [{ rut: '11111111-1', amount: 1 }] };
    expect(nominaRefusal({ nomina }, WIRE)).toContain('11111111-1');
  });
});

describe('composeNomina — BCI’s own specification', () => {
  it('writes the bank’s own example line, field for field', () => {
    // The specification's page 5, reproduced from its own screenshot:
    // 000012345678;00000000012345678;016;123455678;3;Nombre Prueba;3;;;REM;Prueba Pago;prueba@bci.cl;Cuenta Prueba
    // Every field is the bank's own except the two RUT columns: its example
    // RUT does not pass modulo-11 (measured above), so a valid one stands in.
    const wire: WireSettings = {
      chargeAccount: '000012345678',
      format: 'bci',
      payees: [
        {
          rut: '10000013-K',
          name: 'Nombre Prueba',
          bank: '016',
          account: '00000000012345678',
          accountLabel: 'Cuenta Prueba',
        },
      ],
    };
    const composed = composeNomina(
      {
        paymentType: 'REM',
        rows: [{ rut: '10000013-K', amount: 3, message: 'Prueba Pago', email: 'prueba@bci.cl' }],
      },
      wire,
    );
    expect(composed.error ?? composed.text).toBe(
      '000012345678;00000000012345678;016;10000013;K;Nombre Prueba;3;;;REM;Prueba Pago;prueba@bci.cl;Cuenta Prueba\r\n',
    );
  });

  it('has the thirteen columns the specification has, in its order', () => {
    expect(BCI_LAYOUT.columns).toHaveLength(13);
    expect(BCI_LAYOUT.columns.map((c) => c.label)).toEqual([
      'N° Cuenta Cargo',
      'N° Cuenta Destino',
      'Banco Destino',
      'Rut Beneficiario',
      'Dígito verificador Beneficiario',
      'Nombre Beneficiario',
      'Monto Transferencia',
      'N° Factura / Boleta',
      'N° Orden de Compra',
      'Tipo de Pago',
      'Mensaje Destinatario',
      'E-mail Destinatario',
      'Cuenta Destino inscrita como',
    ]);
    expect(BCI_LAYOUT.columns.map((c) => c.max)).toEqual([
      12, 18, 3, 12, 1, 45, 16, 20, 20, 3, 30, 45, 25,
    ]);
  });

  it('writes one line per row, each ended the way the bank’s example is', () => {
    const two = composeNomina(
      {
        paymentType: 'REM',
        rows: [
          { rut: '76123456-0', amount: 1 },
          { rut: '9876543-3', amount: 2 },
        ],
      },
      WIRE,
    );
    expect(two.text?.split('\r\n').filter(Boolean)).toHaveLength(2);
  });

  it('leaves an optional column empty rather than writing something into it', () => {
    const composed = composeNomina(
      { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 2 }] },
      WIRE,
    );
    // Ana Rivas has no accountLabel and the row has no message or email:
    // three empty fields, and the invoice and order empty for a REM.
    expect(composed.text).toBe('000012345678;77712345;037;9876543;3;Ana Rivas;2;;;REM;;;\r\n');
  });

  it('refuses a value longer than the column the specification gives it', () => {
    const long: WireSettings = {
      ...WIRE,
      payees: [{ ...WIRE.payees[1]!, name: 'A'.repeat(46) }],
    };
    const composed = composeNomina(
      { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 2 }] },
      long,
    );
    expect(composed.error).toContain('Nombre Beneficiario');
    expect(composed.error).toContain('45');
  });

  it('refuses a value carrying a delimiter, which the specification cannot escape', () => {
    for (const bad of ['Norte;Sur', 'Norte|Sur', 'Norte\nSur']) {
      const composed = composeNomina(
        { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 2, message: bad }] },
        WIRE,
      );
      expect(composed.error, bad).toContain('Mensaje Destinatario');
    }
  });

  it('refuses a bank code or an account that is not numeric, as the specification says', () => {
    const wrong: WireSettings = { ...WIRE, payees: [{ ...WIRE.payees[1]!, bank: '01A' }] };
    expect(
      'error' in
        (composeNomina({ paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 2 }] }, wrong) as {
          error?: string;
        }),
    ).toBe(true);
  });

  it('never composes a batch the allowlist would refuse — the gate is not the only guard', () => {
    const composed = composeNomina(
      { paymentType: 'REM', rows: [{ rut: '11111111-1', amount: 1 }] },
      WIRE,
    );
    expect(composed.error).toContain('11111111-1');
  });

  it('writes the amount as plain digits, however large', () => {
    const composed = composeNomina(
      { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 12345678 }] },
      WIRE,
    );
    expect(composed.text).toContain(';12345678;');
  });
});

describe('payeeProblem — what a person may type into the allowlist', () => {
  it('takes a payee with everything the file needs', () => {
    expect(
      payeeProblem({ rut: '76.123.456-0', name: 'Imprenta Norte SpA', bank: '016', account: '123' }),
    ).toBeNull();
  });

  it('refuses each missing or malformed field by name', () => {
    expect(payeeProblem({ rut: '76123456-1', name: 'X', bank: '016', account: '1' })).toContain(
      'RUT',
    );
    expect(payeeProblem({ rut: '76123456-0', name: '', bank: '016', account: '1' })).toContain(
      'name',
    );
    expect(payeeProblem({ rut: '76123456-0', name: 'X', bank: 'BCI', account: '1' })).toContain(
      'Banco Destino',
    );
    expect(payeeProblem({ rut: '76123456-0', name: 'X', bank: '016', account: '' })).toContain(
      'account number',
    );
  });

  it('takes an account the specification would take, rather than being stricter than the bank', () => {
    // Column B is *Alfanumérico*. The first version demanded digits, which
    // would have refused an account the bank itself accepts — and being
    // stricter than the bank is not a safety property.
    expect(payeeProblem({ rut: '76123456-0', name: 'X', bank: '016', account: '12-34' })).toBeNull();
  });
});

describe('nominaBrief — what the run is told', () => {
  it('names the file, the four types, and that it says who and not where', () => {
    const brief = nominaBrief([{ rut: "76123456-0", name: "Imprenta Norte SpA", bank: "016", account: "1" }]);
    expect(brief).toContain(NOMINA_FILE);
    expect(brief).toContain('PRV');
    expect(brief).toContain('allowlist');
    // The one thing a run must not try: bank coordinates.
    expect(brief.toLowerCase()).toContain('never');
  });
});

describe("review's catches (D-268)", () => {
  it('names the missing charge account AND every stranger in one refusal', () => {
    // The first version answered the charge account and stopped, so in the
    // shipped state — no wire block at all — every batch refused with "no
    // charge account" and NO payee was ever named. Two trips, and the
    // ticket's own acceptance sentence unprovable until an account was set.
    const check = nominaCheck(
      { paymentType: 'REM', rows: [{ rut: '11111111-1', amount: 1000 }] },
      { chargeAccount: '', format: 'bci', payees: [] },
    );
    expect(check.refusal).toContain('charge account');
    expect(check.refusal).toContain('11111111-1');
  });

  it('refuses a column the layout bounds AT THE GATE, not only when composing', () => {
    // This is the one that mattered: composeNomina runs after the outbox has
    // been sent, so a 46-character name meant Approve answered 400 with the
    // messages already gone. The gate now asks the whole question.
    const long: WireSettings = {
      ...WIRE,
      payees: [{ ...WIRE.payees[1]!, name: 'A'.repeat(46) }],
    };
    const refusal = nominaRefusal(
      { nomina: { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 2 }] } },
      long,
    );
    expect(refusal).toContain('Nombre Beneficiario');
    expect(refusal).toContain('45');
  });

  it('refuses a smuggled delimiter at the gate too', () => {
    const sneaky: WireSettings = {
      ...WIRE,
      payees: [{ ...WIRE.payees[1]!, name: 'Norte;Sur' }],
    };
    expect(
      nominaRefusal({ nomina: { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 2 }] } }, sneaky),
    ).toContain('Nombre Beneficiario');
  });

  it('the gate and the composer never disagree — whatever one refuses, so does the other', () => {
    const wires: WireSettings[] = [
      WIRE,
      { ...WIRE, chargeAccount: '' },
      { ...WIRE, payees: [{ ...WIRE.payees[1]!, name: 'A'.repeat(46) }] },
      { ...WIRE, payees: [{ ...WIRE.payees[1]!, name: 'Norte;Sur' }] },
      { ...WIRE, payees: [] },
    ];
    const batch: Nomina = { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 2 }] };
    for (const wire of wires) {
      const gate = nominaRefusal({ nomina: batch }, wire);
      const composed = composeNomina(batch, wire);
      expect(gate === null, JSON.stringify(wire.payees)).toBe(composed.text !== undefined);
    }
  });

  it('refuses an amount too large to be written down exactly', () => {
    // Number.isInteger is true above 2^53, where the figure has already been
    // rounded — and 2^53 is still short of the column's sixteen digits.
    expect(
      checkNomina({ paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 2 ** 53 + 2 }] }).error,
    ).toContain('too large');
  });

  it('reserves the output name — a run may not write the bank file itself', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'nomina-out-'));
    expect(runWroteOutput(dir)).toBe(false);
    writeFileSync(path.join(dir, NOMINA_OUTPUT), 'anything;at;all\r\n', 'utf8');
    expect(runWroteOutput(dir)).toBe(true);
  });

  it('takes the account the specification calls alfanumérico, not only digits', () => {
    // The first version demanded digits and would have refused an account the
    // bank itself accepts. Being stricter than the bank is not a safety
    // property.
    expect(payeeProblem({ rut: '76123456-0', name: 'X', bank: '016', account: 'CTA00123' })).toBeNull();
  });

  it('refuses at the form what the file would refuse — the maxima are the layout’s', () => {
    for (const [what, payee] of [
      ['a name past the column', { rut: '76123456-0', name: 'A'.repeat(46), bank: '016', account: '1' }],
      ['a name carrying a delimiter', { rut: '76123456-0', name: 'Norte;Sur', bank: '016', account: '1' }],
      ['a bank code past three', { rut: '76123456-0', name: 'X', bank: '0161', account: '1' }],
      ['an account past eighteen', { rut: '76123456-0', name: 'X', bank: '016', account: '1'.repeat(19) }],
      ['an enrolled name past 25', { rut: '76123456-0', name: 'X', bank: '016', account: '1', accountLabel: 'A'.repeat(26) }],
    ] as const) {
      expect(payeeProblem(payee), what).not.toBeNull();
    }
  });

  it('still refuses a bank code that is not numeric, because the column is', () => {
    expect(payeeProblem({ rut: '76123456-0', name: 'X', bank: 'BCI', account: '1' })).toContain(
      'numérico',
    );
  });

  it('reads every bound off the layout, so one table is the only place a size is written', () => {
    expect(column(BCI_LAYOUT, 'name').max).toBe(45);
    expect(column(BCI_LAYOUT, 'account').max).toBe(18);
    expect(column(BCI_LAYOUT, 'bank').max).toBe(3);
    expect(column(BCI_LAYOUT, 'chargeAccount').max).toBe(12);
    expect(column(BCI_LAYOUT, 'accountLabel').max).toBe(25);
  });
});
