import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One-off: give a compiled tool the capability surface of the recipe it was
 * compiled from.
 *
 * A tool records what the crew could reach when its method was found. That is
 * knowable only at compile time, so anything already on disk has to be matched
 * back to its source or left alone — the same shape as the ledger's
 * `closeOutUsd` recovery, which reached 13 of 79 rows by identification and
 * invented nothing for the rest (D-039).
 *
 * The identification is `tool.recipeKey === recipe.key`, and it only fires
 * where that recipe still carries a surface. Recipes written before D-036 have
 * none, and for those tools the honest answer is that the information does not
 * exist. Reading the level's surface *now* would produce a plausible number
 * describing a moment that never happened.
 *
 * Running it twice does nothing the second time.
 *
 *   node scripts/backfill-tool-surface.mjs [--write]
 */

const write = process.argv.includes('--write');
const root = path.join(process.cwd(), '.agentlings', 'levels');

if (!existsSync(root)) {
  console.log('no levels on disk — nothing to do');
  process.exit(0);
}

let filled = 0;
let already = 0;
let unknowable = 0;

for (const level of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const dir = path.join(root, level.name);
  const toolsDir = path.join(dir, 'tools');
  const recipesFile = path.join(dir, 'recipes.json');
  if (!existsSync(toolsDir) || !existsSync(recipesFile)) continue;

  let recipes;
  try {
    const parsed = JSON.parse(readFileSync(recipesFile, 'utf8'));
    recipes = Array.isArray(parsed) ? parsed : (parsed.recipes ?? []);
  } catch {
    console.log(`${level.name}: recipes.json unreadable — skipped`);
    continue;
  }

  for (const entry of readdirSync(toolsDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const file = path.join(toolsDir, entry.name, 'tool.json');
    if (!existsSync(file)) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (manifest.capabilities) {
      already++;
      continue;
    }
    const source = recipes.find((r) => r.key === manifest.recipeKey);
    if (!source?.capabilities?.length) {
      unknowable++;
      console.log(`${level.name}/${entry.name}: no surface on record — left alone`);
      continue;
    }
    filled++;
    console.log(
      `${level.name}/${entry.name}: ${source.capabilities.length} tokens from its recipe`,
    );
    if (write) {
      // Rewritten with the field in the same position the server writes it, so
      // a backfilled manifest and a fresh one are the same file.
      const { name, recipeKey, terms, hasRepo, ...rest } = manifest;
      writeFileSync(
        file,
        `${JSON.stringify({ name, recipeKey, terms, hasRepo, capabilities: source.capabilities, ...rest }, null, 2)}\n`,
      );
    }
  }
}

console.log(
  `\n${filled} recoverable, ${unknowable} with no surface on record, ${already} already carried one`,
);
if (!write && filled > 0) console.log('re-run with --write to apply');
