import type { ReconciliationAdjustment, ReconciliationSummary } from '@agentlings/shared';

/**
 * The reconciliation card's words (D-222), pure so every line can be pinned
 * without a DOM: the numbers are the server's recomputation, the card only
 * says them.
 */

/** 4240650 → "4,240,650"; 26745.5 → "26,745.50"; whole amounts stay whole. */
export function amountText(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "+ 242,150 in-transit — depósito 31/05" — the sign spelled, the kind beside it. */
export function adjustmentLine(a: ReconciliationAdjustment): string {
  const sign = a.amount < 0 ? '−' : '+';
  return `${sign} ${amountText(Math.abs(a.amount))} ${a.kind} — ${a.what}`;
}

/** The verdict, in one line the reviewer can act on. */
export function balanceWording(s: ReconciliationSummary): string {
  const unit = s.currency ? ` ${s.currency}` : '';
  if (s.balances) return `Balances — both sides meet at ${amountText(s.statement.adjusted)}${unit}`;
  return (
    `Does not balance — off by ${amountText(Math.abs(s.difference))}${unit} ` +
    `(statement ${amountText(s.statement.adjusted)} · records ${amountText(s.records.adjusted)}); ` +
    'approving is refused until the sides meet'
  );
}

/** "8 matched · 3 statement-only · 2 records-only · 2 entries proposed" */
export function countsLine(s: ReconciliationSummary): string {
  const c = s.counts;
  const parts = [
    `${c.matched} matched`,
    `${c.unmatchedStatement} statement-only`,
    `${c.unmatchedRecords} records-only`,
  ];
  if (c.entries > 0) parts.push(`${c.entries} ${c.entries === 1 ? 'entry' : 'entries'} proposed`);
  return parts.join(' · ');
}
