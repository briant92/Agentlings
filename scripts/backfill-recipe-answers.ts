import { existsSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { producedArtefacts } from '../server/src/outputs';
import { normalise } from '../server/src/recipes';

/**
 * One-off: drop banked answers from recipes whose job made something.
 *
 * A recipe may hold an `answer`, replayed word for word by the router so a
 * repeat costs nothing. That is right when the words *were* the deliverable
 * and a lie when they only described one. Found live on job 57bbff81: a run
 * that had written a PDF banked its own summary, and the next identical
 * request was answered for free with "hello-world.pdf (1,380 bytes) is a valid
 * one-page PDF" — and no PDF. The user asked for a file, was told its size,
 * and got nothing.
 *
 * The code no longer banks those, but a stored one keeps lying, so the fix
 * would be correct and inert without this — the same trap as the ledger's
 * `hasRepo` and the roster's tints.
 *
 * An answer is dropped only when a job on that level whose prompt normalises
 * to the recipe's own key still has a sandbox holding something other than the
 * crew's paperwork. That is an identification off records still on disk, not a
 * guess from the wording, and a recipe whose job is gone is left alone —
 * `producedArtefacts` cannot be asked about a sandbox that no longer exists.
 *
 *   npx tsx scripts/backfill-recipe-answers.ts [--write]
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const write = process.argv.includes('--write');
const levelsDir = path.join(ROOT, 'levels');

if (!existsSync(levelsDir)) {
  console.error(`no levels at ${levelsDir}`);
  process.exit(1);
}

interface Recipe {
  key: string;
  answer?: string;
  [k: string]: unknown;
}
interface JobRecord {
  id: string;
  prompt?: string;
}

let dropped = 0;
let files = 0;

for (const level of readdirSync(levelsDir)) {
  const levelDir = path.join(levelsDir, level);
  const recipesFile = path.join(levelDir, 'recipes.json');
  const jobsFile = path.join(levelDir, 'jobs.json');
  if (!existsSync(recipesFile)) continue;

  let recipes: Recipe[];
  let jobs: JobRecord[] = [];
  try {
    recipes = JSON.parse(readFileSync(recipesFile, 'utf8')) as Recipe[];
    if (existsSync(jobsFile)) jobs = JSON.parse(readFileSync(jobsFile, 'utf8')) as JobRecord[];
  } catch {
    console.warn(`  [${level}] unreadable, skipped`);
    continue;
  }
  if (!Array.isArray(recipes)) continue;

  let touched = false;
  for (const recipe of recipes) {
    if (!recipe.answer) continue;
    const made = jobs
      .filter((job) => job.prompt && normalise(job.prompt) === recipe.key)
      .some((job) => producedArtefacts(path.join(levelDir, 'jobs', job.id)));
    if (!made) continue;
    console.log(`  [${level}] "${recipe.key.slice(0, 58)}" — answer dropped, its job made files`);
    delete recipe.answer;
    touched = true;
    dropped++;
  }

  if (touched) {
    files++;
    if (write) {
      copyFileSync(recipesFile, `${recipesFile}.bak`);
      writeFileSync(recipesFile, `${JSON.stringify(recipes, null, 2)}\n`);
    }
  }
}

console.log(
  dropped === 0
    ? 'nothing to drop — no banked answer belongs to a run that made something'
    : `${dropped} answer(s) in ${files} file(s)${write ? ' dropped (.bak kept)' : ' — dry run, pass --write'}`,
);
