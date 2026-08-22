import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ledgerFile, markCut, readLedger } from '../server/src/ledger';
import { listLevelDirs } from '../server/src/levels';
import { readStoredJobs } from '../server/src/queue';

/**
 * One-off: the cut flags on rows written before they existed (UI.md, step 13).
 *
 * The ledger row now carries `outOfTurns` and `timedOut` straight off the
 * meter, so a profile can count the runs a limit stopped without reading
 * them off `turns` over `turnsAllowed` — which a finished run can carry
 * (44/40 and 51/40 both landed done on 2026-08-22, D-212). Rows from before
 * the field say nothing either way; this says it for them.
 *
 * By identification, never by guess: a row is marked only where the job it
 * names is still in its level's store and that job's own meter says the run
 * was cut — the same fact the live row builder reads. A row whose job has
 * left the queue stays silent, and the profile's cut count is a floor for it
 * rather than an estimate. Rows already carrying a flag are left exactly as
 * they are, and open rows ride through untouched.
 *
 * Reports, before anything is written, the rows matched, the rows already
 * speaking, the rows whose job is no longer stored, and the D-212 check —
 * how many of the rows to be marked show turns over the cap, and how many
 * rows over the cap will NOT be marked because their job finished on its
 * own.
 *
 * Dry by default. Pass --write to mark, which takes a .bak first.
 *
 *   npx tsx scripts/backfill-ledger-cut.ts
 *   npx tsx scripts/backfill-ledger-cut.ts --write
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const LEDGER = ledgerFile(ROOT);
const write = process.argv.includes('--write');

if (!existsSync(LEDGER)) {
  console.error(`no ledger at ${LEDGER}`);
  process.exit(1);
}

const cuts = new Map<string, { outOfTurns?: boolean; timedOut?: boolean }>();
const stored = new Set<string>();
for (const dir of listLevelDirs(ROOT)) {
  for (const job of readStoredJobs(dir)) {
    stored.add(job.id);
    if (job.meter?.outOfTurns || job.meter?.timedOut) {
      cuts.set(job.id, {
        ...(job.meter.outOfTurns ? { outOfTurns: true } : {}),
        ...(job.meter.timedOut ? { timedOut: true } : {}),
      });
    }
  }
}

const rows = readLedger(ROOT);
const speaking = rows.filter((r) => r.outOfTurns !== undefined || r.timedOut !== undefined);
const silent = rows.filter((r) => r.outOfTurns === undefined && r.timedOut === undefined);
const toMark = silent.filter((r) => cuts.has(r.jobId));
const gone = silent.filter((r) => !stored.has(r.jobId));
const overCap = (r: { turns?: number; turnsAllowed?: number }) =>
  typeof r.turns === 'number' && typeof r.turnsAllowed === 'number' && r.turns > r.turnsAllowed;
const markedOverCap = toMark.filter(overCap).length;
const unmarkedOverCap = silent.filter((r) => !cuts.has(r.jobId) && stored.has(r.jobId) && overCap(r));

console.log(`${rows.length} rows; ${speaking.length} already carry a flag; ${silent.length} say nothing`);
console.log(`${stored.size} jobs stored across ${listLevelDirs(ROOT).length} levels, ${cuts.size} of them cut by their own meter`);
console.log(`${toMark.length} rows to mark (${markedOverCap} of them show turns over the cap)`);
console.log(
  `${unmarkedOverCap.length} stored rows over the cap will NOT be marked — their job finished on its own (D-212): ${unmarkedOverCap
    .map((r) => `${r.jobId} ${r.turns}/${r.turnsAllowed}`)
    .join(', ')}`,
);
console.log(`${gone.length} silent rows name a job no longer stored — left silent; the cut count is a floor for them`);
const byLevel = new Map<string, number>();
for (const r of toMark) byLevel.set(r.levelId, (byLevel.get(r.levelId) ?? 0) + 1);
for (const [level, n] of byLevel) console.log(`  ${level}: ${n}`);

if (!write) {
  console.log('dry run — pass --write to mark them');
  process.exit(0);
}

const backup = `${LEDGER}.pre-cut.bak`;
copyFileSync(LEDGER, backup);
const changed = markCut(ROOT, cuts);
console.log(`marked ${changed} rows; the previous ledger is at ${backup}`);
