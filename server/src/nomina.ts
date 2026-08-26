import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MAX_NOMINA_ROWS,
  MAX_NOMINA_TEXT_CHARS,
  NOMINA_PAYMENT_TYPES,
  type Job,
  type Nomina,
  type NominaCheck,
  type NominaCheckRow,
  type NominaPaymentType,
  type NominaRow,
  type WirePayee,
  type WireSettings,
} from '@agentlings/shared';

/**
 * The wire file (D-268, #20): a transfer batch composed here as a deliverable
 * and authorised at the bank by hand.
 *
 * The app never calls a payment endpoint, so D-219 stands by its own words —
 * composing a file initiates nothing, and the token press at the bank is the
 * act. What this file owns is everything up to that press: the contract a run
 * writes, the allowlist a person typed, the refusal at review, and the bytes.
 *
 * ## Who says what
 *
 * A run says **who and how much**. The payee allowlist in Settings says
 * **where the money goes** — the bank, the account, the name on the file. A
 * run therefore cannot name an account at all, which is why "outside the
 * allowlist" is the only way a payee can be wrong: the case where a run keeps
 * an approved name and quietly changes the account number does not exist
 * here, because the run was never asked for an account number.
 *
 * That split is also what makes the gate cheap to be right about. The check
 * is a set membership on a RUT, and the money-routing data has exactly one
 * source: a person typing it.
 *
 * ## The format
 *
 * Written against BCI's own published specification, *Estructura Archivos —
 * Pago de nómina en línea* (5 pages, read 2026-08-26):
 * http://www.bci.cl/medios/2012/empresarios/capacitacion_pnol/archivos/estructura.pdf
 *
 * Its thirteen columns, their maxima and their types are `BCI_LAYOUT` below,
 * field for field. Santander Chile — where the batch is actually authorised —
 * publishes no layout at all: its Pagos Masivos page refuses a non-browser,
 * no specification exists anywhere public, and the ERP vendors that generate
 * one (Manager+'s SANTANDER8, Buk, Talana) document only *that* they build
 * "la estructura requerida por el banco", never the fields. Its layout is a
 * template the bank hands the client inside Office Banking. So the one
 * specification this repo can cite is BCI's, and a second `NominaFormat`
 * joins the table on the day that template arrives — the layout is the only
 * bank-shaped thing here; the contract, the allowlist, the gate and the
 * review card are the same either way.
 *
 * Four choices the specification does not settle, made once and here:
 *
 * - **Delimiter `;`** — it allows `;` or `|` and its own example uses `;`.
 * - **No padding.** The table gives *maxima*, not fixed widths, and the file
 *   is delimited. Its example shows zero-padded accounts, but pads column B
 *   to 17 where the maximum is 18 — so no padding rule can be read off it,
 *   and those leading zeros are the customer's account number as written.
 *   They are typed into Settings, which is where an account number belongs.
 * - **CRLF**, as the example's Notepad screenshot shows.
 * - **UTF-8**, which the specification never states. This is the one choice
 *   the first real upload will settle; a Chilean payee name carries an ñ, so
 *   refusing non-ASCII was never an option.
 */

export const NOMINA_FILE = 'NOMINA.json';
/** What the composed batch is called in the sandbox once Approve has written it. */
export const NOMINA_OUTPUT = 'nomina.txt';

/**
 * Whether the sentence asks for a transfer batch, in either language the desk
 * hears. Word-bounded, so "nominal" and "reconcile" do not fire — a missed
 * sentence costs the contract section, a wrong one costs a brief the run
 * ignores (D-011's rule for intake facts).
 */
const ASKS_FOR_NOMINA =
  /\b(n[oó]minas?|transfer\s+batch|payment\s+file|payments?\s+batch|batch\s+of\s+(?:transfers|payments))\b/i;

export function wantsNomina(text: string): boolean {
  return ASKS_FOR_NOMINA.test(text);
}

/** One column of a bank's upload format, straight off its specification. */
export interface NominaColumn {
  /** The bank's own name for it, so a refusal names what the bank names. */
  label: string;
  /** Its maximum length in characters. */
  max: number;
  /** Whether the bank will only take digits here. */
  numeric?: boolean;
}

export interface NominaLayout {
  /** The bank whose specification this is, as a refusal should say it. */
  bank: string;
  /** One of `;` or `|`; the value may contain neither, since neither escapes. */
  delimiter: string;
  columns: NominaColumn[];
}

/**
 * BCI's thirteen columns, in its order, with its maxima and its types.
 * The two obligatory-for-PRV columns are notes (1) on its page 2; the four
 * payment-type codes are its note (2).
 */
export const BCI_LAYOUT: NominaLayout = {
  bank: 'BCI',
  delimiter: ';',
  columns: [
    { label: 'N° Cuenta Cargo', max: 12, numeric: true },
    { label: 'N° Cuenta Destino', max: 18 },
    { label: 'Banco Destino', max: 3, numeric: true },
    { label: 'Rut Beneficiario', max: 12 },
    { label: 'Dígito verificador Beneficiario', max: 1 },
    { label: 'Nombre Beneficiario', max: 45 },
    { label: 'Monto Transferencia', max: 16, numeric: true },
    { label: 'N° Factura / Boleta', max: 20 },
    { label: 'N° Orden de Compra', max: 20 },
    { label: 'Tipo de Pago', max: 3 },
    { label: 'Mensaje Destinatario', max: 30 },
    { label: 'E-mail Destinatario', max: 45 },
    { label: 'Cuenta Destino inscrita como', max: 25 },
  ],
};

const LAYOUTS: Record<WireSettings['format'], NominaLayout> = { bci: BCI_LAYOUT };

export function nominaLayout(format: WireSettings['format']): NominaLayout {
  return LAYOUTS[format];
}

/**
 * A RUT taken down to its body and its verifying digit, or null.
 *
 * Its own modulo-11 digit is computed here rather than asked of a library:
 * D-267 measured `@emisso/sii`'s `validateRut` calling `761234560` valid
 * while its `splitRut` threw on the same string, and a money file is not the
 * place to hold a dependency already measured disagreeing with itself. The
 * dash is required because columns D and E are two fields, not one.
 */
export function normaliseRut(rut: string): { body: string; dv: string } | null {
  if (typeof rut !== 'string') return null;
  const bare = rut.replace(/[.\s]/g, '').toUpperCase();
  const parts = /^(\d{1,12})-([\dK])$/.exec(bare);
  if (!parts) return null;
  const [, body, dv] = parts as unknown as [string, string, string];
  return checkDigit(body) === dv ? { body, dv } : null;
}

/** Chile's modulo-11 verifying digit: weights 2..7 from the right, 11 → 0, 10 → K. */
function checkDigit(body: string): string {
  let sum = 0;
  let weight = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return '0';
  if (rest === 10) return 'K';
  return String(rest);
}

/** The one spelling a RUT is compared and written in: `76123456-0`. */
function rutKey(rut: string): string | null {
  const split = normaliseRut(rut);
  return split ? `${split.body}-${split.dv}` : null;
}

export type NominaRead =
  | { nomina: Nomina; error?: undefined }
  | { nomina?: undefined; error: string };

/** Parses NOMINA.json from a sandbox: null when absent, the reason when invalid. */
export function readNomina(dir: string): NominaRead | null {
  const file = path.join(dir, NOMINA_FILE);
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { error: 'not valid JSON' };
  }
  return checkNomina(parsed);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** An optional one-line string; an empty one is an honest spelling of "none". */
function optionalText(value: unknown, field: string): string | undefined | { error: string } {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return { error: `${field} must be a string` };
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (trimmed.length > MAX_NOMINA_TEXT_CHARS) {
    return { error: `${field} is over ${MAX_NOMINA_TEXT_CHARS} characters` };
  }
  return trimmed;
}

const failed = (v: unknown): v is { error: string } => isRecord(v) && typeof v.error === 'string';

/**
 * The contract, over an already-parsed value. Strict, and every refusal names
 * both the row and the field: this file decides what a batch pays, so a
 * malformed one reading as "no batch" would turn the gate off exactly where
 * it was asked for — WITHHELD's rule (D-181), applied to money leaving.
 */
export function checkNomina(parsed: unknown): NominaRead {
  if (!isRecord(parsed)) return { error: 'not an object' };
  const type = parsed.paymentType;
  if (typeof type !== 'string' || !NOMINA_PAYMENT_TYPES.includes(type as NominaPaymentType)) {
    return {
      error: `"paymentType" must be one of ${NOMINA_PAYMENT_TYPES.join(', ')} — PRV suppliers, REM payroll, DIV dividends, OTR other`,
    };
  }
  const paymentType = type as NominaPaymentType;
  if (!Array.isArray(parsed.rows)) {
    return { error: '"rows" must be an array — one entry per payee' };
  }
  if (parsed.rows.length === 0) return { error: 'no rows — a nómina of nobody pays nobody' };
  if (parsed.rows.length > MAX_NOMINA_ROWS) {
    return { error: `${parsed.rows.length} rows — the cap is ${MAX_NOMINA_ROWS}` };
  }

  const rows: NominaRow[] = [];
  for (const [i, raw] of parsed.rows.entries()) {
    const n = `row ${i + 1}`;
    if (!isRecord(raw)) return { error: `${n} is not an object` };
    if (typeof raw.rut !== 'string' || raw.rut.trim() === '') {
      return { error: `${n}: "rut" must be the payee's RUT, as 76123456-0` };
    }
    if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount)) {
      return { error: `${n}: "amount" must be a plain number of pesos` };
    }
    if (!Number.isInteger(raw.amount)) {
      return { error: `${n}: "amount" must be whole pesos — CLP has no cents` };
    }
    if (raw.amount <= 0) return { error: `${n}: "amount" must be more than zero` };
    const optional: Partial<NominaRow> = {};
    for (const field of ['invoice', 'purchaseOrder', 'message', 'email'] as const) {
      const got = optionalText(raw[field], `${n}: "${field}"`);
      if (failed(got)) return got;
      if (got !== undefined) optional[field] = got;
    }
    // The specification's note (1): both columns are obligatory for PRV.
    if (paymentType === 'PRV') {
      for (const field of ['invoice', 'purchaseOrder'] as const) {
        if (optional[field] === undefined) {
          return {
            error: `${n}: "${field}" is required for PRV — the bank's specification makes both the factura and the orden de compra obligatory for supplier payments`,
          };
        }
      }
    }
    rows.push({ rut: raw.rut.trim(), amount: raw.amount, ...optional });
  }
  return { nomina: { paymentType, rows } };
}

/**
 * What Approve would do with this batch, against the allowlist as it stands
 * right now.
 *
 * Recomputed on every ask and deliberately never stamped on the job: a payee
 * added in Settings *after* seeing the refusal has to make the same file
 * approvable without re-running anything. A verdict frozen at completion
 * would be the D-026 shape — a gate that ships inert against the state it is
 * meant to read.
 */
export function nominaCheck(nomina: Nomina, wire: WireSettings): NominaCheck {
  const byRut = new Map<string, WirePayee>();
  for (const payee of wire.payees) {
    const key = rutKey(payee.rut);
    if (key) byRut.set(key, payee);
  }
  const rows: NominaCheckRow[] = nomina.rows.map((row) => {
    const key = rutKey(row.rut);
    if (!key) {
      return {
        rut: row.rut,
        amount: row.amount,
        name: null,
        allowed: false,
        problem: 'not a RUT, or its verifying digit does not match its number',
      };
    }
    const payee = byRut.get(key);
    if (!payee) {
      return {
        rut: key,
        amount: row.amount,
        name: null,
        allowed: false,
        problem: 'not on the payee allowlist',
      };
    }
    return { rut: key, amount: row.amount, name: payee.name, allowed: true };
  });
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return {
    paymentType: nomina.paymentType,
    rows,
    total,
    refusal: refusalFor(rows, wire),
    fileName: NOMINA_OUTPUT,
  };
}

/**
 * The one sentence Approve refuses with, or null.
 *
 * The charge account is asked first because it is the reviewer's own
 * settings rather than a verdict on the run — being told about a stranger
 * when the real blocker is an empty field is two trips instead of one.
 *
 * The refusal is whole, never partial: the recipient rule of D-082 applied
 * to a file. Fewer payees than the sheet had is fine; one payee nobody
 * approved blocks the batch, because a nómina is uploaded as one thing and
 * composing the clean half of it is composing half a payment run.
 */
function refusalFor(rows: NominaCheckRow[], wire: WireSettings): string | null {
  if (!wire.chargeAccount.trim()) {
    return 'no charge account — set the account this batch debits in Settings, under the payee allowlist. Nothing was composed.';
  }
  const refused = rows.filter((row) => !row.allowed);
  if (refused.length === 0) return null;
  const named = refused.map((row) => `${row.rut} (${row.problem})`).join('; ');
  return (
    `${refused.length} of ${rows.length} ${refused.length === 1 ? 'payee is' : 'payees are'} not approved to be paid: ${named}. ` +
    'Add the payee in Settings under the payee allowlist, or have the run drop the line. ' +
    'Nothing was composed — a nómina is uploaded whole, so it is refused whole.'
  );
}

/**
 * The gate at Approve (D-268), asked at the same seam as the reconciliation
 * gate and for the same reason: a batch is refused before anything is sent,
 * applied or written, with the job still reviewable.
 */
export function nominaRefusal(
  job: Pick<Job, 'nomina' | 'nominaError'>,
  wire: WireSettings,
): string | null {
  if (job.nominaError) {
    return `${job.nominaError}. Reply to the job to have it written properly. Nothing was composed.`;
  }
  if (!job.nomina) return null;
  return nominaCheck(job.nomina, wire).refusal;
}

export type NominaComposed =
  | { text: string; error?: undefined }
  | { text?: undefined; error: string };

/**
 * The batch as bytes, or the reason it is not.
 *
 * The allowlist is re-asked here rather than assumed: the gate above is where
 * a person is *told*, and this is what actually writes money-routing data, so
 * it refuses a stranger on its own rather than trusting a caller to have
 * checked. Two guards on one rule is the cheap half of D-030's lesson — the
 * expensive half is two *implementations*, and there is one, `nominaCheck`.
 */
export function composeNomina(nomina: Nomina, wire: WireSettings): NominaComposed {
  const layout = nominaLayout(wire.format);
  const check = nominaCheck(nomina, wire);
  if (check.refusal) return { error: check.refusal };
  const byRut = new Map<string, WirePayee>();
  for (const payee of wire.payees) {
    const key = rutKey(payee.rut);
    if (key) byRut.set(key, payee);
  }

  const lines: string[] = [];
  for (const [i, row] of nomina.rows.entries()) {
    // Non-null by construction: a row without a key or a payee is a refusal
    // above, and this loop is only reached when there was none.
    const split = normaliseRut(row.rut)!;
    const payee = byRut.get(`${split.body}-${split.dv}`)!;
    const values = [
      wire.chargeAccount.trim(),
      payee.account.trim(),
      payee.bank.trim(),
      split.body,
      split.dv,
      payee.name.trim(),
      String(row.amount),
      row.invoice ?? '',
      row.purchaseOrder ?? '',
      nomina.paymentType,
      row.message ?? '',
      row.email ?? '',
      payee.accountLabel?.trim() ?? '',
    ];
    for (const [c, column] of layout.columns.entries()) {
      const problem = columnProblem(values[c] ?? '', column, layout);
      if (problem) return { error: `row ${i + 1}, ${column.label}: ${problem}` };
    }
    lines.push(values.join(layout.delimiter));
  }
  return { text: lines.map((line) => `${line}\r\n`).join('') };
}

/**
 * What the bank would refuse about one value, or null — its own maximum, its
 * own type, and the two characters the format cannot carry.
 *
 * A delimiter inside a value is the sharp one. The specification gives no
 * escape and no quoting, so a payee called "Norte;Sur" does not produce a
 * malformed line the bank rejects — it produces a *well-formed* line with
 * fourteen fields, which is a different payment. Both delimiters are refused
 * whichever one this layout writes, because the file may be re-read with the
 * other.
 */
function columnProblem(value: string, column: NominaColumn, layout: NominaLayout): string | null {
  if (/[;|\r\n]/.test(value)) {
    return `"${value}" carries a ; | or line break, and ${layout.bank}'s format has no way to escape one — the line would parse as a different payment`;
  }
  if (value.length > column.max) {
    return `"${value}" is ${value.length} characters and the column takes ${column.max}`;
  }
  if (column.numeric && value !== '' && !/^\d+$/.test(value)) {
    return `"${value}" must be digits only — the specification calls this column numérico`;
  }
  return null;
}

/**
 * What is wrong with a payee a person is adding, or null.
 *
 * Checked here rather than at compose time so the allowlist cannot *hold* a
 * payee the composer would refuse: an account with a dash in it would fail at
 * Approve, weeks later, with the batch already written and a person waiting.
 * The add flow probes before it writes, which is D-244's rule.
 */
export function payeeProblem(payee: unknown): string | null {
  if (!isRecord(payee)) return 'a payee is a RUT, a name, a bank code and an account number';
  const rut = typeof payee.rut === 'string' ? normaliseRut(payee.rut) : null;
  if (!rut) {
    return 'that is not a RUT — write it with its verifying digit after a dash, as 76123456-0, and check the digit matches the number';
  }
  const name = typeof payee.name === 'string' ? payee.name.trim() : '';
  if (!name) return 'a payee needs a name — it goes on the file as Nombre Beneficiario';
  if (typeof payee.bank !== 'string' || !/^\d{1,3}$/.test(payee.bank.trim())) {
    return "a bank code is up to three digits, as 016 — it is the bank's own code, not its name";
  }
  if (typeof payee.account !== 'string' || !/^\d{1,18}$/.test(payee.account.trim())) {
    return 'an account number is digits only, up to 18 — leading zeros are kept as you type them';
  }
  const label = payee.accountLabel;
  if (label !== undefined && label !== null && typeof label !== 'string') {
    return 'the enrolled-account name must be text';
  }
  if (typeof label === 'string' && label.trim().length > 25) {
    return 'the enrolled-account name takes 25 characters';
  }
  return null;
}

/** One payee, as the allowlist keeps it — normalised so a spelling is not an identity. */
export function normalisePayee(payee: {
  rut: string;
  name: string;
  bank: string;
  account: string;
  accountLabel?: string | null;
}): WirePayee {
  const split = normaliseRut(payee.rut)!;
  const label = typeof payee.accountLabel === 'string' ? payee.accountLabel.trim() : '';
  return {
    rut: `${split.body}-${split.dv}`,
    name: payee.name.trim(),
    bank: payee.bank.trim(),
    account: payee.account.trim(),
    ...(label ? { accountLabel: label } : {}),
  };
}

/**
 * The contract section a run gets when the sentence asks for a batch.
 *
 * It is told what it may decide and what it may not, because the second half
 * is the load-bearing one: a run that invents an account number has not made
 * a mistake the reviewer can see, and the only reliable answer is that it was
 * never asked for one.
 */
export function nominaBrief(payees: WirePayee[]): string {
  const list = payees.length
    ? payees.map((p) => `  - ${p.name} — ${p.rut}`).join('\n')
    : '  (the allowlist is empty — every payee will be refused until a person adds one in Settings)';
  return [
    '## The transfer batch — what to deliver',
    `This job composes a nómina. Besides RESULT.md, write ${NOMINA_FILE} at the working directory root, exactly this shape:`,
    '{ "paymentType": "PRV" | "REM" | "DIV" | "OTR",',
    '  "rows": [ { "rut": "<the payee\'s RUT, as 76123456-0>", "amount": <whole pesos>,',
    '              "invoice": "<factura or boleta number>", "purchaseOrder": "<orden de compra>",',
    '              "message": "<optional, 30 characters the payee sees>", "email": "<optional>" } ] }',
    '- PRV is suppliers, REM is payroll, DIV is dividends, OTR is anything else. For PRV the bank requires BOTH "invoice" and "purchaseOrder" on every row; for the others neither is asked for.',
    '- "amount" is whole pesos as a plain number — no thousands separators, no decimals, no currency symbol. CLP has no cents.',
    '- You say WHO is paid and HOW MUCH. You NEVER say where: no account number, no bank, no branch, no name on the account. Those come from the payee allowlist a person typed into Settings, and a row that tried to carry them would be ignored.',
    '- Every RUT must already be on that allowlist. It holds:',
    list,
    '- A payee the sheet names that is not on that list is not yours to add. Write the row anyway if the sheet says to pay them, and say so plainly in RESULT.md: review will refuse the whole batch and name them, and a person will add them or drop the line. Never substitute a payee who IS on the list, and never silently drop one.',
    '- Approve composes the file from what you wrote; you do not write the bank file yourself. Nobody is paid by any of this: the file is uploaded and authorised at the bank by hand.',
  ].join('\n');
}
