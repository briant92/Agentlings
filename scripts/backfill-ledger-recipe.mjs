import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One-off: stamp `recipeKey` onto one-shot ledger rows written before the
 * field existed.
 *
 * A one-shot's quote is looked up by recipe, and the ledger only ever wrote
 * roles, so `history()` matched nothing and every one-shot quote fell through
 * to the tier average — "first time doing this", on the twentieth run. Without
 * this the fix is correct and inert: the quote cannot tighten until a fresh
 * history accumulates from zero, three runs at a time.
 *
 * Nothing here is inferred. A recipe key *is* `normalise(prompt)`, so a row is
 * only stamped when the prompt on its own job record normalises to a key that
 * exists today — an identification, not a similarity match. Rows whose job
 * record is gone, or whose prompt matches no current recipe, are left unshaped;
 * guessing at those is the mislabelling this whole change exists to undo.
 *
 *   node scripts/backfill-ledger-recipe.mjs [--write]
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const LEDGER = path.join(ROOT, 'ledger.jsonl');
const write = process.argv.includes('--write');

if (!existsSync(LEDGER)) {
  console.error(`no ledger at ${LEDGER}`);
  process.exit(1);
}

/** The same normalisation recipes are keyed by — keep in step with recipes.ts. */
const normalise = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** jobId → prompt, and every recipe key that exists, across all levels. */
const prompts = new Map();
const keys = new Set();
const levelsDir = path.join(ROOT, 'levels');
for (const level of existsSync(levelsDir) ? readdirSync(levelsDir) : []) {
  const jobsFile = path.join(levelsDir, level, 'jobs.json');
  if (existsSync(jobsFile)) {
    const parsed = JSON.parse(readFileSync(jobsFile, 'utf8'));
    for (const job of Array.isArray(parsed) ? parsed : (parsed.jobs ?? [])) {
      if (job?.id && typeof job.prompt === 'string') prompts.set(job.id, job.prompt);
    }
  }
  const recipesFile = path.join(levelsDir, level, 'recipes.json');
  if (existsSync(recipesFile)) {
    const parsed = JSON.parse(readFileSync(recipesFile, 'utf8'));
    for (const recipe of Array.isArray(parsed) ? parsed : Object.values(parsed)) {
      if (recipe?.key) keys.add(recipe.key);
    }
  }
}

const lines = readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter(Boolean);
let stamped = 0;
let already = 0;
let notOneShot = 0;
let unknown = 0;

const out = lines.map((line) => {
  const row = JSON.parse(line);
  if (row.tier !== 'oneshot') {
    notOneShot++;
    return line;
  }
  if (row.recipeKey !== undefined) {
    already++;
    return line;
  }
  const prompt = prompts.get(row.jobId);
  const key = prompt === undefined ? undefined : normalise(prompt);
  if (key === undefined || !keys.has(key)) {
    unknown++;
    return line;
  }
  stamped++;
  return JSON.stringify({ ...row, recipeKey: key });
});

console.log(
  `${lines.length} rows: ${stamped} to stamp, ${already} already keyed, ` +
    `${unknown} one-shot rows not identifiable, ${notOneShot} on other tiers (untouched)`,
);

if (!write) {
  console.log('dry run — pass --write to apply');
} else {
  copyFileSync(LEDGER, `${LEDGER}.bak`);
  writeFileSync(LEDGER, `${out.join('\n')}\n`);
  console.log(`written; previous ledger kept at ${path.basename(LEDGER)}.bak`);
}
