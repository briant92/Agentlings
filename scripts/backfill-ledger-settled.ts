import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Job } from '@agentlings/shared';
import {
  ledgerFile,
  priceAccepted,
  priceFor,
  readLedger,
  settleOutcome,
  type LedgerEntry,
} from '../server/src/ledger';
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
 * **`--write` moves no money.** `priceUsd` is untouched by the settling, here
 * and in the live seam.
 *
 * **`--price` does move money, and only because Brian said so** on
 * 2026-08-21 (D-206). It prices the rows that promoted before D-150 taught
 * the promote to pay for a cut leg, at `priceFor` — the same function the
 * live path uses, so there is one notion of what a row costs and not two
 * (D-030). Three carve-outs are the ledger's own standing rules rather than
 * this script's judgement, and they are why the figure is smaller than the
 * cost it came from:
 *
 * - **never above the quote** (D-012) — `priceFor` caps each row at its own
 *   `quotedUsd`, so an overrun stays absorbed;
 * - **a promise of free that fails stays free** (D-012) — a `toolFellBack`
 *   row was quoted nothing on the strength of a compiled tool, so it is
 *   never billed even though a session did the work;
 * - **a compile that was absorbed stays absorbed** (D-096) — tuition is the
 *   compile that did not land; one that lands prices like any session.
 *
 * `chainPriced` is set as the marker, exactly as `repriceChain` sets it: it
 * is what makes a second run price nothing twice.
 *
 * Dry by default. Either flag takes a .bak first.
 *
 *   npx tsx scripts/backfill-ledger-settled.ts
 *   npx tsx scripts/backfill-ledger-settled.ts --write
 *   npx tsx scripts/backfill-ledger-settled.ts --price
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const LEDGER = ledgerFile(ROOT);
const write = process.argv.includes('--write');
const doPrice = process.argv.includes('--price');

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

/**
 * Accepted, cost real money, never earned a price. `priceAccepted` applies
 * the carve-outs itself; this only has to find the candidates.
 */
const unpricedAccepted = rows.filter(
  (r) => jobs.get(r.jobId)?.job.status === 'promoted' && r.priceUsd === 0 && r.costUsd > 0 && !r.chainPriced,
);
if (unpricedAccepted.length > 0) {
  const billable = unpricedAccepted.filter((r) => !r.toolFellBack && !r.compile && !r.costUnknown);
  const would = billable.reduce((s, r) => s + priceFor('done', r.costUsd, r.quotedUsd), 0);
  const spent = unpricedAccepted.reduce((s, r) => s + r.costUsd, 0);
  console.log(`\naccepted but never priced         ${unpricedAccepted.length} rows, ${usd(spent)} spent`);
  console.log(`  chargeable under the standing rules            ${usd(would)} over ${billable.length} rows`);
  console.log(`  held back: overruns above quote, tool fall-backs (D-012), compiles (D-096)`);
}

if (doPrice) {
  copyFileSync(LEDGER, `${LEDGER}.pre-priced.bak`);
  const before = readLedger(ROOT).reduce((s: number, r: LedgerEntry) => s + r.priceUsd, 0);
  const { rows: n, chargedUsd } = priceAccepted(
    ROOT,
    unpricedAccepted.map((r) => r.jobId),
  );
  const after = readLedger(ROOT).reduce((s: number, r: LedgerEntry) => s + r.priceUsd, 0);
  console.log(`\npriced ${n} row(s), ${usd(chargedUsd)}. chargeable ${usd(before)} → ${usd(after)}.`);
  console.log(`previous ledger kept at ${LEDGER}.pre-priced.bak`);
  process.exit(0);
}

if (!write) {
  console.log('\ndry run — nothing written. Pass --write to settle the outcomes (no money moves),');
  console.log('or --price to charge the accepted-but-unpriced rows (D-206; moves money).');
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
