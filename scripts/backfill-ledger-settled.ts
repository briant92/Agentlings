import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Job } from '@agentlings/shared';
import { ledgerFile, readLedger, settleOutcome, type LedgerEntry } from '../server/src/ledger';
import { listLevelDirs, readMeta } from '../server/src/levels';
import { readStoredJobs } from '../server/src/queue';

/**
 * One-off: rows that call accepted work a failure (D-205).
 *
 * A run cut at the turn wall files `failed` — that is what the executor saw —
 * and the review then promotes it. Since D-150 the promote also prices it, so
 * the row ends up saying *the work failed* and *you were charged $3.53 for
 * it*, in the same line. `settleOutcome` now settles that at the promote seam;
 * this settles the rows written before it existed.
 *
 * By identification, never by guess, on two markers that are both records of
 * a decision rather than inferences from cost, turns or wording:
 *
 * - the job store records the job as **`promoted`** — the user's own verdict;
 * - or the row carries **`chainPriced`**, which only `repriceChain` writes,
 *   and only when a promote paid for that leg. D-150's reasoning is explicit
 *   that such a leg landed ("work that fed an approved delivery finished by
 *   any honest reading"), and it is what the live seam settles too: the
 *   promote hands `settleOutcome` the whole cut ancestry, not just the end.
 *   Leaving these out was this script's own first miss — nine rows that said
 *   `failed` while carrying a price the ledger had already charged.
 *
 * **This moves no money.** `priceUsd` is not touched, here or in the live
 * seam. Rows that are unpriced stay unpriced — including the ones below that
 * promoted before D-150 and so never earned their price. Those are reported
 * as a separate figure precisely because charging for them is a decision
 * about money rather than a correction of a falsehood, and it is not this
 * script's to take.
 *
 * Dry by default. Pass --write to apply, which takes a .bak first.
 *
 *   npx tsx scripts/backfill-ledger-settled.ts
 *   npx tsx scripts/backfill-ledger-settled.ts --write
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const LEDGER = ledgerFile(ROOT);
const write = process.argv.includes('--write');

if (!existsSync(LEDGER)) {
  console.error(`no ledger at ${LEDGER}`);
  process.exit(1);
}

const jobs = new Map<string, { job: Job; levelId: string }>();
for (const dir of listLevelDirs(ROOT)) {
  const levelId = readMeta(dir).id;
  for (const job of readStoredJobs(dir)) jobs.set(job.id, { job, levelId });
}

const rows = readLedger(ROOT);
const accepted = (r: LedgerEntry) =>
  jobs.get(r.jobId)?.job.status === 'promoted' || r.chainPriced === true;
const lying = rows.filter((r) => r.outcome === 'failed' && accepted(r));
const priced = lying.filter((r) => r.priceUsd > 0);
/** Promoted, cost real money, and never earned a price — the pre-D-150 residue. */
const unpaid = lying.filter((r) => r.priceUsd === 0 && r.costUsd > 0);
const nothingToBill = lying.filter((r) => r.priceUsd === 0 && r.costUsd === 0);

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`ledger rows                       ${rows.length}`);
console.log(`promoted, but the row says failed ${lying.length}`);
console.log(`  already priced (the row contradicts itself)  ${priced.length}  ${usd(priced.reduce((s, r) => s + r.priceUsd, 0))}`);
console.log(`  free runs, nothing to bill                   ${nothingToBill.length}`);
console.log(`  spent real money and never priced            ${unpaid.length}  ${usd(unpaid.reduce((s, r) => s + r.costUsd, 0))} absorbed`);

if (unpaid.length > 0) {
  const last = unpaid.reduce((a, r) => Math.max(a, r.at), 0);
  console.log(
    `\nThe unpriced ones all promoted on or before ${new Date(last).toISOString().slice(0, 10)},` +
      ' before D-150 taught the promote to price a cut leg. Whether to charge them now is a',
  );
  console.log('decision about money, not a correction — this script does not take it.');
  for (const r of unpaid.slice(0, 6)) {
    console.log(`  ${r.jobId}  ${r.levelId.padEnd(16)} ${usd(r.costUsd)}  quoted ${r.quotedUsd ? usd(r.quotedUsd) : '—'}`);
  }
  if (unpaid.length > 6) console.log(`  …and ${unpaid.length - 6} more`);
}

if (!write) {
  console.log('\ndry run — nothing written. Pass --write to settle the outcomes (no money moves).');
  process.exit(0);
}

copyFileSync(LEDGER, `${LEDGER}.pre-settled.bak`);
const before = readLedger(ROOT).reduce((s: number, r: LedgerEntry) => s + r.priceUsd, 0);
const { rows: settled } = settleOutcome(
  ROOT,
  lying.map((r) => r.jobId),
);
const after = readLedger(ROOT).reduce((s: number, r: LedgerEntry) => s + r.priceUsd, 0);
console.log(`\nsettled ${settled} row(s). chargeable ${usd(before)} → ${usd(after)} (must be unchanged).`);
console.log(`previous ledger kept at ${LEDGER}.pre-settled.bak`);
