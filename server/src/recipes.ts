import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * What the crew has worked out how to do. Lever 7: when the agent solves
 * something, the way it solved it is written down so the next occurrence
 * doesn't need the same exploration — the agent teaches the deterministic
 * layer, and recurring work gets cheaper instead of costing the same forever.
 *
 * Recipes hold the approach, not the answer. A stored answer replayed against
 * a similar-but-different question is a silent wrong answer, so that only
 * happens on an exact repeat with no outside inputs.
 */

export interface Recipe {
  /** Normalised prompt, used for exact-repeat detection. */
  key: string;
  /** Content words, used to recognise the same shape of job. */
  terms: string[];
  role: string;
  /** How to do this kind of job, written by whoever solved it first. */
  approach: string;
  /** Only set when the job had no repository and no web access. */
  answer?: string;
  hits: number;
  learnedAt: number;
  lastUsedAt?: number;
}

const STOPWORDS = new Set(
  `a an and the to of for in on at is are be my me i it that this with do does did
   what when all any so we us you your from into over about please can could would
   should need want make take get give have has had there here they them`
    .split(/\s+/)
    .filter(Boolean),
);

export function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function terms(text: string): string[] {
  return [
    ...new Set(
      normalise(text)
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    ),
  ];
}

/** Shared content words over the union — 1 means the same words entirely. */
export function similarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const left = new Set(a);
  const shared = b.filter((t) => left.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
}

/** High enough that "the same job again" matches and a new question doesn't. */
export const SIMILAR_ENOUGH = 0.65;

export function recipesFile(levelDir: string): string {
  return path.join(levelDir, 'recipes.json');
}

export function readRecipes(levelDir: string): Recipe[] {
  const file = recipesFile(levelDir);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Recipe[];
  } catch {
    return [];
  }
}

export function writeRecipes(levelDir: string, recipes: Recipe[]): void {
  mkdirSync(levelDir, { recursive: true });
  writeFileSync(recipesFile(levelDir), JSON.stringify(recipes, null, 2));
}

/** The best recipe for a prompt: an exact repeat first, then the same shape. */
export function findRecipe(
  recipes: Recipe[],
  prompt: string,
): { recipe: Recipe; exact: boolean } | null {
  const key = normalise(prompt);
  const exact = recipes.find((r) => r.key === key);
  if (exact) return { recipe: exact, exact: true };

  const wanted = terms(prompt);
  let best: Recipe | null = null;
  let bestScore = 0;
  for (const recipe of recipes) {
    const score = similarity(wanted, recipe.terms);
    if (score > bestScore) {
      best = recipe;
      bestScore = score;
    }
  }
  return best && bestScore >= SIMILAR_ENOUGH ? { recipe: best, exact: false } : null;
}

/**
 * Records what was learned. An existing recipe for the same prompt is updated
 * rather than duplicated, so the file tracks the crew rather than growing.
 */
export function rememberRecipe(
  recipes: Recipe[],
  entry: { prompt: string; role: string; approach: string; answer?: string; at: number },
): Recipe[] {
  const key = normalise(entry.prompt);
  const existing = recipes.find((r) => r.key === key);
  if (existing) {
    existing.approach = entry.approach;
    existing.role = entry.role;
    if (entry.answer !== undefined) existing.answer = entry.answer;
    return recipes;
  }
  return [
    ...recipes,
    {
      key,
      terms: terms(entry.prompt),
      role: entry.role,
      approach: entry.approach,
      ...(entry.answer !== undefined ? { answer: entry.answer } : {}),
      hits: 0,
      learnedAt: entry.at,
    },
  ];
}

/** Marks a recipe as used, so it is visible which ones are earning their keep. */
export function creditRecipe(recipes: Recipe[], key: string, at: number): Recipe[] {
  const found = recipes.find((r) => r.key === key);
  if (found) {
    found.hits += 1;
    found.lastUsedAt = at;
  }
  return recipes;
}
