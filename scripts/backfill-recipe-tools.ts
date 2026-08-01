import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalise, type Recipe } from '../server/src/recipes';

/**
 * One-off: record on each recipe the connections its run could reach.
 *
 * A recipe now carries `tools`, and a mismatch between that and what a job can
 * reach today demotes a strong match to a weak one — the method is still handed
 * over, but the leash is not cut, so the crew can notice a capability it did
 * not have before. A recipe with no `tools` has unknown provenance and is
 * treated as changed, which is the safe reading and also the expensive one:
 * without this every recipe on file pays for one full-length run before it
 * heals itself.
 *
 * This is an identification, not a guess. A recipe's key *is* `normalise(job.prompt)`,
 * so a row is stamped only where a job record still on disk normalises to that
 * exact key. Where several such jobs disagree about their connections, or where
 * none survives, the recipe is left alone and demotes as designed — guessing is
 * the mislabelling this project keeps catching.
 *
 *   npx tsx scripts/backfill-recipe-tools.ts [--write]
 */

const ROOT = path.join(process.cwd(), '.agentlings', 'levels');
const write = process.argv.includes('--write');

type Job = { prompt?: string; tools?: string[] };

let stamped = 0;
let ambiguous = 0;
let orphaned = 0;
let already = 0;

for (const level of existsSync(ROOT) ? readdirSync(ROOT) : []) {
  const dir = path.join(ROOT, level);
  const recipeFile = path.join(dir, 'recipes.json');
  const jobFile = path.join(dir, 'jobs.json');
  if (!existsSync(recipeFile) || !existsSync(jobFile)) continue;

  const recipes = JSON.parse(readFileSync(recipeFile, 'utf8')) as Recipe[];
  const raw = JSON.parse(readFileSync(jobFile, 'utf8')) as Job[] | { jobs: Job[] };
  const jobs = Array.isArray(raw) ? raw : raw.jobs;

  // Every job that could have produced each key, by identity of the key itself.
  const byKey = new Map<string, string[][]>();
  for (const job of jobs) {
    if (!job.prompt) continue;
    const key = normalise(job.prompt);
    const tools = [...(job.tools ?? [])].sort();
    byKey.set(key, [...(byKey.get(key) ?? []), tools]);
  }

  let changed = false;
  for (const recipe of recipes) {
    if (recipe.tools) {
      already++;
      continue;
    }
    const candidates = byKey.get(recipe.key);
    if (!candidates?.length) {
      orphaned++;
      console.log(`  orphaned  ${level} :: ${recipe.key.slice(0, 58)}`);
      continue;
    }
    const distinct = [...new Set(candidates.map((c) => c.join(',')))];
    if (distinct.length > 1) {
      ambiguous++;
      console.log(`  ambiguous ${level} :: ${recipe.key.slice(0, 46)} (${distinct.join(' | ')})`);
      continue;
    }
    recipe.tools = candidates[0];
    stamped++;
    changed = true;
    console.log(`  stamped   ${level} :: ${recipe.key.slice(0, 46)} -> [${recipe.tools}]`);
  }

  if (changed && write) {
    copyFileSync(recipeFile, `${recipeFile}.bak`);
    writeFileSync(recipeFile, `${JSON.stringify(recipes, null, 2)}\n`, 'utf8');
  }
}

console.log(
  `\n${write ? 'wrote' : 'dry run'}: ${stamped} stamped, ${ambiguous} ambiguous, ${orphaned} orphaned, ${already} already had them`,
);
if (!write) console.log('re-run with --write to apply');
