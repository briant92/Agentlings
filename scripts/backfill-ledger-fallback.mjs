import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One-off: stamp `toolFellBack` onto ledger rows written before the field
 * existed.
 *
 * It was set on the job meter and never copied into the row, so the ledger
 * could not answer how often a compiled tool claims work it cannot finish —
 * the question that decides whether the fourth tier earns its keep. The two
 * fall-backs on record could only be found by opening job files.
 *
 * Recovered **by identification**, as D-039's was: the persisted job records
 * still hold `meter.toolFellBack`, matched on `jobId`. Nothing is inferred.
 * A row whose job record is gone keeps nothing, which is the honest answer —
 * "no flag" already means "not known to have fallen back".
 *
 * The absorbed total does not depend on this. It is computed from a price of
 * zero against a real cost, so those rows were already counted correctly the
 * moment that changed; this is about being able to ask the question.
 *
 *   node scripts/backfill-ledger-fallback.mjs [--write]
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const LEDGER = path.join(ROOT, 'ledger.jsonl');
const write = process.argv.includes('--write');

if (!existsSync(LEDGER)) {
  console.error(`no ledger at ${LEDGER}`);
  process.exit(1);
}

/** jobId → whether a tool claimed it and could not finish. */
const fellBack = new Set();
const levelsDir = path.join(ROOT, 'levels');
for (const level of existsSync(levelsDir) ? readdirSync(levelsDir) : []) {
  const file = path.join(levelsDir, level, 'jobs.json');
  if (!existsSync(file)) continue;
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  for (const job of Array.isArray(parsed) ? parsed : (parsed.jobs ?? [])) {
    if (job.meter?.toolFellBack) fellBack.add(job.id);
  }
}

const lines = readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter(Boolean);
let stamped = 0;
let already = 0;

const out = lines.map((line) => {
  const row = JSON.parse(line);
  if (row.toolFellBack) {
    already++;
    return line;
  }
  if (!fellBack.has(row.jobId)) return line;
  stamped++;
  return JSON.stringify({ ...row, toolFellBack: true });
});

console.log(
  `${lines.length} rows: ${stamped} to stamp, ${already} already flagged, ${fellBack.size} fall-backs found in job records`,
);

if (!write) {
  console.log('dry run — pass --write to apply');
} else {
  copyFileSync(LEDGER, `${LEDGER}.bak`);
  writeFileSync(LEDGER, `${out.join('\n')}\n`);
  console.log(`written; previous ledger kept at ${path.basename(LEDGER)}.bak`);
}
