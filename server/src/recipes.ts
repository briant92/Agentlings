import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sameInputShape } from './inputshape';
import { sameSurface } from './capability';

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
  /**
   * What the run that wrote this method could do, as capability tokens.
   *
   * A method is only as good as what was available when it was found. Measured
   * on 2026-08-01: a job solved with `fetch_page` banked a recipe, and the next
   * run of the same shape — with a browser newly switched on — matched that
   * recipe, took the five-turn leash, followed the method and never discovered
   * the browser at all. Every part worked as designed, and the crew was
   * thereby unable to notice it had grown.
   *
   * Absent means a recipe written before this was recorded: provenance
   * unknown, which is treated as changed rather than assumed to match.
   */
  capabilities?: string[];
  /**
   * The shape of the files the method was learned over (D-221) — one
   * sentence over two kinds of file is two recipes, each banking its own
   * approach, never overwriting the other's. Absent means learned before
   * shapes were recorded, or learned with no files: it matches a job with
   * none and never a job with some, the unknown-provenance rule above.
   */
  inputShape?: string[];
  /**
   * Every tool the runs of this method actually called, accumulated across
   * them — what it *used*, against `capabilities`' what it *could reach*.
   *
   * The union rather than the latest, and the two fields differ on purpose.
   * `capabilities` is a fact about the present: what was available when the
   * method was last learned, which is why a moved surface demotes a recipe
   * (D-036). This is evidence, and evidence accumulates — a method that ever
   * needed the code host needs it, however many later runs happened not to
   * reach for it. Under-claiming here would let the compile gate approve a
   * script that cannot exist, which is the one thing D-044 was built to stop.
   *
   * Absent means every run of this method predates the recording (D-100), so
   * the gate falls back to the surface and behaves exactly as it did before.
   */
  usedTools?: string[];
  hits: number;
  /**
   * Times a run using this recipe actually landed. Separate from `hits`
   * because most runs that use a recipe die on their leash — a recipe used ten
   * times and never once successful is not a candidate for anything.
   */
  successes?: number;
  /**
   * Times a run using this method finished inside its turn budget *and* left
   * something behind.
   *
   * Separate from `successes`, and the gap between them is the point.
   * `successes` asks whether the method gets the job done, because three of
   * those compile it into a script — so it counts a dying run that left a
   * correct patch, since the work was done and only the write-up was cut.
   * This asks whether the job *fits*, which is a different question and the
   * only one the leash should be asked.
   *
   * Measured on job 3c031419: three runs of a gathering-bound job, each of
   * which delivered a real spreadsheet and each of which was killed on its
   * last turn. Gating the leash on `successes` locked it out permanently —
   * a no-repo run that dies never credits one, whatever it produced — while
   * the same job with a repository would have earned the leash from a patch
   * without ever finishing. Two shapes, two bars, inherited rather than
   * chosen. (D-064, D-065)
   */
  completions?: number;
  /**
   * Turns the completing run was *granted*, not the count the SDK reported —
   * a run capped at 33 came back saying 40, and reasoning on the reported
   * number has already been wrong once (D-022, D-052).
   *
   * The upper bound on what this job needs, and the only evidence that could
   * ever support cutting it to a five-turn leash. Recorded from the shortest
   * completing run, because a job proved achievable in 33 turns and again in
   * 12 needs 12 — and from the tighter of what that run was *granted* and what
   * it actually *did*, since a generous grant it finished well inside says
   * nothing about the need (see `creditRecipe`).
   */
  completedInTurns?: number;
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

/**
 * Parsed recipes of each level, kept between calls.
 *
 * `quoteFor_` re-reads this on every plan keystroke. Keyed on mtime and size,
 * so a rewrite is seen on the next call and a file that has not moved is
 * never parsed twice. No clock staleness: recipes do not go stale by age.
 *
 * The array is shared between calls; readers must not write into it.
 * `updateRecipes` copies before handing the array to `mutate`. `writeRecipes`
 * drops the entry, so a same-size counter bump in the same tick is seen.
 */
const held = new Map<string, { mtimeMs: number; size: number; recipes: Recipe[] }>();

export function readRecipes(levelDir: string): Recipe[] {
  const file = recipesFile(levelDir);
  let stat;
  try {
    stat = statSync(file);
  } catch {
    held.delete(levelDir);
    return [];
  }
  const have = held.get(levelDir);
  if (have && have.mtimeMs === stat.mtimeMs && have.size === stat.size) return have.recipes;
  try {
    const stored = JSON.parse(readFileSync(file, 'utf8')) as Recipe[];
    // Terms are derived from the key, never trusted from disk. They are only a
    // cache of `terms(key)`, so a change to how words are stemmed would
    // otherwise silently strand every recipe written before it — recomputing
    // on the way in means that migration never has to be written.
    const recipes = stored.map((r) => ({ ...r, terms: terms(r.key) }));
    held.set(levelDir, { mtimeMs: stat.mtimeMs, size: stat.size, recipes });
    return recipes;
  } catch {
    held.delete(levelDir);
    return [];
  }
}

export function writeRecipes(levelDir: string, recipes: Recipe[]): void {
  mkdirSync(levelDir, { recursive: true });
  writeFileSync(recipesFile(levelDir), JSON.stringify(recipes, null, 2));
  held.delete(levelDir);
}

/**
 * Apply a change to the recipes on disk, against what is on disk *now*.
 *
 * The counters were read once at the start of a run and written back at the
 * end of it, so a second job finishing in between had its increments erased —
 * a whole session's window in which to lose someone else's work. Harmless
 * while the counters were bookkeeping; not harmless since, because they decide
 * whether a run is leashed (D-095) and whether a recipe can be compiled at all
 * (D-021's three successes). A lost `successes` is a tool that never gets
 * built, and a lost `completedInTurns` is a leash that arms on the wrong
 * number.
 *
 * Re-reading here closes it completely rather than narrowly: the read, the
 * change and the write are one synchronous block, and the runtime is single
 * threaded, so no other job can interleave inside it. What the caller decided
 * from its own snapshot still stands — the decision was made on what the run
 * could see — but what it *records* lands on top of everything since.
 *
 * A run may have more than one thing to record, so `mutate` takes them all at
 * once: the array it is handed is the fresh one, and both `creditRecipe` and
 * `rememberRecipe` are happy to work on it in turn.
 */
export function updateRecipes(levelDir: string, mutate: (recipes: Recipe[]) => Recipe[]): Recipe[] {
  const next = mutate(readRecipes(levelDir).map((r) => ({ ...r })));
  writeRecipes(levelDir, next);
  return next;
}

/**
 * The best recipe for a prompt: an exact repeat first, then the same shape.
 *
 * `strong` says whether the match is good enough to shorten the run, not
 * merely good enough to hand over the method. An exact repeat is always
 * strong; anything else has to earn it.
 */
/**
 * Whether a recipe was written under the capability surface this job has now.
 *
 * Any difference counts, in either direction: a method that used something
 * since taken away is actively wrong, and a method written without something
 * that now exists may simply be beaten. Neither is a reason to throw the
 * method away — only a reason to stop treating it as settled.
 */
export function sameCapabilities(recipe: Recipe, capabilities: string[] | undefined): boolean {
  return sameSurface(recipe.capabilities, capabilities);
}

/**
 * Whether a recipe may cut the run's budget, as against merely lend its method.
 *
 * Two conditions. The surface must match, for the reason above. And some run
 * using this method must have *landed*: an approach is evidence that work is
 * repeatable only once a run has actually repeated it.
 *
 * Job 306e415e bought the second one. A gathering-bound job ran out of its ten
 * turns having delivered a partial table, banked its approach, and matched
 * itself exactly on the next request — which, gated on the surface alone, would
 * have handed it *five* turns to do what it had just failed to do in ten. The
 * two-bar logic (D-019, D-023) prices the two mistakes correctly but assumes a
 * recipe saves *exploring*. This job's turns went on gathering, and knowing the
 * method does not gather anything.
 *
 * `completions`, and not `successes`, which this was gated on for one day and
 * which was the wrong counter — collapsing two questions that only sound alike,
 * in the entry that warned against doing exactly that. `successes` asks whether
 * the method gets the job done, and counts a dying run that left a correct
 * patch. The leash is asking whether the job *fits its budget*, and a run that
 * had to be killed has answered no however good its output was. Measured: three
 * runs of job 3c031419 each delivered and each died, which under `successes`
 * meant a no-repo job could never earn the leash at all while the same work
 * with a repository earned it without ever finishing. (D-065)
 *
 * It costs the leash exactly one outing: a hint-only match still credits the
 * recipe, so a method that does fit is leashed on its third run rather than its
 * second. The tier's own history — 21 leashed runs failed against 8 delivered —
 * is the argument for buying that evidence first.
 */
/**
 * The most turns a completing run may have needed for the leash to still be a
 * *shortening* of that run rather than a different job altogether.
 *
 * Was twice the leash, and said so plainly: chosen without data, on the guess
 * that a run finishing in 8 turns might well do it in 5 once the exploring is
 * handed over. It asked to be refined by leashed outcomes paired against this
 * field, which is why the field was recorded. Four such outcomes now exist and
 * they separate at the leash itself, not at twice it:
 *
 * - completed leashed: T4·3, recorded at 4 — the only leashed completion the
 *   engine has ever had.
 * - cut at the wall: T2·4 (6), T3·4 (8), T6·3 (6). Each was granted 5 while
 *   its own record said it needed more, and each was cut, delivered anyway
 *   and absorbed.
 *
 * So the bound is the leash's own budget: a run may be shortened to five turns
 * only once it has completed inside five. Anything looser is not a shortening,
 * it is a different, smaller job — and the recipe's own `completedInTurns`
 * was sitting there saying so each of the three times (D-095).
 *
 * Written out rather than derived from `RECIPE_TURNS`, which lives in the
 * executor: importing it here closes a cycle — `claude.ts` imports `router.ts`
 * imports this file — and the module then initialises half-built. A test holds
 * the two in step instead, since a test file is a leaf and can import both.
 */
export const LEASH_CREDIBLE_UP_TO = 5;

export function canShortenLeash(recipe: Recipe, capabilities: string[] | undefined): boolean {
  if (!sameCapabilities(recipe, capabilities)) return false;
  if ((recipe.completions ?? 0) < 1) return false;
  // Having fitted *some* budget is not evidence of fitting this one. Measured
  // on job 653f8c2e: it completed in 33 turns, which opened this gate and would
  // have handed the next run five — firm, so the quote could not rescue it, and
  // permanently, since it would then never complete again. The third time in
  // one day that a gate verifying one thing was read as licensing another
  // (D-064, D-065, D-068).
  const needed = recipe.completedInTurns;
  return needed === undefined || needed <= LEASH_CREDIBLE_UP_TO;
}

export function findRecipe(
  recipes: Recipe[],
  prompt: string,
  capabilities?: string[],
  /** The job's attachment shape (D-221); only a recipe of the same shape is a match at all. */
  inputShape?: string[],
): { recipe: Recipe; exact: boolean; strong: boolean } | null {
  const key = normalise(prompt);
  // Not a demotion but a refusal: a method learned over one kind of file is
  // no hint for another — the trial that forced this watched one sentence's
  // approach rewritten toward each counterpart in turn (D-221).
  const candidates = recipes.filter((r) => sameInputShape(r.inputShape, inputShape));
  const exact = candidates.find((r) => r.key === key);
  if (exact) return { recipe: exact, exact: true, strong: canShortenLeash(exact, capabilities) };

  const wanted = terms(prompt);
  const corpus = recipes.map((r) => r.terms);
  let best: Recipe | null = null;
  let bestScore = 0;
  for (const recipe of candidates) {
    const score = similarity(wanted, recipe.terms, corpus);
    if (score > bestScore) {
      best = recipe;
      bestScore = score;
    }
  }
  if (!best || bestScore < WORTH_A_HINT) return null;
  // A capability change demotes a strong match to a weak one rather than
  // discarding it, which is D-020's asymmetry applied to a second axis: handing
  // over a stale method costs a full-length run one turn it can ignore, while
  // handing it over *and* cutting the leash costs the whole run — and here it
  // also costs the chance to find the better way.
  return {
    recipe: best,
    exact: false,
    strong: bestScore >= SIMILAR_ENOUGH && canShortenLeash(best, capabilities),
  };
}

/**
 * Records what was learned. An existing recipe for the same prompt is updated
 * rather than duplicated, so the file tracks the crew rather than growing.
 */
export function rememberRecipe(
  recipes: Recipe[],
  entry: {
    prompt: string;
    role: string;
    approach: string;
    answer?: string;
    at: number;
    capabilities?: string[];
    /** Tools this run actually called, unioned into what the method has used. */
    usedTools?: string[];
    /** The shape of the files the run was given (D-221). */
    inputShape?: string[];
  },
): Recipe[] {
  const key = normalise(entry.prompt);
  // Recorded on update as well as on create, so a recipe re-learned under new
  // capabilities stops being demoted after one full-length run rather than for
  // ever. It is also how every recipe written before this field heals itself.
  const capabilities = entry.capabilities ? [...entry.capabilities].sort() : undefined;
  /** Accumulated, never replaced — see `usedTools` on the Recipe (D-100). */
  const union = (before: string[] | undefined): string[] | undefined => {
    const all = [...(before ?? []), ...(entry.usedTools ?? [])];
    return all.length > 0 ? [...new Set(all)].sort() : undefined;
  };
  // The same sentence over a different shape is a different recipe (D-221).
  const existing = recipes.find(
    (r) => r.key === key && sameInputShape(r.inputShape, entry.inputShape),
  );
  if (existing) {
    existing.approach = entry.approach;
    existing.role = entry.role;
    existing.capabilities = capabilities;
    const used = union(existing.usedTools);
    if (used) existing.usedTools = used;
    if (entry.answer !== undefined) existing.answer = entry.answer;
    return recipes;
  }
  const used = union(undefined);
  return [
    ...recipes,
    {
      key,
      terms: terms(entry.prompt),
      role: entry.role,
      approach: entry.approach,
      ...(capabilities ? { capabilities } : {}),
      ...(entry.inputShape ? { inputShape: [...entry.inputShape].sort() } : {}),
      ...(used ? { usedTools: used } : {}),
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
  /** Landed *and* got there inside its turns — what the leash is gated on. */
  fitted = false,
  /** Turns that run was granted. Only meaningful when it `fitted`. */
  turnsAllowed?: number,
  /** Tool calls it actually made — the tighter bound of the two. */
  toolCalls?: number,
  /**
   * Turns a *leashed* run was granted before the wall cut it. The one thing a
   * cut run testifies to, and the only revision D-095 allows it to make.
   */
  leashCutFrom?: number,
  /** The shape of the job that ran, so the credit lands on its own recipe and not a namesake (D-221). */
  inputShape?: string[],
): Recipe[] {
  const found = recipes.find((r) => r.key === key && sameInputShape(r.inputShape, inputShape));
  if (found) {
    found.hits += 1;
    found.lastUsedAt = at;
    if (landed) found.successes = (found.successes ?? 0) + 1;
    if (fitted) {
      found.completions = (found.completions ?? 0) + 1;
      // Two upper bounds on what the job needs, and the tighter one wins.
      //
      // The grant alone only ever ratchets down on grants: job 8ab9b070 was
      // given 40, finished on 24 calls, and left the bound sitting at 33
      // because 33 was simply the smaller allowance. `toolCalls + 1` is what
      // the run *did*, and it reproduces the SDK's own turn count exactly — 5
      // of 5 completing rows on this machine — while being counted by us, so
      // it survives a run the SDK never reports on (D-052).
      const bounds = [turnsAllowed, toolCalls === undefined ? undefined : toolCalls + 1].filter(
        (n): n is number => typeof n === 'number' && n >= 1,
      );
      // The shortest completion, not the latest: a job proved achievable in 33
      // turns and again in 12 needs 12, and taking the latest would let one
      // generously-budgeted run undo what a tighter one established.
      if (bounds.length > 0) {
        found.completedInTurns = Math.min(found.completedInTurns ?? Infinity, ...bounds);
      }
    }
    // The leash learning it was wrong — the one revision a cut run may make.
    //
    // D-068 refused to let a cut run touch these counters, and was right about
    // the two it named: a run that was killed has not completed, and its
    // output does not say the job fits. But it left the leash unable to
    // un-learn, and the loop that opens is real — measured three times, most
    // recently on T6·3, where a recipe was leashed, cut, delivered anyway,
    // charged $0, credited nothing, and stayed armed to do it again forever.
    // Because a cut run credits neither counter, that recipe could also never
    // reach `TOOL_CANDIDATE_RUNS`: the leash had quietly made the tool tier
    // unreachable for exactly the jobs it grabbed.
    //
    // What a cut leashed run *does* prove is one fact, and only in one
    // direction: the job needs more turns than it was given. So this raises a
    // lower bound and never credits anything — no `successes`, no
    // `completions`, nothing that could compile a tool or claim a fit. A later
    // run that genuinely completes inside a shorter budget still pulls the
    // bound back down through the `Math.min` above, because that is evidence
    // of the opposite and outranks a bound inferred from a failure (D-095).
    if (typeof leashCutFrom === 'number' && leashCutFrom >= 1) {
      found.completedInTurns = Math.max(found.completedInTurns ?? 0, leashCutFrom + 1);
    }
  }
  return recipes;
}
