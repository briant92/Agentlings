import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Job } from '@agentlings/shared';
import { append, interruptedRow, ledgerFile, readLedger, type LedgerEntry } from '../server/src/ledger';
import { listLevelDirs, readMeta, readRoster, type CrewSeed } from '../server/src/levels';
import { INTERRUPTED, readStoredJobs } from '../server/src/queue';

/**
 * One-off: the ledger rows that runs killed with the server never got (D-199).
 *
 * Until D-199 the ledger's only write was the completion callback, so a
 * process that died under a session wrote nothing; the job store marked the
 * job INTERRUPTED at the next start and the ledger stayed a row short —
 * thirteen times over the install's history, 42e320d0 and 31d0c24b the two
 * that were noticed. The mechanism now opens a row when a run starts and
 * closes it at the next boot; this writes that same closed row for the runs
 * that predate it.
 *
 * By identification, never by guess: a job the store marked INTERRUPTED (so
 * it was running when a process died) that has a `startedAt` and whose id no
 * ledger row carries. The role is read from the run's own record first — the
 * persona line of the `.session.json` every sandbox keeps, which is the
 * configuration the session was actually launched with — and from the
 * assignee's entry in the level's roster when that line is missing; the two
 * are cross-checked wherever both exist, and a disagreement is reported
 * rather than resolved. A job that neither can place is listed and left
 * alone, since a row filed under a guessed role would build a history for
 * work nobody can place. `at` is the run's start, the only time it has.
 * Append only: no existing row is touched.
 *
 * Dry by default. Pass --write to append, which takes a .bak first.
 *
 *   npx tsx scripts/backfill-ledger-interrupted.ts
 *   npx tsx scripts/backfill-ledger-interrupted.ts --write
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const LEDGER = ledgerFile(ROOT);
const write = process.argv.includes('--write');

if (!existsSync(LEDGER)) {
  console.error(`no ledger at ${LEDGER}`);
  process.exit(1);
}

/**
 * The role a run was launched as, from the persona line of its sandbox's
 * `.session.json` (the layout is JobQueue.sandboxDir's: `jobs/<id>` under
 * the level). Undefined when the file is gone or the line does not say.
 */
function launchedAs(dir: string, jobId: string): string | undefined {
  const file = path.join(dir, 'jobs', jobId, '.session.json');
  if (!existsSync(file)) return undefined;
  try {
    const config = JSON.parse(readFileSync(file, 'utf8')) as { append?: string };
    return /^You are an? ([a-z-]+) agentling/i.exec(config.append ?? '')?.[1];
  } catch {
    return undefined;
  }
}

const onFile = new Set(readLedger(ROOT).map((row) => row.jobId));
const found: { levelId: string; job: Job; who: string; source: string; row: LedgerEntry }[] = [];
const unplaced: { levelId: string; job: Job }[] = [];
const disagree: { levelId: string; job: Job; persona: string; seed: CrewSeed }[] = [];
let interrupted = 0;

for (const dir of listLevelDirs(ROOT)) {
  const levelId = readMeta(dir).id;
  const roster = readRoster(dir);
  for (const job of readStoredJobs(dir)) {
    if (job.error !== INTERRUPTED) continue;
    interrupted++;
    if (!job.startedAt || onFile.has(job.id)) continue;
    const seed = roster.find((s) => s.id === job.assignedTo);
    const persona = launchedAs(dir, job.id);
    const role = persona ?? seed?.role;
    if (!role) {
      unplaced.push({ levelId, job });
      continue;
    }
    if (seed && persona && seed.role !== persona) disagree.push({ levelId, job, persona, seed });
    found.push({
      levelId,
      job,
      who: seed ? `${seed.name} (${seed.id})` : `${job.assignedTo} (not on roster)`,
      source: persona ? (seed ? 'session+roster' : 'session') : 'roster',
      row: interruptedRow(job, levelId, role, job.startedAt),
    });
  }
}

const when = (at?: number) =>
  at ? new Date(at).toISOString().slice(0, 16).replace('T', ' ') : '?';
console.log(`ledger rows          ${onFile.size}`);
console.log(`interrupted jobs     ${interrupted}`);
console.log(`without a row        ${found.length + unplaced.length}`);
for (const { levelId, job, who, source, row } of found) {
  const quoted = row.quotedUsd !== undefined ? `$${row.quotedUsd.toFixed(2)}` : '—';
  console.log(
    `  ${job.id}  ${levelId.padEnd(16)} ${when(job.startedAt)}  ${who.padEnd(22)} → ${row.jobClass.padEnd(10)} quoted ${quoted.padEnd(6)} [${source}]`,
  );
}
if (disagree.length > 0) {
  console.log(`roster and session disagree — session written, check these  ${disagree.length}`);
  for (const { levelId, job, persona, seed } of disagree) {
    console.log(`  ${job.id}  ${levelId}  session says ${persona}, roster says ${seed.role}`);
  }
}
if (unplaced.length > 0) {
  console.log(`nothing places the role — left alone  ${unplaced.length}`);
  for (const { levelId, job } of unplaced) {
    console.log(`  ${job.id}  ${levelId}  assignedTo=${job.assignedTo ?? '(none)'}`);
  }
}

if (!write) {
  console.log('\ndry run — nothing written. Pass --write to apply.');
  process.exit(0);
}

copyFileSync(LEDGER, `${LEDGER}.pre-interrupted.bak`);
for (const { row } of found) append(ROOT, row);
console.log(`\nappended ${found.length} row(s). previous ledger kept at ${LEDGER}.pre-interrupted.bak`);
