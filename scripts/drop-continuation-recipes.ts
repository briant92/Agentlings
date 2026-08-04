/**
 * One-off cleanup for D-074: remove recipes banked by continuation runs under
 * compound keys — the original sentence plus the carry-on brief — which
 * nothing will ever match (`hits: 0` by construction) and whose brief words
 * distort the rarity corpus every other match is weighed against.
 *
 * Identification, not similarity: the carry-on brief's own phrase is the
 * marker, present in a key only when the brief was folded into the prompt,
 * which stopped happening with D-074. Idempotent; dry run by default,
 * `--apply` writes with a `.pre-drop.bak` beside each changed file.
 *
 *   npx tsx scripts/drop-continuation-recipes.ts
 *   npx tsx scripts/drop-continuation-recipes.ts --apply
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Recipe } from '../server/src/recipes';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LEVELS = path.join(ROOT, '.agentlings', 'levels');
const MARKER = 'carry on from there rather than starting again';
const apply = process.argv.includes('--apply');

if (!existsSync(LEVELS)) {
  console.log('no levels directory; nothing to do');
} else {
  for (const level of readdirSync(LEVELS)) {
    const file = path.join(LEVELS, level, 'recipes.json');
    if (!existsSync(file)) continue;
    const recipes = JSON.parse(readFileSync(file, 'utf8')) as Recipe[];
    const kept = recipes.filter((r) => !r.key.includes(MARKER));
    if (kept.length === recipes.length) continue;

    for (const r of recipes.filter((x) => x.key.includes(MARKER))) {
      console.log(`${level} — dropping (hits ${r.hits}): ${r.key.slice(0, 90)}…`);
    }
    if (apply) {
      copyFileSync(file, `${file}.pre-drop.bak`);
      writeFileSync(file, JSON.stringify(kept, null, 2));
      console.log(`${level} — written (${recipes.length} → ${kept.length})`);
    }
  }
  if (!apply) console.log('\n(dry run — pass --apply to write)');
}
