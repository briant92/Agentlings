// The wire file — the live proof (#20, D-251, D-268).
//
//   npx tsx scripts/prove-nomina.mts        (from the repo root)
//
// **No server, no bank account and no money**, and nothing is written outside
// a throwaway folder in the system temp directory. Every check drives the real
// functions the app's routes call — the contract the run writes, the allowlist
// a person types, the gate at Approve, and the bytes.
//
//   §1  the format is BCI's own, field for field — its thirteen columns, its
//       maxima, and its own example line reproduced from its own screenshot
//   §2  the contract refuses a malformed batch by name, and the queue's seam
//       keeps only what the run declared
//   §3  the allowlist gate: a payee outside it refuses the file WHOLE, naming
//       them, and composes nothing
//   §4  adding the payee makes the SAME batch approvable, with no re-run —
//       the verdict is asked fresh, never stamped
//   §5  what the specification's own rules refuse before anything is written
//   §6  what the app will not do: there is no payment endpoint anywhere in it
//
// The one thing it cannot prove is the ticket's fourth box: one real batch
// composed here, uploaded at the bank and authorised by hand. That needs
// Brian's own charge account, his own payees and his own token, and it is
// owed.
import { mkdtempSync, readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BCI_LAYOUT,
  NOMINA_FILE,
  NOMINA_OUTPUT,
  checkNomina,
  composeNomina,
  nominaBrief,
  nominaCheck,
  nominaRefusal,
  normalisePayee,
  payeeProblem,
  readNomina,
} from '../server/src/nomina.ts';
import {
  addWirePayee,
  readSettings,
  removeWirePayee,
  setWire,
  wireSettings,
  writeSettings,
} from '../server/src/settings.ts';
import type { Nomina } from '../packages/shared/src/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
let ran = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

const section = (title: string) => console.log(`\n${title}`);

// ── §1 the format, against the bank's own specification ──────────────────────

section(
  '§1  BCI, Estructura Archivos — Pago de nómina en línea (5 pages, read 2026-08-26)\n' +
    '    http://www.bci.cl/medios/2012/empresarios/capacitacion_pnol/archivos/estructura.pdf',
);

check('thirteen columns, as its table has', BCI_LAYOUT.columns.length === 13);

check(
  'each column its own maximum, in its order',
  JSON.stringify(BCI_LAYOUT.columns.map((c) => c.max)) ===
    JSON.stringify([12, 18, 3, 12, 1, 45, 16, 20, 20, 3, 30, 45, 25]),
  BCI_LAYOUT.columns.map((c) => `${c.label} ${c.max}`).join(' · '),
);

check(
  'the delimiter is one of the two it allows',
  BCI_LAYOUT.delimiter === ';' || BCI_LAYOUT.delimiter === '|',
  `"${BCI_LAYOUT.delimiter}"`,
);

// The specification's page 5, off its own Notepad screenshot:
//   000012345678;00000000012345678;016;123455678;3;Nombre Prueba;3;;;REM;Prueba Pago;prueba@bci.cl;Cuenta Prueba
// Measured 2026-08-26: its RUT 123455678-3 does NOT pass modulo-11 (the digit
// is 5). The example's digits are fabricated, so the line below is byte for
// byte the bank's except the two RUT columns, which carry a RUT that checks.
const EXAMPLE_WIRE = {
  chargeAccount: '000012345678',
  format: 'bci' as const,
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
const EXAMPLE_LINE =
  '000012345678;00000000012345678;016;10000013;K;Nombre Prueba;3;;;REM;Prueba Pago;prueba@bci.cl;Cuenta Prueba\r\n';
const example = composeNomina(
  {
    paymentType: 'REM',
    rows: [{ rut: '10000013-K', amount: 3, message: 'Prueba Pago', email: 'prueba@bci.cl' }],
  },
  EXAMPLE_WIRE,
);
check(
  "the bank's own example line, field for field",
  example.text === EXAMPLE_LINE,
  example.error ?? JSON.stringify(example.text),
);

check(
  "the specification's own example RUT is measured, not assumed: it does not check",
  nominaCheck({ paymentType: 'REM', rows: [{ rut: '123455678-3', amount: 3 }] }, EXAMPLE_WIRE)
    .rows[0]!.problem?.includes('not a RUT') === true,
);

// ── a throwaway settings folder, so nothing real is touched ──────────────────

const SANDBOX = mkdtempSync(path.join(tmpdir(), 'agentlings-nomina-proof-'));

/** Two payees a person typed, and the account they are paid from. */
const PAYEES = [
  { rut: '76.123.456-0', name: 'Imprenta Norte SpA', bank: '016', account: '00012345678' },
  { rut: '9876543-3', name: 'Ana Rivas', bank: '037', account: '77712345' },
];
let stored = setWire({}, { chargeAccount: '000012345678', format: 'bci' });
for (const p of PAYEES) {
  const problem = payeeProblem(p);
  if (problem) throw new Error(`the proof's own payee is bad: ${problem}`);
  stored = addWirePayee(stored, normalisePayee(p));
}
writeSettings(SANDBOX, stored);
const WIRE = wireSettings(readSettings(SANDBOX));

check(
  'the allowlist round-trips through the real settings store',
  WIRE.payees.length === 2 && WIRE.chargeAccount === '000012345678',
  `${WIRE.payees.map((p) => p.rut).join(', ')} from ${WIRE.chargeAccount}`,
);

check(
  'a RUT is stored one way, whatever way it was typed',
  WIRE.payees[0]!.rut === '76123456-0',
  `typed "${PAYEES[0]!.rut}", stored "${WIRE.payees[0]!.rut}"`,
);

// ── §2 the contract, and the seam that reads it ──────────────────────────────

section('§2  NOMINA.json — what a run writes, and what the app makes of it');

const BATCH: Nomina = {
  paymentType: 'PRV',
  rows: [
    {
      rut: '76123456-0',
      amount: 450000,
      invoice: 'F-1234',
      purchaseOrder: 'OC-88',
      message: 'Agosto',
    },
    { rut: '9876543-3', amount: 800000, invoice: 'F-1235', purchaseOrder: 'OC-89' },
  ],
};

const sandboxDir = mkdtempSync(path.join(tmpdir(), 'agentlings-nomina-job-'));
writeFileSync(path.join(sandboxDir, NOMINA_FILE), JSON.stringify(BATCH), 'utf8');
check(
  `${NOMINA_FILE} is read off a sandbox exactly as the queue reads it`,
  readNomina(sandboxDir)?.nomina?.rows.length === 2,
);

for (const [what, batch, expected] of [
  ['a payment type the bank does not have', { paymentType: 'SUELDO', rows: BATCH.rows }, 'PRV'],
  ['an amount with cents', { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 1.5 }] }, 'whole pesos'],
  ['an amount of nothing', { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 0 }] }, 'more than zero'],
  ['a batch of nobody', { paymentType: 'REM', rows: [] }, 'no rows'],
  [
    'a supplier payment with no factura',
    { paymentType: 'PRV', rows: [{ rut: '9876543-3', amount: 1, purchaseOrder: 'OC-1' }] },
    'invoice',
  ],
] as const) {
  const read = checkNomina(batch);
  check(`refused: ${what}`, read.error?.includes(expected) === true, read.error);
}

check(
  'the brief tells the run it says who and how much, and never where',
  (() => {
    const brief = nominaBrief(WIRE.payees);
    return (
      brief.includes('NEVER say where') &&
      brief.includes('Imprenta Norte SpA') &&
      !brief.includes('00012345678')
    );
  })(),
  'the payees are named to the run; their account numbers are not',
);

// ── §3 the gate: one stranger refuses the whole file ─────────────────────────

section('§3  The payee allowlist at Approve — refused whole, and by name');

const STRANGER: Nomina = {
  paymentType: 'PRV',
  rows: [
    ...BATCH.rows,
    { rut: '11111111-1', amount: 9000000, invoice: 'F-9', purchaseOrder: 'OC-9' },
  ],
};

const refusal = nominaRefusal({ nomina: STRANGER }, WIRE);
check('a batch naming somebody nobody approved is refused', refusal !== null);
check('and the payee is named in the refusal', refusal?.includes('11111111-1') === true, refusal);
check(
  'and it says the whole file was refused, not the stranger dropped',
  refusal?.includes('Nothing was composed') === true && refusal?.includes('refused whole') === true,
);

const wouldCompose = composeNomina(STRANGER, WIRE);
check(
  'the composer refuses it too, on its own — the gate is not the only guard',
  wouldCompose.error !== undefined && wouldCompose.error.includes('11111111-1'),
);

check(
  'the two approved payees are NOT composed either — whole means whole',
  'error' in wouldCompose,
  'no partial file exists at any point',
);

check(
  'nothing was written to disk by any of that',
  !existsSync(path.join(sandboxDir, NOMINA_OUTPUT)),
  `${sandboxDir} holds ${readdirSync(sandboxDir).join(', ')}`,
);

const noAccount = nominaRefusal({ nomina: BATCH }, { ...WIRE, chargeAccount: '' });
check(
  'no charge account is refused before any payee question, and says where to set it',
  noAccount?.includes('charge account') === true && noAccount?.includes('Settings') === true,
  noAccount,
);

const malformed = nominaRefusal({ nominaError: `${NOMINA_FILE}: not an object` }, WIRE);
check(
  'a declaration that did not parse blocks too, rather than reading as no batch',
  malformed?.includes('not an object') === true,
  malformed,
);

// ── §4 the verdict is asked fresh, never stamped ─────────────────────────────

section('§4  Adding the payee makes the SAME batch approvable — no re-run');

const widened = addWirePayee(
  readSettings(SANDBOX),
  normalisePayee({ rut: '11111111-1', name: 'Nuevo Proveedor Ltda', bank: '012', account: '4455' }),
);
writeSettings(SANDBOX, widened);
const AFTER = wireSettings(readSettings(SANDBOX));

check(
  'the same declaration, unchanged, is now allowed',
  nominaRefusal({ nomina: STRANGER }, AFTER) === null,
);

const composed = composeNomina(STRANGER, AFTER);
check('and it composes', composed.text !== undefined, composed.error);
check(
  'three lines, one per payee',
  composed.text?.split('\r\n').filter(Boolean).length === 3,
);
if (composed.text !== undefined) {
  writeFileSync(path.join(sandboxDir, NOMINA_OUTPUT), composed.text, 'utf8');
  const onDisk = readFileSync(path.join(sandboxDir, NOMINA_OUTPUT), 'utf8');
  check(
    `${NOMINA_OUTPUT} is what a person would upload`,
    onDisk === composed.text,
    `\n${onDisk.split('\r\n').filter(Boolean).map((l) => `        ${l}`).join('\n')}`,
  );
  check(
    'every line carries the charge account the person set, never one a run chose',
    onDisk.split('\r\n').filter(Boolean).every((l) => l.startsWith('000012345678;')),
  );
  check(
    "the new payee's account and bank are the ones typed into Settings, in the specification's order",
    // Column B is Cuenta Destino, column C is Banco Destino — account first,
    // then bank. Getting these two the wrong way round is the mistake this
    // check exists for, and it would look plausible in every other way.
    onDisk.includes(';4455;012;'),
    'column B account 4455, column C bank 012',
  );
}

// Taking a payee off refuses the same batch again — the list is the gate.
writeSettings(SANDBOX, removeWirePayee(readSettings(SANDBOX), '11111111-1'));
check(
  'removing the payee refuses the same batch again',
  nominaRefusal({ nomina: STRANGER }, wireSettings(readSettings(SANDBOX))) !== null,
);

// ── §5 the specification's own rules, before anything is written ─────────────

section("§5  What the bank's own format refuses, checked before a byte leaves");

const semicolonPayee = wireSettings(
  addWirePayee(
    setWire({}, { chargeAccount: '1', format: 'bci' }),
    // Not typeable through the form — `payeeProblem` has no rule against a
    // name with a `;` in it, because the composer is where that matters.
    { rut: '9876543-3', name: 'Norte;Sur', bank: '037', account: '1' },
  ),
);
const smuggled = composeNomina(
  { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 1 }] },
  semicolonPayee,
);
check(
  'a delimiter inside a value is refused — the line would parse as a different payment',
  smuggled.error !== undefined && smuggled.error.includes('Nombre Beneficiario'),
  smuggled.error,
);

const longName = wireSettings(
  addWirePayee(setWire({}, { chargeAccount: '1', format: 'bci' }), {
    rut: '9876543-3',
    name: 'A'.repeat(46),
    bank: '037',
    account: '1',
  }),
);
const tooLong = composeNomina(
  { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 1 }] },
  longName,
);
check(
  'a value past the column the specification bounds is refused, naming the column',
  tooLong.error !== undefined && tooLong.error.includes('45'),
  tooLong.error,
);

for (const [what, payee] of [
  ['a bank name where the bank code goes', { rut: '9876543-3', name: 'X', bank: 'BCI', account: '1' }],
  ['an account with a dash in it', { rut: '9876543-3', name: 'X', bank: '037', account: '12-34' }],
  ['a RUT whose digit does not match', { rut: '76123456-1', name: 'X', bank: '037', account: '1' }],
  ['a payee with no name', { rut: '9876543-3', name: '  ', bank: '037', account: '1' }],
] as const) {
  check(`the form refuses ${what}`, payeeProblem(payee) !== null, payeeProblem(payee));
}

// ── §6 what the app will not do ──────────────────────────────────────────────

section('§6  D-219 stands: there is no payment endpoint in this app');

// Grepped rather than asserted. The claim "the app never calls a payment
// endpoint" is worth nothing as a sentence in a comment; this is the check
// that would fail the day somebody added one.
const sources = readdirSync(path.join(ROOT, 'server', 'src'))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => path.join(ROOT, 'server', 'src', f));
const PAYMENT_CALL =
  /(?:fetch|axios|request)\s*\([^)]*(?:\/payments?\b|\/transfers?\b|\/pagos?\b|\/transferencias?\b)/i;
const offenders = sources.filter((file) => PAYMENT_CALL.test(readFileSync(file, 'utf8')));
check(
  'no source file calls a payment or transfer endpoint',
  offenders.length === 0,
  offenders.length ? offenders.map((f) => path.basename(f)).join(', ') : `${sources.length} files read`,
);

check(
  'the whole batch path writes exactly one file, and it is a deliverable',
  readdirSync(sandboxDir).sort().join(', ') === [NOMINA_FILE, NOMINA_OUTPUT].sort().join(', '),
  readdirSync(sandboxDir).join(', '),
);

console.log(
  `\n${bad === 0 ? 'PASS' : 'FAIL'}  ${ran - bad}/${ran} — NOT proven end to end until one real batch is composed here, uploaded at the bank and authorised by hand.`,
);

process.exit(bad === 0 ? 0 : 1);
