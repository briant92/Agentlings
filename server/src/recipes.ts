import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  /**
   * Times a run using this recipe actually landed. Separate from `hits`
   * because most runs that use a recipe die on their leash — a recipe used ten
   * times and never once successful is not a candidate for anything.
   */
  successes?: number;
  learnedAt: number;
  lastUsedAt?: number;
}

/**
 * Successful runs before a recipe is worth compiling into a tool that runs for
 * nothing. Not enforced anywhere yet: reaching it only writes a line to
 * tool-candidates.jsonl, so the question "is a fourth tier worth building"
 * gets answered by counting rather than by guessing. Promotion costs about a
 * session and saves a fraction of one per reuse, so it pays back somewhere
 * around the third or fifth use — and the honest starting position is that
 * this machine has seen almost no repeat work at all.
 */
export const TOOL_CANDIDATE_RUNS = 3;

export function toolCandidatesFile(levelDir: string): string {
  return path.join(levelDir, 'tool-candidates.jsonl');
}

/** Records that a job could have been served by a compiled tool, had one existed. */
export function noteToolCandidate(
  levelDir: string,
  entry: { at: number; jobId: string; prompt: string; recipeKey: string; successes: number },
): void {
  mkdirSync(levelDir, { recursive: true });
  appendFileSync(toolCandidatesFile(levelDir), `${JSON.stringify(entry)}\n`);
}

export function readToolCandidates(levelDir: string): unknown[] {
  const file = toolCandidatesFile(levelDir);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
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

/**
 * Crudely strips the endings that made the same job look like a different one:
 * measured, "write a test file for the estimate module" and "add tests for the
 * estimate module" scored 0.33, and `test`/`tests` was part of why.
 *
 * Deliberately not a real stemmer. It only has to be *consistent* — "address"
 * becoming "addres" costs nothing as long as it happens on both sides.
 */
export function stem(word: string): string {
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  // A single trailing s, and deliberately not "es": stripping that turned
  // "invoices" into "invoic" while "invoice" stayed whole, so the pair stopped
  // matching — the opposite of the point. One rule that leaves both as
  // "invoice" beats three that are cleverer and disagree.
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

export function terms(text: string): string[] {
  return [
    ...new Set(
      normalise(text)
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
        .map(stem),
    ),
  ];
}

/** Recipes needed before "this word is rare" is a claim worth making. */
export const RARITY_NEEDS = 5;

/**
 * Shared content words over the union — 1 means the same words entirely.
 *
 * With a corpus, words are weighted by how rare they are across it: two jobs
 * both mentioning "estimate" are far better evidence of the same work than two
 * both mentioning "file". Without one every word weighs the same, which is
 * what this did before.
 */
export function similarity(a: string[], b: string[], corpus: string[][] = []): number {
  if (a.length === 0 || b.length === 0) return 0;
  // Rarity is meaningless in a small corpus, and worse than meaningless: with
  // one recipe on file every word it uses appears in *every* document, so the
  // shared words — the whole signal — get weighed down to nothing and a job
  // stops matching itself. Below the threshold every word counts the same.
  const weighted = corpus.length >= RARITY_NEEDS;
  const weight = (term: string): number =>
    weighted ? 1 / (1 + corpus.filter((doc) => doc.includes(term)).length) : 1;
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  let union = 0;
  for (const term of new Set([...a, ...b])) {
    const w = weight(term);
    union += w;
    if (left.has(term) && right.has(term)) shared += w;
  }
  return union === 0 ? 0 : shared / union;
}

/** High enough that "the same job again" matches and a new question doesn't. */
export const SIMILAR_ENOUGH = 0.65;
/**
 * Enough to hand over the method, not enough to shorten the leash.
 *
 * The two bars exist because the two mistakes cost wildly different amounts. A
 * wrong approach given to a full-length session costs a turn or two and can be
 * ignored; the same wrong approach with the leash cut to three turns costs the
 * whole run. So a weak match buys the hint and nothing else.
 */
export const WORTH_A_HINT = 0.3;

export function recipesFile(levelDir: string): string {
  return path.join(levelDir, 'recipes.json');
}

export function readRecipes(levelDir: string): Recipe[] {
  const file = recipesFile(levelDir);
  if (!existsSync(file)) return [];
  try {
    const stored = JSON.parse(readFileSync(file, 'utf8')) as Recipe[];
    // Terms are derived from the key, never trusted from disk. They are only a
    // cache of `terms(key)`, so a change to how words are stemmed would
    // otherwise silently strand every recipe written before it — recomputing
    // on the way in means that migration never has to be written.
    return stored.map((r) => ({ ...r, terms: terms(r.key) }));
  } catch {
    return [];
  }
}

export function writeRecipes(levelDir: string, recipes: Recipe[]): void {
  mkdirSync(levelDir, { recursive: true });
  writeFileSync(recipesFile(levelDir), JSON.stringify(recipes, null, 2));
}

/**
 * The best recipe for a prompt: an exact repeat first, then the same shape.
 *
 * `strong` says whether the match is good enough to shorten the run, not
 * merely good enough to hand over the method. An exact repeat is always
 * strong; anything else has to earn it.
 */
export function findRecipe(
  recipes: Recipe[],
  prompt: string,
): { recipe: Recipe; exact: boolean; strong: boolean } | null {
  const key = normalise(prompt);
  const exact = recipes.find((r) => r.key === key);
  if (exact) return { recipe: exact, exact: true, strong: true };

  const wanted = terms(prompt);
  const corpus = recipes.map((r) => r.terms);
  let best: Recipe | null = null;
  let bestScore = 0;
  for (const recipe of recipes) {
    const score = similarity(wanted, recipe.terms, corpus);
    if (score > bestScore) {
      best = recipe;
      bestScore = score;
    }
  }
  if (!best || bestScore < WORTH_A_HINT) return null;
  return { recipe: best, exact: false, strong: bestScore >= SIMILAR_ENOUGH };
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

/**
 * Marks a recipe as used, so it is visible which ones are earning their keep.
 *
 * `landed` means the run *delivered*, not that it exited cleanly — a run that
 * wrote a correct diff and then ran out of turns describing it has proved the
 * job is repeatable, which is the only thing this count is asked to decide.
 * Counting clean exits instead scored two correct 129-line files as zero, and
 * did so in the worst possible direction: small jobs finish easily and get
 * promoted though a script cannot do them, while the big mechanical jobs a
 * script is *for* never finish on the leash and are never compiled.
 */
export function creditRecipe(
  recipes: Recipe[],
  key: string,
  at: number,
  landed = false,
): Recipe[] {
  const found = recipes.find((r) => r.key === key);
  if (found) {
    found.hits += 1;
    found.lastUsedAt = at;
    if (landed) found.successes = (found.successes ?? 0) + 1;
  }
  return recipes;
}
