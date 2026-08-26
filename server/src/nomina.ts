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
 * Which column each value is, by name.
 *
 * Every bound in this file is read through here rather than restated. Review
 * caught the maxima written out again in `payeeProblem` and a third time in
 * the charge-account route: four literals that a second bank's table would
 * have had to change in four places, and that could disagree in three.
 * A layout is now the only place a column's size is written down.
 */
export const COLUMN = {
  chargeAccount: 0,
  account: 1,
  bank: 2,
  rutBody: 3,
  checkDigit: 4,
  name: 5,
  amount: 6,
  invoice: 7,
  purchaseOrder: 8,
  paymentType: 9,
  message: 10,
  email: 11,
  accountLabel: 12,
} as const;

/** One column of a layout, by name — the only way a bound is read. */
export function column(layout: NominaLayout, of: keyof typeof COLUMN): NominaColumn {
  // Non-null by construction: every layout declares all thirteen, and the
  // proof asserts the count against the specification's own table.
  return layout.columns[COLUMN[of]]!;
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

/**
 * Whether the run wrote the output file itself — which it may not.
 *
 * `nomina.txt` is the app's name for the file Approve composes from an
 * approved batch. A run that writes it directly would be handing a person a
 * bank file carrying coordinates *it* chose, through no allowlist and no
 * gate, and the person would have no way to tell it apart from the real one.
 * So the name is reserved, and a run using it is a refusal rather than a
 * silent overwrite: refusing names the problem, and deleting the run's work
 * would hide it.
 *
 * Asked at the completion seam, where the only thing that can have written
 * that name is the run — Approve has not happened yet.
 */
export function runWroteOutput(dir: string): boolean {
  return existsSync(path.join(dir, NOMINA_OUTPUT));
}

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
    // Safe, not merely integral. `Number.isInteger` is true above 2^53, where
    // the figure has already been rounded by the parse and is still short of
    // the column's sixteen digits — so a batch could carry a number that is
    // not the number anybody wrote, and pass every other check.
    if (!Number.isSafeInteger(raw.amount)) {
      return {
        error: `${n}: "amount" is too large to be written down exactly — no real payment is this size`,
      };
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
/**
 * One declared row, the verdict on it, and the payee it resolved to.
 *
 * Internal, and deliberately not the shared type: the resolved payee carries
 * an account number, and a review card has no use for one. The card gets
 * `NominaCheckRow`, which is a name and a verdict.
 *
 * This exists because the allowlist lookup was written twice — once to judge
 * and once to compose — and the second copy then re-derived what the first
 * had already resolved, behind two non-null assertions. One resolution now,
 * and the assertions are gone with it.
 */
interface ResolvedRow {
  declared: NominaRow;
  row: NominaCheckRow;
  payee?: WirePayee;
}

function resolveRows(nomina: Nomina, wire: WireSettings): ResolvedRow[] {
  const byRut = new Map<string, WirePayee>();
  for (const payee of wire.payees) {
    const key = rutKey(payee.rut);
    if (key) byRut.set(key, payee);
  }
  return nomina.rows.map((declared) => {
    const key = rutKey(declared.rut);
    if (!key) {
      return {
        declared,
        row: {
          rut: declared.rut,
          amount: declared.amount,
          name: null,
          allowed: false,
          problem: 'not a RUT, or its verifying digit does not match its number',
        },
      };
    }
    const payee = byRut.get(key);
    if (!payee) {
      return {
        declared,
        row: {
          rut: key,
          amount: declared.amount,
          name: null,
          allowed: false,
          problem: 'not on the payee allowlist',
        },
      };
    }
    return {
      declared,
      row: { rut: key, amount: declared.amount, name: payee.name, allowed: true },
      payee,
    };
  });
}

export function nominaCheck(nomina: Nomina, wire: WireSettings): NominaCheck {
  const resolved = resolveRows(nomina, wire);
  const rows = resolved.map((r) => r.row);
  return {
    paymentType: nomina.paymentType,
    rows,
    total: rows.reduce((sum, row) => sum + row.amount, 0),
    refusal: refusalFor(resolved, nomina, wire),
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
function refusalFor(
  resolved: ResolvedRow[],
  nomina: Nomina,
  wire: WireSettings,
): string | null {
  const problems: string[] = [];
  if (!wire.chargeAccount.trim()) {
    problems.push(
      'no charge account is set — the account this batch debits, in Settings under the payee allowlist',
    );
  }
  const refused = resolved.filter((r) => !r.row.allowed);
  if (refused.length > 0) {
    const named = refused.map((r) => `${r.row.rut} (${r.row.problem})`).join('; ');
    problems.push(
      `${refused.length} of ${resolved.length} ${refused.length === 1 ? 'payee is' : 'payees are'} not approved to be paid: ${named} — ` +
        'add them in Settings under the payee allowlist, or have the run drop the line',
    );
  }
  // Everything the layout itself would refuse, asked HERE rather than only
  // where the bytes are written. Review caught that a 46-character name or a
  // `;` inside one surfaced only in `composeNomina`, which runs after the
  // outbox has already been sent — so Approve could answer 400 with messages
  // gone, which is exactly what the outbox block forbids ("a refused send
  // must leave nothing half-promoted"). The gate is now the whole question.
  if (problems.length === 0) problems.push(...layoutProblems(resolved, nomina, wire));
  if (problems.length === 0) return null;
  return `${problems.join('. ')}. Nothing was composed — a nómina is uploaded whole, so it is refused whole.`;
}

/**
 * What the bank's own format would refuse about this batch, line by line.
 *
 * Asked only once every payee is approved, because a column bound on a row
 * whose payee is a stranger is the second-most-interesting thing about it.
 */
function layoutProblems(
  resolved: ResolvedRow[],
  nomina: Nomina,
  wire: WireSettings,
): string[] {
  const layout = nominaLayout(wire.format);
  const problems: string[] = [];
  for (const [i, r] of resolved.entries()) {
    if (!r.payee) continue;
    for (const [c, value] of lineValues(r, nomina, wire).entries()) {
      const col = layout.columns[c];
      if (!col) continue;
      const problem = columnProblem(value, col, layout);
      if (problem) problems.push(`row ${i + 1}, ${col.label}: ${problem}`);
    }
  }
  return problems;
}

/**
 * One line's thirteen values, in the layout's order — the single place the
 * mapping from "what we know" to "which column" is written. Both the gate and
 * the composer read it, so they can never disagree about what would be
 * written.
 */
function lineValues(r: ResolvedRow, nomina: Nomina, wire: WireSettings): string[] {
  const split = normaliseRut(r.declared.rut);
  const values: string[] = [];
  values[COLUMN.chargeAccount] = wire.chargeAccount.trim();
  values[COLUMN.account] = r.payee?.account.trim() ?? '';
  values[COLUMN.bank] = r.payee?.bank.trim() ?? '';
  values[COLUMN.rutBody] = split?.body ?? '';
  values[COLUMN.checkDigit] = split?.dv ?? '';
  values[COLUMN.name] = r.payee?.name.trim() ?? '';
  values[COLUMN.amount] = String(r.declared.amount);
  values[COLUMN.invoice] = r.declared.invoice ?? '';
  values[COLUMN.purchaseOrder] = r.declared.purchaseOrder ?? '';
  values[COLUMN.paymentType] = nomina.paymentType;
  values[COLUMN.message] = r.declared.message ?? '';
  values[COLUMN.email] = r.declared.email ?? '';
  values[COLUMN.accountLabel] = r.payee?.accountLabel?.trim() ?? '';
  return values;
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
  const lines = resolveRows(nomina, wire).map((r) =>
    lineValues(r, nomina, wire).join(layout.delimiter),
  );
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
export function columnProblem(
  value: string,
  column: NominaColumn,
  layout: NominaLayout,
): string | null {
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
export function payeeProblem(payee: unknown, layout: NominaLayout = BCI_LAYOUT): string | null {
  if (!isRecord(payee)) return 'a payee is a RUT, a name, a bank code and an account number';
  const rut = typeof payee.rut === 'string' ? normaliseRut(payee.rut) : null;
  if (!rut) {
    return 'that is not a RUT — write it with its verifying digit after a dash, as 76123456-0, and check the digit matches the number';
  }
  const name = typeof payee.name === 'string' ? payee.name.trim() : '';
  if (!name) return 'a payee needs a name — it goes on the file as Nombre Beneficiario';
  if (typeof payee.bank !== 'string' || !payee.bank.trim()) {
    return "a payee needs their bank's own code, as 016 — the code, not the bank's name";
  }
  if (typeof payee.account !== 'string' || !payee.account.trim()) {
    return 'a payee needs an account number — the bank routes the money by it';
  }
  const label = payee.accountLabel;
  if (label !== undefined && label !== null && typeof label !== 'string') {
    return 'the enrolled-account name must be text';
  }
  /**
   * Every field the payee contributes, put through the layout's own rules —
   * rather than three regexes restating maxima the table already gives.
   *
   * Review caught this comment claiming more than the code did: a payee named
   * `Norte;Sur`, or 46 characters long, was stored happily and refused only
   * at Approve, which is the exact failure the comment says cannot happen.
   * The bank's own words are used for the column, so what the form refuses
   * and what the file refuses are one rule.
   *
   * The account is *Alfanumérico* in the specification, not numeric — the
   * first version demanded digits and would have refused an account the bank
   * itself accepts. Being stricter than the bank is not a safety property.
   */
  for (const [field, of] of [
    ['name', 'name'],
    ['bank', 'bank'],
    ['account', 'account'],
    ['accountLabel', 'accountLabel'],
  ] as const) {
    const value = typeof payee[field] === 'string' ? (payee[field] as string).trim() : '';
    const problem = columnProblem(value, column(layout, of), layout);
    if (problem) return `${column(layout, of).label}: ${problem}`;
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
