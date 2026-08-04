/**
 * One-off cleanup for D-073: apply the append seams' new rule — the same
 * undated note kept once, newest telling wins — to the notes already on disk,
 * which the fix cannot otherwise reach (the trap of D-026, D-030, D-033,
 * D-036: a change complete in the code and inert against existing data).
 *
 * Exact match on the undated text only, the same rule `appendKnowledge` and
 * `MemoryStore.append` now enforce; nothing fuzzier, for the measured reason
 * in `memory.ts`. Non-"- " lines (headers, human notes) are left untouched.
 *
 * Dry run by default; `--apply` writes, leaving a `.pre-dedupe.bak` beside
 * each changed file. Idempotent: a second apply changes nothing.
 *
 *   npx tsx scripts/dedupe-notes.ts
 *   npx tsx scripts/dedupe-notes.ts --apply
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { undated } from '../server/src/memory';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LEVELS = path.join(ROOT, '.agentlings', 'levels');
const apply = process.argv.includes('--apply');

function dedupe(file: string): void {
  if (!existsSync(file)) return;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  // Keep the newest telling of each note: a "- " line is dropped only when a
  // later "- " line carries the same undated text.
  const noteAt = (l: string): string | null => (l.startsWith('- ') ? undated(l.slice(2)) : null);
  const kept: string[] = [];
  const dropped: string[] = [];
  lines.forEach((line, i) => {
    const note = noteAt(line);
    const repeatedLater =
      note !== null && lines.slice(i + 1).some((later) => noteAt(later) === note);
    if (repeatedLater) dropped.push(line);
    else kept.push(line);
  });
  if (dropped.length === 0) return;

  const rel = path.relative(ROOT, file);
  console.log(`${rel} — dropping ${dropped.length} of ${lines.filter((l) => noteAt(l)).length} notes:`);
  for (const line of dropped) console.log(`  ${line.slice(0, 100)}`);
  if (apply) {
    copyFileSync(file, `${file}.pre-dedupe.bak`);
    writeFileSync(file, kept.join('\n'));
    console.log('  written');
  }
}

if (!existsSync(LEVELS)) {
  console.log('no levels directory; nothing to do');
} else {
  for (const level of readdirSync(LEVELS)) {
    const dir = path.join(LEVELS, level);
    dedupe(path.join(dir, 'KNOWLEDGE.md'));
    const memDir = path.join(dir, 'memory');
    if (existsSync(memDir)) {
      for (const f of readdirSync(memDir)) {
        if (f.endsWith('.md')) dedupe(path.join(memDir, f));
      }
    }
  }
  if (!apply) console.log('\n(dry run — pass --apply to write)');
}
