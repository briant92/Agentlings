// The grader calibrated against the only labelled set whose labels were not
// written by the grader's author reading the grader's output: the positions
// board's hand grades (D-229), written from the code by Brian's review.
//
//   npx tsx scripts/coverage-calibrate.ts            the diff
//   npx tsx scripts/coverage-calibrate.ts --agree    agreeing rows too
//
// Every duty sentence on the board goes through the real `gradeTask` with
// every installed role held and every catalog door open — the hand grades
// assume the needed door *can* be connected ("Connect Google once" is in a
// position's needs, and its duties are graded y) — and the machine grade is
// mapped covered→y, partial→p, uncovered→n and diffed against the hand one.
//
// A disagreement is not automatically a grader bug: a hand grade carries
// context the sentence alone does not ("Open a pull request…" is p because
// D-104's review comment exists, which no words in the duty say). So the
// output is a list for a human read, with the grader's own reasons beside
// each row, and the summary separates the direction of the miss — the
// grader claiming more than the hand (the dangerous direction, D-229's
// overclaim trap) from claiming less (the safe one).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeTask, type CoverageContext } from '../server/src/coverage';
import { readConnections } from '../server/src/connections';
import { MatchIndex } from '../server/src/match';
import { RoleRegistry, listSkills } from '../server/src/roles';
import { POSITIONS, type Grade } from '../web/src/panels/positions';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const showAgree = process.argv.includes('--agree');

const registry = new RoleRegistry(path.join(ROOT, 'roles'));
registry.load();
const ctx: CoverageContext = {
  index: new MatchIndex(registry.loaded(), listSkills(path.join(ROOT, 'skills'))),
  roles: registry.list(),
  doors: readConnections(path.join(ROOT, 'catalog', 'connections.json')).map((c) => ({ name: c.name, open: true })),
};

const toHand: Record<string, Grade> = { covered: 'y', partial: 'p', uncovered: 'n' };
const word: Record<Grade, string> = { y: 'does', p: 'partly', n: 'not-this-crew' };

interface Row {
  position: string;
  trade: string | null;
  duty: string;
  hand: Grade;
  machine: Grade;
  machineRole: string | null;
  gap: string | null;
  reason: string;
}

const rows: Row[] = [];
for (const p of POSITIONS) {
  for (const d of p.duties) {
    const g = gradeTask(ctx, { id: `${p.title}:${d.text.slice(0, 20)}`, text: d.text, required: true });
    rows.push({
      position: p.title,
      trade: p.trade,
      duty: d.text,
      hand: d.grade,
      machine: toHand[g.grade],
      machineRole: g.role,
      gap: g.gap,
      reason: g.reasons[0] ?? '',
    });
  }
}

const order: Grade[] = ['y', 'p', 'n'];
const matrix: Record<Grade, Record<Grade, number>> = { y: { y: 0, p: 0, n: 0 }, p: { y: 0, p: 0, n: 0 }, n: { y: 0, p: 0, n: 0 } };
for (const r of rows) matrix[r.hand][r.machine] += 1;

const total = rows.length;
const exact = rows.filter((r) => r.hand === r.machine).length;
const step = (g: Grade) => order.indexOf(g);
const over = rows.filter((r) => step(r.machine) < step(r.hand)); // machine claims more than the hand
const under = rows.filter((r) => step(r.machine) > step(r.hand));
const hardOver = over.filter((r) => r.hand === 'n' && r.machine === 'y');

console.log(`CALIBRATION — ${total} hand-graded duties (D-229) vs gradeTask, all roles held, all doors open`);
console.log(`  exact agreement   ${exact}/${total}  (${Math.round((100 * exact) / total)}%)`);
console.log(`  machine claims MORE than the hand  ${over.length}  (n→y among them: ${hardOver.length}) ← the overclaim direction`);
console.log(`  machine claims LESS than the hand  ${under.length}`);
console.log('\n  hand \\ machine     y     p     n');
for (const h of order) {
  console.log(`  ${h}              ${order.map((m) => String(matrix[h][m]).padStart(6)).join('')}`);
}

const roleRows = rows.filter((r) => r.trade && r.machineRole && r.hand !== 'n');
const roleAgree = roleRows.filter((r) => r.machineRole === r.trade || r.position.includes('Bookkeeper') === false && r.machineRole === r.trade);
console.log(`\n  role agreement on duties the hand grades y/p with a trade named: ${roleRows.filter((r) => r.machineRole === r.trade).length}/${roleRows.length}`);

const show = (list: Row[], label: string) => {
  if (list.length === 0) return;
  console.log(`\n  ${label}`);
  for (const r of list) {
    console.log(`    [hand ${word[r.hand]} | machine ${word[r.machine]}${r.gap ? ` (${r.gap})` : ''}${r.machineRole ? ` ${r.machineRole}` : ''}] ${r.position}`);
    console.log(`      ${r.duty}`);
    console.log(`      ↳ ${r.reason.slice(0, 160)}`);
  }
};
show(over, 'machine claims more (read these first)');
show(under, 'machine claims less');
if (showAgree) show(rows.filter((r) => r.hand === r.machine), 'agreeing');
