import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One-off: stamp `compile` onto ledger rows written before the field existed.
 *
 * Nothing reads it yet — the quote still prices compiles with ordinary
 * sessions, because measured across four of them the gap is 8% on four
 * samples. The field is recorded so that the question can be answered later
 * from real history rather than re-argued from intuition, and backfilled for
 * the same reason: four rows is little enough that losing them would leave the
 * population starting from zero.
 *
 * Nothing is inferred. A compile is queued by the promote route with a title
 * of exactly `Compile "<recipe>" into a tool`, so a row is stamped only when
 * its own job record still carries that title. Rows whose job record is gone
 * are left alone.
 *
 *   node scripts/backfill-ledger-compile.mjs [--write]
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const LEDGER = path.join(ROOT, 'ledger.jsonl');
const write = process.argv.includes('--write');

if (!existsSync(LEDGER)) {
  console.error(`no ledger at ${LEDGER}`);
  process.exit(1);
}

/** jobId → title, across every level. */
const titles = new Map();
const levelsDir = path.join(ROOT, 'levels');
for (const level of existsSync(levelsDir) ? readdirSync(levelsDir) : []) {
  const file = path.join(levelsDir, level, 'jobs.json');
  if (!existsSync(file)) continue;
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  for (const job of Array.isArray(parsed) ? parsed : (parsed.jobs ?? [])) {
    if (job?.id && typeof job.title === 'string') titles.set(job.id, job.title);
  }
}

/** The exact shape the promote route gives a compiling job. */
const isCompileTitle = (title) => /^Compile "/.test(title);

const lines = readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter(Boolean);
let stamped = 0;
let already = 0;
let notCompile = 0;
let unknown = 0;

const out = lines.map((line) => {
  const row = JSON.parse(line);
  if (row.compile !== undefined) {
    already++;
    return line;
  }
  const title = titles.get(row.jobId);
  if (title === undefined) {
    unknown++;
    return line;
  }
  if (!isCompileTitle(title)) {
    notCompile++;
    return line;
  }
  stamped++;
  return JSON.stringify({ ...row, compile: true });
});

console.log(
  `${lines.length} rows: ${stamped} compiles to stamp, ${already} already marked, ` +
    `${notCompile} ordinary jobs, ${unknown} with no job record left`,
);

if (!write) {
  console.log('dry run — pass --write to apply');
} else {
  copyFileSync(LEDGER, `${LEDGER}.bak`);
  writeFileSync(LEDGER, `${out.join('\n')}\n`);
  console.log(`written; previous ledger kept at ${path.basename(LEDGER)}.bak`);
}
