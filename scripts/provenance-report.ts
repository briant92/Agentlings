// Prints what one level has on file and which record came from which — the
// provenance index, built from identifiers the records already carry.
//
//   npx tsx scripts/provenance-report.ts <levelId>
//
// Plain node, reads the level directory and the ledger, writes nothing, calls
// no model. It is the prototype's falsifier: the numbers it prints — edges
// resolved against identifiers that named nothing, titles that named several
// jobs, and the time the build took — are what decide whether the index is
// worth a route and a panel.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildProvenance, countByKind, countByVia } from '../server/src/provenance';
import type { LedgerEntry } from '../server/src/ledger';

const levelId = process.argv[2];
if (!levelId) {
  console.error('usage: npx tsx scripts/provenance-report.ts <levelId>');
  process.exit(1);
}
const LEVELS = path.join(process.cwd(), '.agentlings', 'levels');
const LEDGER = path.join(process.cwd(), '.agentlings', 'ledger.jsonl');
const levelDir = path.join(LEVELS, levelId);
if (!existsSync(levelDir)) {
  console.error(`no level at ${levelDir}`);
  process.exit(1);
}

/** Torn lines skipped, open rows skipped — as readLedger reads it (D-199). */
function ledgerRows(): LedgerEntry[] {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LedgerEntry & { open?: boolean }];
      } catch {
        return [];
      }
    })
    .filter((row) => !row.open && row.levelId === levelId);
}

const p = buildProvenance(levelDir, levelId, ledgerRows(), Date.now());

console.log(`# ${levelId} — provenance index\n`);
console.log(`built in ${p.buildMs} ms · ${p.nodes.length} nodes · ${p.edges.length} edges\n`);

console.log('## nodes by kind');
for (const [kind, n] of Object.entries(countByKind(p))) console.log(`  ${kind.padEnd(15)} ${n}`);
const flagged = p.nodes.filter((n) => n.flags?.length);
if (flagged.length > 0) {
  const byFlag: Record<string, number> = {};
  for (const n of flagged) for (const f of n.flags ?? []) byFlag[f] = (byFlag[f] ?? 0) + 1;
  console.log('  flagged: ' + Object.entries(byFlag).map(([f, n]) => `${f} ${n}`).join(', '));
}

console.log('\n## edges by via (resolved / unresolved / ambiguous)');
const vias = countByVia(p);
const all = new Set([...Object.keys(vias), ...Object.keys(p.unresolved)]);
let worst = 1;
for (const via of [...all].sort()) {
  const got = vias[via]?.edges ?? 0;
  const lost = p.unresolved[via as keyof typeof p.unresolved] ?? 0;
  const amb = vias[via]?.ambiguous ?? 0;
  const rate = got + lost > 0 ? got / (got + lost) : 1;
  if (got + lost > 0) worst = Math.min(worst, rate);
  console.log(
    `  ${via.padEnd(24)} ${String(got).padStart(5)} / ${String(lost).padStart(4)} / ${String(amb).padStart(3)}   ${(rate * 100).toFixed(0)}% resolved`,
  );
}

console.log('\n## the gate');
console.log(`  worst resolved rate  ${(worst * 100).toFixed(0)}%   (needs ≥ 80%)`);
console.log(`  build time           ${p.buildMs} ms   (needs ≤ 200 ms)`);
