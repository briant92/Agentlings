// D-117's harness, committed this time (D-158 is the second role addition to
// need it): every distinct real prompt the app has ever queued, replayed
// through the production matcher against the real installed catalog. Adding a
// role moves BM25 under the roles already there (D-112), so the replay runs
// BEFORE and AFTER a role lands and the diff is the measurement.
//
//   npx tsx scripts/matcher-replay.ts --out before.json     snapshot
//   npx tsx scripts/matcher-replay.ts --diff before.json    what moved since
//
// Reads jobs.json in every level, open or closed, and writes nothing anywhere
// but the --out file. No label says where a prompt SHOULD land — that is
// starter.test.ts's reach table. What this measures is movement: which
// sentences a catalog change re-routed, so the judgement call is made looking
// at the actual casualties rather than at a hunch (D-117's method).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MatchIndex, suggestSetup } from '../server/src/match';
import { readStoredJobs } from '../server/src/queue';
import { RoleRegistry, listSkills } from '../server/src/roles';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const registry = new RoleRegistry(path.join(ROOT, 'roles'));
registry.load();
const roles = registry.list();
const index = new MatchIndex(registry.loaded(), listSkills(path.join(ROOT, 'skills')));

const levelsDir = path.join(ROOT, '.agentlings', 'levels');
const prompts = new Set<string>();
if (existsSync(levelsDir)) {
  for (const level of readdirSync(levelsDir, { withFileTypes: true })) {
    if (!level.isDirectory()) continue;
    for (const job of readStoredJobs(path.join(levelsDir, level.name))) {
      const prompt = job.prompt?.trim();
      if (prompt) prompts.add(prompt);
    }
  }
}

type Row = { role: string | null; confidence: number };
const rows: Record<string, Row> = {};
for (const prompt of [...prompts].sort()) {
  const match = suggestSetup(index, roles, prompt);
  rows[prompt] = { role: match.role, confidence: Number(match.confidence.toFixed(2)) };
}

const counts = new Map<string, number>();
for (const row of Object.values(rows)) {
  const key = row.role ?? '(no match)';
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
console.log(`${Object.keys(rows).length} distinct prompts over ${roles.length} roles:`);
for (const [role, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${role}`);
}

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const out = flag('--out');
if (out) {
  writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`\nsnapshot: ${out}`);
}

const diffFile = flag('--diff');
if (diffFile) {
  const before = JSON.parse(readFileSync(diffFile, 'utf8')) as Record<string, Row>;
  const moved = Object.keys(rows).filter(
    (p) => before[p] && before[p].role !== rows[p].role,
  );
  const missing = Object.keys(rows).filter((p) => !before[p]);
  console.log(`\n${moved.length} prompts moved against ${diffFile}:`);
  for (const p of moved) {
    const was = before[p];
    const now = rows[p];
    console.log(
      `  ${was.role ?? '(no match)'} ${was.confidence} -> ${now.role ?? '(no match)'} ${now.confidence}  "${p.slice(0, 90)}"`,
    );
  }
  if (missing.length > 0) {
    console.log(`  (${missing.length} prompts queued since the snapshot, not compared)`);
  }
}
