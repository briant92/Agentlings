/**
 * One-off repair for D-099: strip the counters that a *resembling* run left on
 * a recipe it merely matched by similarity.
 *
 * Only exact matches say anything about the job a key names, and until D-099
 * every match credited everything. Measured: "I need to send a Telegram to
 * Pepo" credited the recipe for "Send Pepo the current Warzone meta summary on
 * Telegram" with a 3-turn completion — two words into an outbox against work
 * its siblings measured at 14 and 15 turns — and armed a five-turn leash on it.
 *
 * **Identification, not inference.** The ledger records the `recipeKey` each
 * run credited, and `jobs.json` records what that job's prompt actually was, so
 * every credit can be classified as exact or not by comparing the two. A
 * recipe is only touched when *every* credit it has ever received was
 * non-exact — then its `successes`, `completions` and `completedInTurns` are
 * known to have come from other people's work in their entirety, and can be
 * removed rather than adjusted by a guess. A recipe with any exact credit is
 * left alone: undoing the `min()` behind `completedInTurns` cannot be done by
 * identification, and this project does not backfill by guess.
 *
 * `hits` is kept. A resembling run did use the method, that is what `hits`
 * means, and D-099 still credits it — nothing reads it anyway.
 *
 * Idempotent; dry run by default, `--apply` writes with a `.pre-credit.bak`
 * beside each changed file.
 *
 *   npx tsx scripts/drop-nonexact-credits.ts
 *   npx tsx scripts/drop-nonexact-credits.ts --apply
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalise, type Recipe } from '../server/src/recipes';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SANDBOX = path.join(ROOT, '.agentlings');
const LEVELS = path.join(SANDBOX, 'levels');
const apply = process.argv.includes('--apply');

interface LedgerRow {
  jobId?: string;
  recipeKey?: string;
}

function ledgerRows(): LedgerRow[] {
  const file = path.join(SANDBOX, 'ledger.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LedgerRow];
      } catch {
        return [];
      }
    });
}

/** Every job's prompt, by id, across every level. */
function prompts(): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(LEVELS)) return out;
  for (const level of readdirSync(LEVELS)) {
    const file = path.join(LEVELS, level, 'jobs.json');
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as
        | { jobs?: { id: string; prompt: string }[] }
        | { id: string; prompt: string }[];
      const jobs = Array.isArray(parsed) ? parsed : (parsed.jobs ?? []);
      for (const job of jobs) out.set(job.id, job.prompt);
    } catch {
      /* a level with an unreadable job store contributes nothing */
    }
  }
  return out;
}

const known = prompts();
const rows = ledgerRows().filter((r) => r.recipeKey && r.jobId);

/** key → how its credits split. A job whose record is gone counts as unknown. */
const split = new Map<string, { exact: number; resembling: number; unknown: number }>();
for (const row of rows) {
  const tally = split.get(row.recipeKey!) ?? { exact: 0, resembling: 0, unknown: 0 };
  const prompt = known.get(row.jobId!);
  if (prompt === undefined) tally.unknown += 1;
  else if (normalise(prompt) === row.recipeKey) tally.exact += 1;
  else tally.resembling += 1;
  split.set(row.recipeKey!, tally);
}

let changed = 0;
for (const level of existsSync(LEVELS) ? readdirSync(LEVELS) : []) {
  const file = path.join(LEVELS, level, 'recipes.json');
  if (!existsSync(file)) continue;
  let recipes: Recipe[];
  try {
    recipes = JSON.parse(readFileSync(file, 'utf8')) as Recipe[];
  } catch {
    console.log(`${level}: recipes.json unreadable, skipped`);
    continue;
  }

  const touched: string[] = [];
  for (const recipe of recipes) {
    const tally = split.get(recipe.key);
    if (!tally || tally.resembling === 0) continue;
    // Any exact credit, or any credit whose job is gone, and the counters are
    // a blend this cannot take apart. Left alone, and said out loud.
    if (tally.exact > 0 || tally.unknown > 0) {
      console.log(
        `${level}: leaving "${recipe.key.slice(0, 52)}" — ${tally.resembling} resembling ` +
          `credit(s) mixed with ${tally.exact} exact and ${tally.unknown} unknown`,
      );
      continue;
    }
    if (
      recipe.successes === undefined &&
      recipe.completions === undefined &&
      recipe.completedInTurns === undefined
    ) {
      continue; // already repaired
    }
    console.log(
      `${level}: clearing "${recipe.key.slice(0, 52)}" — successes ${recipe.successes ?? 0}, ` +
        `completions ${recipe.completions ?? 0}, completedInTurns ${recipe.completedInTurns ?? '-'}` +
        ` (all from ${tally.resembling} resembling run(s))`,
    );
    delete recipe.successes;
    delete recipe.completions;
    delete recipe.completedInTurns;
    touched.push(recipe.key);
  }

  if (touched.length === 0) continue;
  changed += touched.length;
  if (apply) {
    copyFileSync(file, `${file}.pre-credit.bak`);
    writeFileSync(file, JSON.stringify(recipes, null, 2));
  }
}

console.log(
  changed === 0
    ? 'nothing to repair'
    : apply
      ? `repaired ${changed} recipe(s)`
      : `${changed} recipe(s) would be repaired — re-run with --apply`,
);
