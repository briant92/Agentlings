import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One-off: stamp `hasRepo` onto ledger rows written before the field existed.
 *
 * The budget prices a turn from runs of the same shape, and a row with no
 * shape cannot join that average — so without this every historical row is
 * invisible to it and the ceiling stays inert until a fresh history builds up
 * from nothing. The value is not invented: it is read back off the job record
 * that is still on disk, which is where repoPath has always lived.
 *
 * Rows whose job record is gone keep no shape. That is the honest answer, and
 * costPerTurn already ignores them rather than guessing.
 *
 *   node scripts/backfill-ledger-shape.mjs [--write]
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const LEDGER = path.join(ROOT, 'ledger.jsonl');
const write = process.argv.includes('--write');

if (!existsSync(LEDGER)) {
  console.error(`no ledger at ${LEDGER}`);
  process.exit(1);
}

/** jobId → whether that job had a repository, from every level's job record. */
const shapes = new Map();
const levelsDir = path.join(ROOT, 'levels');
for (const level of existsSync(levelsDir) ? readdirSync(levelsDir) : []) {
  const file = path.join(levelsDir, level, 'jobs.json');
  if (!existsSync(file)) continue;
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  for (const job of Array.isArray(parsed) ? parsed : (parsed.jobs ?? [])) {
    shapes.set(job.id, Boolean(job.repoPath));
  }
}

const lines = readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter(Boolean);
let stamped = 0;
let already = 0;
let unknown = 0;

const out = lines.map((line) => {
  const row = JSON.parse(line);
  if (row.hasRepo !== undefined) {
    already++;
    return line;
  }
  if (!shapes.has(row.jobId)) {
    unknown++;
    return line;
  }
  stamped++;
  return JSON.stringify({ ...row, hasRepo: shapes.get(row.jobId) });
});

console.log(`${lines.length} rows: ${stamped} to stamp, ${already} already shaped, ${unknown} with no job record left`);

if (!write) {
  console.log('dry run — pass --write to apply');
} else {
  copyFileSync(LEDGER, `${LEDGER}.bak`);
  writeFileSync(LEDGER, `${out.join('\n')}\n`);
  console.log(`written; previous ledger kept at ${path.basename(LEDGER)}.bak`);
}
