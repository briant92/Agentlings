import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  MAX_RECONCILIATION_ADJUSTMENTS,
  MAX_RECONCILIATION_ENTRIES,
  MAX_RECONCILIATION_MATCHES,
  MAX_RECONCILIATION_TEXT_CHARS,
  MAX_RECONCILIATION_UNMATCHED,
  RECONCILIATION_TOLERANCE,
  type Job,
  type Reconciliation,
  type ReconciliationAdjustment,
  type ReconciliationEntry,
  type ReconciliationMatch,
  type ReconciliationRollForward,
  type ReconciliationSide,
  type ReconciliationSummary,
  type ReconciliationUnmatched,
} from '@agentlings/shared';
import { inputShapeOf, sameInputShape } from './inputshape';

/**
 * The reconciliation contract (D-222): what a run asked to reconcile one
 * record of money against another is told to deliver, how the server checks
 * it, and what Approve refuses.
 *
 * D-220 measured five runs of one sentence over three kinds of file pair.
 * Every one matched in a kept script and read its residue sensibly; only one
 * wrote an equation, and none wrote the two-sided statement a reconciliation
 * *is* — two balances, each adjusted by what the other side has and it does
 * not, meeting at one number. The method transfers on its own; the invariant
 * has to be asked for. So the brief asks, as a file with a shape, the way the
 * outbox and the withheld declaration are asked for; the queue stamps a
 * summary the server computed from the run's adjustments — never the file's
 * own claim of a balance — and Approve is refused by name when the two sides
 * do not meet. The job stays reviewable; the fix is the run's, on a reply.
 *
 * What this checks is the arithmetic the run declared, not that every line
 * was matched rightly: a run that calls a cheque "in transit" when it was
 * "outstanding" balances just the same. That is the reviewer's reading, and
 * the card says so in the same breath as the verdict.
 */

export const RECONCILIATION_FILE = 'RECONCILIATION.json';

/**
 * Whether the sentence asks to reconcile, in either language the desk hears —
 * word-bounded, so "reconnect" and "la cuadra" do not fire. Deterministic and
 * free, like every intake fact (D-011); a missed sentence costs the contract
 * section, a wrong one costs a dozen lines of brief the run can ignore.
 */
const ASKS_TO_RECONCILE = /\b(reconcil\w*|concilia\w*|cuadr(?:ar|e)s?)\b/i;

export function wantsReconciliation(text: string): boolean {
  return ASKS_TO_RECONCILE.test(text);
}

export type ReconciliationRead =
  | { reconciliation: Reconciliation; error?: undefined }
  | { reconciliation?: undefined; error: string };

/** Parses RECONCILIATION.json from a sandbox: null when absent, the reason when invalid. */
export function readReconciliation(dir: string): ReconciliationRead | null {
  const file = path.join(dir, RECONCILIATION_FILE);
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { error: 'not valid JSON' };
  }
  return checkReconciliation(parsed);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A required one-line string, trimmed and bounded; the error names the field. */
function text(value: unknown, field: string): string | { error: string } {
  if (typeof value !== 'string' || value.trim() === '') {
    return { error: `${field} must be a non-empty string` };
  }
  if (value.length > MAX_RECONCILIATION_TEXT_CHARS) {
    return { error: `${field} is over ${MAX_RECONCILIATION_TEXT_CHARS} characters` };
  }
  return value.trim();
}

/**
 * An optional one-line string. Absent stays absent, and so does an empty one:
 * the first contract-carrying run wrote `"ref": ""` to mean *none* and was
 * refused at parse for it — an honest spelling of "nothing here" is not a
 * malformed file. Present and non-empty, it must still be a bounded string.
 */
function optionalText(value: unknown, field: string): string | undefined | { error: string } {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return text(value, field);
}

/** A finite number — the one shape money takes in this file. */
function money(value: unknown, field: string): number | { error: string } {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { error: `${field} must be a plain number` };
  }
  return value;
}

const failed = (v: unknown): v is { error: string } => isRecord(v) && typeof v.error === 'string';

function side(value: unknown, name: string): ReconciliationSide | { error: string } {
  if (!isRecord(value)) return { error: `"${name}" must be an object with "label" and "closing"` };
  const label = text(value.label, `${name}.label`);
  if (failed(label)) return label;
  const closing = money(value.closing, `${name}.closing`);
  if (failed(closing)) return closing;
  return { label, closing };
}

/**
 * The contract, over an already-parsed value. Strict, and every refusal names
 * its reason: this file decides whether a reconciliation is approved, so a
 * malformed one reading as "nothing to check" would turn the gate off exactly
 * where it was asked for — WITHHELD's rule (D-181), applied to money.
 */
export function checkReconciliation(parsed: unknown): ReconciliationRead {
  if (!isRecord(parsed)) return { error: 'not an object' };
  const statement = side(parsed.statement, 'statement');
  if (failed(statement)) return statement;
  const records = side(parsed.records, 'records');
  if (failed(records)) return records;
  for (const field of ['period', 'currency', 'note'] as const) {
    const got = optionalText(parsed[field], field);
    if (failed(got)) return got;
  }

  if (!Array.isArray(parsed.adjustments)) {
    return { error: '"adjustments" must be an array (empty when the two closings already meet)' };
  }
  if (parsed.adjustments.length > MAX_RECONCILIATION_ADJUSTMENTS) {
    return { error: `${parsed.adjustments.length} adjustments — the cap is ${MAX_RECONCILIATION_ADJUSTMENTS}` };
  }
  const adjustments: ReconciliationAdjustment[] = [];
  for (const [i, raw] of parsed.adjustments.entries()) {
    const n = `adjustment ${i + 1}`;
    if (!isRecord(raw)) return { error: `${n} is not an object` };
    if (raw.side !== 'statement' && raw.side !== 'records') {
      return { error: `${n}: "side" must be "statement" or "records"` };
    }
    const kind = text(raw.kind, `${n}: "kind"`);
    if (failed(kind)) return kind;
    const amount = money(raw.amount, `${n}: "amount"`);
    if (failed(amount)) return amount;
    if (amount === 0) return { error: `${n}: an amount of 0 adjusts nothing` };
    const what = text(raw.what, `${n}: "what"`);
    if (failed(what)) return what;
    const ref = optionalText(raw.ref, `${n}: "ref"`);
    if (failed(ref)) return ref;
    adjustments.push({ side: raw.side, kind, amount, what, ...(ref ? { ref } : {}) });
  }

  if (!Array.isArray(parsed.matched)) return { error: '"matched" must be an array' };
  if (parsed.matched.length > MAX_RECONCILIATION_MATCHES) {
    return { error: `${parsed.matched.length} matched pairs — the cap is ${MAX_RECONCILIATION_MATCHES}` };
  }
  const matched: ReconciliationMatch[] = [];
  for (const [i, raw] of parsed.matched.entries()) {
    const n = `matched ${i + 1}`;
    if (!isRecord(raw)) return { error: `${n} is not an object` };
    const stmt = text(raw.statement, `${n}: "statement"`);
    if (failed(stmt)) return stmt;
    // One record may be spelled as the ref itself rather than a list of
    // one: the first post-roll-forward run wrote `"records": "DEP"` on all
    // thirteen one-to-one matches and was refused at parse — the `""`
    // leniency's twin, for the other honest spelling.
    const records = typeof raw.records === 'string' ? [raw.records] : raw.records;
    if (!Array.isArray(records) || records.length === 0) {
      return { error: `${n}: "records" must be a non-empty array of record refs` };
    }
    const refs: string[] = [];
    for (const r of records) {
      const ref = text(r, `${n}: a record ref`);
      if (failed(ref)) return ref;
      refs.push(ref);
    }
    const amount = money(raw.amount, `${n}: "amount"`);
    if (failed(amount)) return amount;
    const date = optionalText(raw.date, `${n}: "date"`);
    if (failed(date)) return date;
    matched.push({ statement: stmt, records: refs, amount, ...(date ? { date } : {}) });
  }

  if (!isRecord(parsed.unmatched)) {
    return { error: '"unmatched" must be an object with "statement" and "records" arrays' };
  }
  const unmatched = { statement: [] as ReconciliationUnmatched[], records: [] as ReconciliationUnmatched[] };
  for (const which of ['statement', 'records'] as const) {
    const list = parsed.unmatched[which];
    if (!Array.isArray(list)) return { error: `"unmatched.${which}" must be an array` };
    if (list.length > MAX_RECONCILIATION_UNMATCHED) {
      return { error: `${list.length} unmatched ${which} lines — the cap is ${MAX_RECONCILIATION_UNMATCHED}` };
    }
    for (const [i, raw] of list.entries()) {
      const n = `unmatched.${which} ${i + 1}`;
      if (!isRecord(raw)) return { error: `${n} is not an object` };
      // Optional: the second contract-carrying US run wrote "" for a deposit
      // line's ref — it has none — and was refused at parse for it.
      const ref = optionalText(raw.ref, `${n}: "ref"`);
      if (failed(ref)) return ref;
      const amount = money(raw.amount, `${n}: "amount"`);
      if (failed(amount)) return amount;
      const what = text(raw.what, `${n}: "what"`);
      if (failed(what)) return what;
      const category = text(raw.category, `${n}: "category"`);
      if (failed(category)) return category;
      const date = optionalText(raw.date, `${n}: "date"`);
      if (failed(date)) return date;
      unmatched[which].push({ ...(ref ? { ref } : {}), amount, what, category, ...(date ? { date } : {}) });
    }
  }

  const entries: ReconciliationEntry[] = [];
  if (parsed.entries !== undefined) {
    if (!Array.isArray(parsed.entries)) return { error: '"entries" must be an array when present' };
    if (parsed.entries.length > MAX_RECONCILIATION_ENTRIES) {
      return { error: `${parsed.entries.length} entries — the cap is ${MAX_RECONCILIATION_ENTRIES}` };
    }
    for (const [i, raw] of parsed.entries.entries()) {
      const n = `entry ${i + 1}`;
      if (!isRecord(raw)) return { error: `${n} is not an object` };
      const debit = text(raw.debit, `${n}: "debit"`);
      if (failed(debit)) return debit;
      const credit = text(raw.credit, `${n}: "credit"`);
      if (failed(credit)) return credit;
      const amount = money(raw.amount, `${n}: "amount"`);
      if (failed(amount)) return amount;
      if (amount <= 0) return { error: `${n}: "amount" must be positive — the sides say which way it goes` };
      const memo = optionalText(raw.memo, `${n}: "memo"`);
      if (failed(memo)) return memo;
      entries.push({ debit, credit, amount, ...(memo ? { memo } : {}) });
    }
  }

  const period = optionalText(parsed.period, 'period') as string | undefined;
  const currency = optionalText(parsed.currency, 'currency') as string | undefined;
  const note = optionalText(parsed.note, 'note') as string | undefined;
  return {
    reconciliation: {
      ...(period ? { period } : {}),
      ...(currency ? { currency } : {}),
      statement,
      records,
      adjustments,
      matched,
      unmatched,
      entries,
      ...(note ? { note } : {}),
    },
  };
}

/** Money arithmetic in cents, so 0.1 + 0.2 does not unbalance a statement. */
const cents = (n: number): number => Math.round(n * 100);
const fromCents = (c: number): number => c / 100;

/**
 * What the server says the file says: both sides adjusted by the run's own
 * adjustments, recomputed here and never read off the file, and whether they
 * meet. The summary rides the job so the card and the gate read one truth
 * (D-030), and it carries the adjustments themselves because they are what
 * the reviewer reads beside each balance.
 */
export function summariseReconciliation(rec: Reconciliation): ReconciliationSummary {
  const sum = (which: 'statement' | 'records'): number =>
    rec.adjustments.filter((a) => a.side === which).reduce((acc, a) => acc + cents(a.amount), 0);
  const statementAdjusted = fromCents(cents(rec.statement.closing) + sum('statement'));
  const recordsAdjusted = fromCents(cents(rec.records.closing) + sum('records'));
  const difference = fromCents(cents(statementAdjusted) - cents(recordsAdjusted));
  return {
    ...(rec.period ? { period: rec.period } : {}),
    ...(rec.currency ? { currency: rec.currency } : {}),
    statement: { label: rec.statement.label, closing: rec.statement.closing, adjusted: statementAdjusted },
    records: { label: rec.records.label, closing: rec.records.closing, adjusted: recordsAdjusted },
    adjustments: rec.adjustments,
    difference,
    balances: Math.abs(difference) < RECONCILIATION_TOLERANCE,
    counts: {
      matched: rec.matched.length,
      unmatchedStatement: rec.unmatched.statement.length,
      unmatchedRecords: rec.unmatched.records.length,
      adjustments: rec.adjustments.length,
      entries: rec.entries.length,
    },
  };
}

const plain = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * Why a reconciled job may not be approved right now, or null when it may.
 * A declaration that did not parse blocks too — reading it as "nothing to
 * check" would turn the gate off where it was asked for.
 */
export function reconciliationRefusal(
  job: Pick<Job, 'reconciliation' | 'reconciliationError'>,
): string | null {
  if (job.reconciliationError) {
    return `not reconciled — ${job.reconciliationError}. Reply to the job to have it written properly; nothing was kept.`;
  }
  const r = job.reconciliation;
  if (!r || r.balances) return null;
  const unit = r.currency ? ` ${r.currency}` : '';
  return (
    `not reconciled — the two sides differ by ${plain(Math.abs(r.difference))}${unit} ` +
    `(statement ${plain(r.statement.adjusted)} against records ${plain(r.records.adjusted)}). ` +
    'Approving is refused until they meet; reply to the job with what is missing.'
  );
}

/** Where a level banks its approved reconciliations (D-223, decision 5). */
export const RECONCILIATIONS_DIR = 'reconciliations';
/** The prior state, copied into the sandbox for the run to read (D-223). */
export const PRIOR_RECONCILIATION_FILE = 'PRIOR-RECONCILIATION.json';

/**
 * Bank an approved reconciliation as the level's roll-forward state (D-223).
 * At Approve only — a clear writes nothing (D-216), and a discard is a
 * verdict on the run, not on the account. One file per approved job, the
 * stamped summary verbatim: the statement-side items are what should clear
 * next period, and the records-side items stay visible because the books
 * still owed entries for them. The balanced check is the gate's own,
 * repeated here so no caller can bank a state the gate would have refused.
 */
export function writeRollForward(
  levelDir: string,
  job: Pick<Job, 'id' | 'attachments' | 'reconciliation'>,
  now = Date.now(),
): void {
  if (!job.reconciliation?.balances) return;
  const dir = path.join(levelDir, RECONCILIATIONS_DIR);
  mkdirSync(dir, { recursive: true });
  const shape = inputShapeOf(job.attachments);
  const state: ReconciliationRollForward = {
    jobId: job.id,
    approvedAt: now,
    ...(shape ? { inputShape: shape } : {}),
    reconciliation: job.reconciliation,
  };
  writeFileSync(path.join(dir, `${job.id}.json`), `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * The newest approved reconciliation of this shape, or nothing. Shape is the
 * key (D-221): the same export carries the same header, so in a level that
 * mixes accounts the CLP cartola's state can never ride a USD run. A state
 * banked without a shape is unknown provenance and serves only a shapeless
 * job — the recipe rule, reused. A file that does not parse loses itself,
 * never the feature.
 */
export function latestRollForward(
  levelDir: string,
  shapes?: string[],
): ReconciliationRollForward | undefined {
  const dir = path.join(levelDir, RECONCILIATIONS_DIR);
  if (!existsSync(dir)) return undefined;
  let latest: ReconciliationRollForward | undefined;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      continue;
    }
    const rf = parsed as ReconciliationRollForward;
    if (typeof rf?.jobId !== 'string' || typeof rf?.approvedAt !== 'number') continue;
    if (rf.reconciliation?.balances !== true) continue;
    if (!sameInputShape(rf.inputShape, shapes)) continue;
    if (!latest || rf.approvedAt > latest.approvedAt) latest = rf;
  }
  return latest;
}

/**
 * The contract, told to the session (D-222). Told because a capability nobody
 * is told about is not one (D-031): without this section a run writes a fine
 * report with a raw difference and no statement, which is what every D-220
 * run did. Compact on purpose — every line rides every turn.
 *
 * With a prior state in hand (D-223) the section grows three lines naming
 * PRIOR-RECONCILIATION.json — the file itself rides in the sandbox, so the
 * brief carries the pointer and the one number, never two hundred items.
 */
export function reconciliationBrief(prior?: ReconciliationRollForward): string {
  const rollForward = prior
    ? [
        `- ${PRIOR_RECONCILIATION_FILE} at the working directory root is the last approved reconciliation of files of this same shape${prior.reconciliation.period ? ` (${prior.reconciliation.period})` : ''}: both sides met at ${plain(prior.reconciliation.statement.adjusted)}${prior.reconciliation.currency ? ` ${prior.reconciliation.currency}` : ''}. Its adjustments were the items open then — a third input to your matching script, not a note.`,
        "- A prior statement-side item (a deposit in transit, an outstanding cheque) is looked for in this period's STATEMENT: found, by ref or amount, it has cleared; absent, it is still outstanding — carry it again on the statement side. A prior records-side item (a fee, interest, a returned cheque, an error, a note) is looked for in this period's RECORDS: found, it is booked and settled; absent, it is still unbooked — carry it again on the records side, same sign.",
        '- A line matched to a prior item is matched, not unmatched, and adjusts nothing. A carried item says its age in "what". Never adjust an item this period\'s own files already carry.',
      ]
    : [];
  return [
    '## Reconciliation — what to deliver',
    `This job reconciles one record of money against another. Besides RESULT.md, write ${RECONCILIATION_FILE} at the working directory root, exactly this shape (the values are placeholders — take period, currency and every number from the files):`,
    '{ "period": "<as the files say>", "currency": "<as the files say>",',
    '  "statement": { "label": "<the bank\'s side — the statement or cartola file>", "closing": <number> },',
    '  "records":   { "label": "<the other side — a ledger, a register of invoices, your own list>", "closing": <number> },',
    '  "adjustments": [ { "side": "statement" | "records", "kind": "in-transit" | "outstanding" | "fee" | "interest" | "returned" | "error" | "other", "amount": <signed: + adds to that side, - subtracts>, "what": "<one line>", "ref": "<optional — leave the field out when there is none>" } ],',
    '  "matched":   [ { "statement": "<statement line ref>", "records": ["<record ref>"], "amount": <number>, "date": "<optional>" } ],',
    '  "unmatched": { "statement": [ { "ref": "<optional>", "date": "<optional>", "amount": <number>, "what": "<one line>", "category": "<category>" } ], "records": [ ...the same shape ] },',
    '  "entries":   [ { "debit": "<account>", "credit": "<account>", "amount": <number>, "memo": "<optional>" } ] }',
    '- An adjustment goes on the side that does NOT yet have the item, so that side catches up: a deposit the records show and the bank has not yet credited is in-transit on the statement side (+); a cheque or transfer the records show and the bank has not yet paid is outstanding on the statement side (-); a fee or a returned cheque the bank shows and the records have not booked goes on the records side (-); interest the bank credited goes on the records side (+); a recording error goes on the side whose figure is wrong, signed so that side\'s balance becomes what it should have been (a cheque booked at 5,483 that the bank paid at 5,843 is -360 on the records side).',
    '- Adjusted balances must then be equal: statement.closing plus its adjustments equals records.closing plus its adjustments. Review recomputes both from "adjustments" alone — an unmatched line is a finding, an adjustment is what moves a balance, and every unmatched line that explains the difference must appear in both. It refuses to approve when the sides differ. Never add a plug or an "unexplained" adjustment to force them to meet: if they do not, leave them apart, write the file anyway, and say in RESULT.md what is unexplained and on which side.',
    '- Match in a script you keep beside the result — amount first, then a date window, then reference (folio, cheque number, RUT, payee) — and list every unmatched line on each side with its category: in-transit, outstanding, fee, interest, returned, error, open-invoice, out-of-scope, unexplained.',
    '- "entries" are the entries the records side needs for items only the statement has; leave it empty when the records are not books.',
    '- Numbers are plain numbers — no thousands separators, a dot for decimals, none for a currency without them. Leave an optional field out rather than writing an empty string.',
    ...rollForward,
  ].join('\n');
}
