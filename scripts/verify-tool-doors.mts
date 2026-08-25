// What a compiled tool needs, checked against the doors a schedule row names,
// through the router's own `findTool` (D-254, #9).
//
//   npx tsx scripts/verify-tool-doors.mts training-ground c639d84a
//
// Prints every unretired tool on the level whose recipe key is the row's
// prompt, the doors it was compiled against, and whether the row's list would
// let the router pick it — with the repo flag both ways, because a tool
// compiled against no clone is filtered out on a level that carries a
// repository before its doors are even read.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findTool, readTools } from '../server/src/tools';
import { readSchedules } from '../server/src/schedules';

const [level, id] = process.argv.slice(2);
if (!level || !id) {
  console.error('usage: npx tsx scripts/verify-tool-doors.mts <level> <schedule id>');
  process.exit(2);
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, '.agentlings', 'levels', level);
const row = readSchedules(dir).find((s) => s.id === id);
if (!row) {
  console.error(`no schedule ${id} on ${level}`);
  process.exit(1);
}
const doors = row.tools;
console.log(`row ${id}: ${doors === undefined ? 'LEGACY (every door)' : JSON.stringify(doors)}`);
const tools = readTools(dir);
const pick = (granted: string[], hasRepo: boolean) =>
  findTool(tools, row.prompt, hasRepo, granted)?.name ?? '(no tool — a session)';
const named = doors ?? ['web', 'render', 'github', 'search', 'bls', 'calendar', 'mail', 'browser'];
for (const t of tools.filter((t) => !t.retiredReason)) {
  console.log(`  ${t.name}: needs ${JSON.stringify(t.connections ?? [])}, hasRepo ${t.hasRepo}`);
}
console.log(`no repo, the row's doors     → ${pick(named, false)}`);
console.log(`no repo, bls alone           → ${pick(['bls'], false)}`);
console.log(`no repo, no doors            → ${pick([], false)}`);
console.log(`WITH a repo, the row's doors → ${pick(named, true)}`);
