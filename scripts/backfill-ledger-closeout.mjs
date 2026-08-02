import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One-off: stamp `closeOutUsd` onto ledger rows written before D-039 was fixed.
 *
 * The field was set on the job meter and never copied into the row, so for 79
 * jobs `costPerTurn` divided session-plus-write-up across the session's own
 * turns and every rate came out high. Fixing the copy only helps runs from now
 * on, and a correct fix that ships inert is a failure mode this project has
 * already paid for — so the question is what existing data it must reach.
 *
 * It is recoverable, and **by identification rather than by guess**: the
 * persisted job records still hold `meter.closeOutUsd`, matched on `jobId`.
 * Rows whose job record is gone, or whose meter never carried the split, keep
 * nothing — `costPerTurn` reads a missing field as "all session", which is
 * exactly what those rows meant when they were written.
 *
 * Deliberately not inferred from an average. A typical close-out is 2–5c, and
 * stamping 3.5c onto rows that never recorded one would manufacture history
 * indistinguishable from the real thing — the mislabelling D-036 refused to
 * repeat when it retired its own backfill for the same reason.
 *
 *   node scripts/backfill-ledger-closeout.mjs [--write]
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const LEDGER = path.join(ROOT, 'ledger.jsonl');
const write = process.argv.includes('--write');

if (!existsSync(LEDGER)) {
  console.error(`no ledger at ${LEDGER}`);
  process.exit(1);
}

/** jobId → the write-up's cost, from every level's surviving job record. */
const splits = new Map();
const levelsDir = path.join(ROOT, 'levels');
for (const level of existsSync(levelsDir) ? readdirSync(levelsDir) : []) {
  const file = path.join(levelsDir, level, 'jobs.json');
  if (!existsSync(file)) continue;
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  for (const job of Array.isArray(parsed) ? parsed : (parsed.jobs ?? [])) {
    if (job.meter?.closeOutUsd) splits.set(job.id, job.meter.closeOutUsd);
  }
}

const lines = readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter(Boolean);
let stamped = 0;
let already = 0;
let unknown = 0;
let refused = 0;
let recovered = 0;

const out = lines.map((line) => {
  const row = JSON.parse(line);
  if (row.closeOutUsd !== undefined) {
    already++;
    return line;
  }
  const split = splits.get(row.jobId);
  if (split === undefined) {
    unknown++;
    return line;
  }
  // The write-up is part of the total by construction, so a split at or above
  // it means the two records disagree. Refuse rather than reconcile: a negative
  // session cost would quietly drag a rate toward zero.
  if (split >= row.costUsd) {
    refused++;
    return line;
  }
  stamped++;
  recovered += split;
  return JSON.stringify({ ...row, closeOutUsd: split });
});

console.log(
  `${lines.length} rows: ${stamped} to stamp, ${already} already split, ${unknown} with no surviving split, ${refused} refused as inconsistent`,
);
if (stamped > 0) {
  console.log(
    `recovering ${(100 * recovered).toFixed(1)}c of write-up cost, mean ${(100 * (recovered / stamped)).toFixed(2)}c a job`,
  );
}

if (!write) {
  console.log('dry run — pass --write to apply');
} else {
  copyFileSync(LEDGER, `${LEDGER}.bak`);
  writeFileSync(LEDGER, `${out.join('\n')}\n`);
  console.log(`written; previous ledger kept at ${path.basename(LEDGER)}.bak`);
}
