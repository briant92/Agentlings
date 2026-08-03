import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Fills `agentlingId` on ledger rows written before the field existed.
 *
 * By identification, never by guess: a row is matched to its job by id, and
 * the author is copied off that job's own `assignedTo`. A row whose job has
 * left the queue file is left blank — its sandbox names the role that ran it
 * and nothing else, and attributing it to whoever held that role would build a
 * spending record for work that agentling may never have touched.
 *
 * Dry by default. Pass --write to actually rewrite, which takes a .bak first.
 *
 *   node scripts/backfill-ledger-author.mjs
 *   node scripts/backfill-ledger-author.mjs --write
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const LEDGER = path.join(ROOT, 'ledger.jsonl');
const write = process.argv.includes('--write');

if (!existsSync(LEDGER)) {
  console.error(`no ledger at ${LEDGER}`);
  process.exit(1);
}

/** Every job on file, by id, across every level. */
function jobsById() {
  const byId = new Map();
  const levels = path.join(ROOT, 'levels');
  if (!existsSync(levels)) return byId;
  const names = readdirSync(levels, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const level of names) {
    const file = path.join(levels, level, 'jobs.json');
    if (!existsSync(file)) continue;
    let jobs;
    try {
      jobs = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue; // a torn queue file must not stop the rest being matched
    }
    if (!Array.isArray(jobs)) continue;
    for (const job of jobs) if (job?.id) byId.set(job.id, job);
  }
  return byId;
}

const jobs = jobsById();
const lines = readFileSync(LEDGER, 'utf8').split(/\r?\n/);

let filled = 0;
let already = 0;
let unmatched = 0;
let unassigned = 0;
const orphans = [];

const out = lines.map((line) => {
  if (!line.trim()) return line;
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    return line; // leave anything unparseable exactly as it is
  }
  if (row.agentlingId) {
    already++;
    return line;
  }
  const job = jobs.get(row.jobId);
  if (!job) {
    unmatched++;
    orphans.push(row);
    return line;
  }
  if (!job.assignedTo) {
    unassigned++;
    return line;
  }
  filled++;
  // Rebuilt rather than string-patched so the row stays valid JSON, and with
  // the key beside jobClass where ledgerRow writes it.
  const { at, jobId, levelId, jobClass, ...rest } = row;
  return JSON.stringify({ at, jobId, levelId, jobClass, agentlingId: job.assignedTo, ...rest });
});

const orphanUsd = orphans.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
console.log(`ledger rows       ${lines.filter((l) => l.trim()).length}`);
console.log(`already named     ${already}`);
console.log(`filled in         ${filled}`);
console.log(`job never assigned${String(unassigned).padStart(4)}`);
console.log(`job not on file   ${unmatched}  ($${orphanUsd.toFixed(2)} unattributable)`);
for (const row of orphans) {
  console.log(`  ${row.jobId}  ${row.levelId}  ${row.jobClass}  $${(row.costUsd ?? 0).toFixed(3)}`);
}

if (!write) {
  console.log('\ndry run — nothing written. Pass --write to apply.');
  process.exit(0);
}

copyFileSync(LEDGER, `${LEDGER}.pre-author.bak`);
writeFileSync(LEDGER, out.join('\n'));
console.log(`\nwritten. previous ledger kept at ${LEDGER}.pre-author.bak`);
