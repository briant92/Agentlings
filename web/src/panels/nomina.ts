import type { NominaCheck, NominaCheckRow, NominaPaymentType } from '@agentlings/shared';
import { amountText } from './reconcile';

/**
 * The transfer batch's card (D-268), pure so every line can be pinned without
 * a DOM. The figures are the server's — the card only says them, and says the
 * verdict the gate will actually apply rather than a second opinion about it.
 *
 * Amounts borrow `amountText` from the reconciliation card on purpose: two
 * spellings of money in one app is the duplication D-030 is about, and the
 * batch is not a special enough kind of number to earn its own.
 */

/** The bank's four codes, as a person reads them. */
export const PAYMENT_TYPE_LABELS: Record<NominaPaymentType, string> = {
  PRV: 'suppliers',
  REM: 'payroll',
  DIV: 'dividends',
  OTR: 'other',
};

/** "3 payees · 1,250,000 · payroll" — the header, read without opening anything. */
export function batchLine(check: NominaCheck): string {
  const n = check.rows.length;
  return [
    `${n} ${n === 1 ? 'payee' : 'payees'}`,
    amountText(check.total),
    PAYMENT_TYPE_LABELS[check.paymentType],
  ].join(' · ');
}

/** One payee: the name the allowlist holds, or the RUT and why it is not there. */
export function payeeLine(row: NominaCheckRow): string {
  const who = row.name ?? row.rut;
  const line = `${who} — ${amountText(row.amount)}`;
  return row.allowed ? line : `${line} · ${row.problem}`;
}

/**
 * The verdict, in one line the reviewer can act on.
 *
 * The approving half never says "pays" or "sends", because nothing here does
 * either: Approve writes a file, and the act is the token press at the bank
 * (D-219, D-251). A card that said "Approve pays 3 people" would be the app
 * claiming an authority this whole feature exists to refuse.
 */
export function verdictWording(check: NominaCheck): string {
  if (check.refusal) return check.refusal;
  const n = check.rows.length;
  return (
    `Every payee is on the allowlist — approving composes ${check.fileName} with ` +
    `${n} ${n === 1 ? 'line' : 'lines'}. Nobody is paid by that: upload it and authorise it at the bank.`
  );
}

/** How many payees are blocking, for the header's own summary. */
export function refusedCount(check: NominaCheck): number {
  return check.rows.filter((row) => !row.allowed).length;
}
