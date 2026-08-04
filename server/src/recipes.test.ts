import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  creditRecipe,
  findRecipe,
  normalise,
  readRecipes,
  rememberRecipe,
  similarity,
  terms,
  writeRecipes,
  type Recipe,
} from './recipes';

describe('normalise and terms', () => {
  it('ignores casing and spacing so the same request matches itself', () => {
    expect(normalise('  Total  The Invoices ')).toBe('total the invoices');
  });

  it('keeps only the words that carry meaning, stemmed so plurals still match', () => {
    // The plural and the singular have to land on the same word, or the same
    // job looks like a different one — which is what they measured at 0.33.
    expect(terms('Please total the invoices in the spreadsheet')).toEqual([
      'total',
      'invoice',
      'spreadsheet',
    ]);
    expect(terms('total the invoice')).toContain('invoice');
    expect(terms('add tests for it')).toEqual(terms('add a test for it'));
  });
});

describe('similarity', () => {
  it('is 1 for the same words and 0 for none in common', () => {
    expect(similarity(['a', 'b'], ['b', 'a'])).toBe(1);
    expect(similarity(['a'], ['b'])).toBe(0);
    expect(similarity([], ['a'])).toBe(0);
  });

  it('falls as the requests diverge', () => {
    expect(similarity(['total', 'invoices'], ['total', 'invoices', 'quarterly', 'board'])).toBeLessThan(0.6);
  });
});

describe('findRecipe', () => {
  const recipes: Recipe[] = [
    {
      key: 'total the invoices',
      terms: terms('total the invoices'),
      role: 'analyst',
      approach: 'sum column D',
      hits: 0,
      successes: 1,
      completions: 1,
      capabilities: [],
      learnedAt: 1,
    },
  ];

  it('finds an exact repeat and says so', () => {
    const found = findRecipe(recipes, 'Total the invoices');
    expect(found?.exact).toBe(true);
  });

  it('finds the same shape of job without calling it exact', () => {
    const found = findRecipe(recipes, 'total the invoices again');
    expect(found?.exact).toBe(false);
    expect(found?.recipe.approach).toBe('sum column D');
  });

  it('finds nothing for an unrelated request', () => {
    expect(findRecipe(recipes, 'write the board report')).toBeNull();
  });
});

describe('rememberRecipe', () => {
  it('stores the approach, and the answer only when it was offered', () => {
    const withAnswer = rememberRecipe([], {
      prompt: 'total the invoices',
      role: 'analyst',
      approach: 'sum column D',
      answer: 'total is 12',
      at: 5,
    });
    expect(withAnswer[0]).toMatchObject({ approach: 'sum column D', answer: 'total is 12' });

    const without = rememberRecipe([], {
      prompt: 'check the repo',
      role: 'mason',
      approach: 'run the tests',
      at: 5,
    });
    expect(without[0].answer).toBeUndefined();
  });

  it('updates the same request rather than piling up duplicates', () => {
    let recipes = rememberRecipe([], {
      prompt: 'total the invoices',
      role: 'analyst',
      approach: 'old way',
      at: 1,
    });
    recipes = rememberRecipe(recipes, {
      prompt: 'Total the Invoices',
      role: 'analyst',
      approach: 'better way',
      at: 2,
    });
    expect(recipes).toHaveLength(1);
    expect(recipes[0].approach).toBe('better way');
  });
});

describe('creditRecipe', () => {
  it('counts a use so it is visible which recipes earn their keep', () => {
    const recipes = rememberRecipe([], {
      prompt: 'x',
      role: 'worker',
      approach: 'y',
      at: 1,
    });
    const credited = creditRecipe(recipes, 'x', 99);
    expect(credited[0]).toMatchObject({ hits: 1, lastUsedAt: 99 });
  });
});

describe('persistence', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-recipes-'));
  });
  // rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
  afterEach(() =>
    rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  it('survives a round trip', () => {
    const recipes = rememberRecipe([], {
      prompt: 'total the invoices',
      role: 'analyst',
      approach: 'sum column D',
      at: 1,
    });
    writeRecipes(dir, recipes);
    expect(readRecipes(dir)[0].approach).toBe('sum column D');
  });

  it('starts empty rather than throwing when there is nothing yet', () => {
    expect(readRecipes(dir)).toEqual([]);
  });
});

describe('matching strength', () => {
  const recipes: Recipe[] = [
    {
      key: 'add a test for the estimate module',
      terms: terms('add a test for the estimate module'),
      role: 'worker',
      approach: 'read the module, then write the test beside it',
      hits: 0,
      successes: 1,
      completions: 1,
      capabilities: [],
      learnedAt: 1,
    },
  ];

  // The pair that started this: measured at 0.33 against a 0.65 bar, so the
  // crew never recognised its own work. It still is not a strong match, and
  // that is the point — it is now good enough to be worth the method.
  it('calls a differently-worded version of the same job worth a hint', () => {
    const found = findRecipe(recipes, 'write tests for the estimate module');
    expect(found).not.toBeNull();
    expect(found?.strong).toBe(false);
    expect(found?.recipe.approach).toContain('read the module');
  });

  it('still calls a proven exact repeat strong', () => {
    expect(findRecipe(recipes, 'Add a test for the estimate module', [])?.strong).toBe(true);
  });

  it('finds nothing at all for unrelated work', () => {
    expect(findRecipe(recipes, 'book a table for dinner')).toBeNull();
  });
});

/**
 * Job 306e415e: a gathering-bound run exhausted its ten turns having delivered
 * a partial table, banked its approach, and matched itself exactly next time —
 * which, gated on the capability surface alone, would have given it five turns
 * to do what it had just failed to do in ten.
 *
 * A method earns the leash by having worked, not by existing.
 */
describe('a method has to have fitted before it may shorten the run', () => {
  const unproven: Recipe = {
    key: 'summarise this month indicators',
    terms: terms('summarise this month indicators'),
    role: 'worker',
    approach: 'check each agency calendar first',
    hits: 0,
    capabilities: [],
    learnedAt: 1,
  };
  const prompt = 'Summarise this month indicators';

  it('lends the method of a recipe nobody has finished on yet', () => {
    const found = findRecipe([unproven], prompt, []);
    expect(found?.recipe.approach).toContain('agency calendar');
  });

  it('but does not let it cut the budget', () => {
    expect(findRecipe([unproven], prompt, [])?.strong).toBe(false);
  });

  it('leashes it once a run using it finished inside its turns', () => {
    const fitted = { ...unproven, hits: 1, successes: 1, completions: 1 };
    expect(findRecipe([fitted], prompt, [])?.strong).toBe(true);
  });

  // Being used is not the same as having worked.
  it('counts completions, not outings', () => {
    const used = { ...unproven, hits: 4, completions: 0 };
    expect(findRecipe([used], prompt, [])?.strong).toBe(false);
  });

  /**
   * The regression test for a real mistake: this gate was `successes` for one
   * day, which is the counter that decides whether a method compiles into a
   * script. That one counts a dying run that left a correct patch — right for
   * "does the method work", wrong for "does the job fit". Job 3c031419
   * delivered a spreadsheet three times and was killed three times, so under
   * `successes` a no-repo job could never earn the leash while the same work
   * with a clone earned it without ever finishing. (D-065)
   */
  it('does not leash a method that delivers and never fits', () => {
    const delivers = { ...unproven, hits: 3, successes: 3, completions: 0 };
    expect(findRecipe([delivers], prompt, [])?.strong).toBe(false);
  });

  // Both conditions bind independently — a method that fits, under a surface
  // that has since moved, is still demoted. That is the older rule.
  it('still defers to a capability surface that has moved', () => {
    const fitted = { ...unproven, completions: 3, capabilities: ['conn:web'] };
    expect(findRecipe([fitted], prompt, ['conn:web', 'conn:search'])?.strong).toBe(false);
  });
});

/**
 * Job 653f8c2e completed in 33 turns, which opened the completions gate and
 * would have handed the next run of the same sentence five — firm, so the
 * quote could not rescue it, and for ever, since it would then never complete
 * again. Fitting *some* budget is not evidence of fitting this one (D-068).
 */
describe('a leash has to be a shortening, not a different job', () => {
  const base: Recipe = {
    key: 'summarise this month indicators',
    terms: terms('summarise this month indicators'),
    role: 'worker',
    approach: 'check each agency calendar first',
    hits: 2,
    successes: 1,
    completions: 1,
    capabilities: [],
    learnedAt: 1,
  };
  const prompt = 'Summarise this month indicators';

  it('refuses the leash when the job has been shown to need far more', () => {
    const long = { ...base, completedInTurns: 33 };
    expect(findRecipe([long], prompt, [])?.strong).toBe(false);
    // The method still goes over — it is the budget that is withheld.
    expect(findRecipe([long], prompt, [])?.recipe.approach).toContain('agency calendar');
  });

  it('allows it when the completing run was within reach of the leash', () => {
    expect(findRecipe([{ ...base, completedInTurns: 8 }], prompt, [])?.strong).toBe(true);
    expect(findRecipe([{ ...base, completedInTurns: 10 }], prompt, [])?.strong).toBe(true);
  });

  it('refuses one turn past the bound, so the edge is a decision not an accident', () => {
    expect(findRecipe([{ ...base, completedInTurns: 11 }], prompt, [])?.strong).toBe(false);
  });

  // Absent means the recipe predates the field. Those keep the old behaviour
  // rather than being demoted: the field could not be backfilled, and refusing
  // every recipe written before today would silently retire the tier.
  it('leaves a recipe written before the field was recorded alone', () => {
    expect(findRecipe([base], prompt, [])?.strong).toBe(true);
  });
});

describe('creditRecipe records what a completion cost in turns', () => {
  const seed = () =>
    rememberRecipe([], { prompt: 'x', role: 'worker', approach: 'y', at: 1 });

  it('records the granted turns of a run that fitted', () => {
    const out = creditRecipe(seed(), 'x', 2, true, true, 33);
    expect(out[0]).toMatchObject({ completions: 1, completedInTurns: 33 });
  });

  // A run that delivered but was killed proves nothing about what the job
  // needs — it never finished, so its cap is not an upper bound on anything.
  it('records nothing for a run that delivered but did not fit', () => {
    const out = creditRecipe(seed(), 'x', 2, true, false, 10);
    expect(out[0].completedInTurns).toBeUndefined();
    expect(out[0].completions).toBeUndefined();
  });

  // The shortest, not the latest: a job proved achievable in 12 needs 12, and
  // a later generously-budgeted run must not undo that.
  it('keeps the shortest completion rather than the most recent', () => {
    let out = creditRecipe(seed(), 'x', 2, true, true, 12);
    out = creditRecipe(out, 'x', 3, true, true, 33);
    expect(out[0].completedInTurns).toBe(12);
    expect(out[0].completions).toBe(2);
  });
});

/**
 * Measured on 2026-08-01 and the reason this exists: a job solved with
 * `fetch_page` banked a recipe; the next run of the same shape, with a browser
 * newly switched on, matched that recipe, took the five-turn leash, followed
 * the method and never tried the browser. Every part worked as designed, and
 * the crew could not notice it had grown.
 */
describe('a method is only as good as what was available when it was found', () => {
  const base = {
    key: 'read the reddit programming page',
    terms: terms('read the reddit programming page'),
    role: 'scout',
    approach: 'fetch the old.reddit mirror, it is server-rendered',
    hits: 3,
    successes: 1,
    completions: 1,
    learnedAt: 1,
  };
  const prompt = 'Read the reddit programming page';

  it('shortens the run when the crew can reach exactly what it could before', () => {
    const found = findRecipe([{ ...base, capabilities: ['conn:web'] }], prompt, ['conn:web']);
    expect(found?.strong).toBe(true);
  });

  it('stops shortening it the moment a new capability appears', () => {
    const found = findRecipe([{ ...base, capabilities: ['conn:web'] }], prompt, ['conn:browser', 'conn:web']);
    expect(found?.strong).toBe(false);
    // The method is still handed over — demoted, not discarded.
    expect(found?.recipe.approach).toContain('old.reddit');
  });

  it('stops too when a capability it relied on is taken away', () => {
    expect(findRecipe([{ ...base, capabilities: ['conn:web'] }], prompt, [])?.strong).toBe(false);
  });

  it('does not care what order the connections arrive in', () => {
    const r = { ...base, capabilities: ['conn:browser', 'conn:web'] };
    expect(findRecipe([r], prompt, ['conn:browser', 'conn:web'])?.strong).toBe(true);
  });

  // Absent means written before this was recorded. Unknown provenance is
  // treated as changed, so every existing recipe is demoted exactly once and
  // then re-banked with its capabilities by the run that follows.
  it('treats a recipe of unknown provenance as changed', () => {
    expect(findRecipe([base], prompt, ['conn:web'])?.strong).toBe(false);
    expect(findRecipe([base], prompt, [])?.strong).toBe(false);
  });

  it('heals itself: re-learning records what the run could reach', () => {
    const relearned = rememberRecipe([{ ...base }], {
      prompt,
      role: 'scout',
      approach: 'use the browser, the mirror is gone',
      at: 2,
      capabilities: ['conn:web', 'conn:browser'],
    });
    expect(relearned[0].capabilities).toEqual(['conn:browser', 'conn:web']);
    expect(findRecipe(relearned, prompt, ['conn:browser', 'conn:web'])?.strong).toBe(true);
  });
});

describe('similarity weighting', () => {
  const corpus = (n: number): string[][] =>
    Array.from({ length: n }, () => ['file', 'module']);

  // Rarity is only a claim worth making once there is something to compare
  // against. With one recipe on file every word it uses looks maximally
  // common, which weighs down the shared words — the entire signal.
  it('ignores rarity until the corpus is big enough to have any', () => {
    const small = similarity(['file', 'module'], ['file', 'module'], corpus(2));
    expect(small).toBe(1);
  });

  it('counts a rare word for more than a common one', () => {
    const common = similarity(['file'], ['file', 'estimate'], corpus(6));
    const rare = similarity(['estimate'], ['file', 'estimate'], corpus(6));
    expect(rare).toBeGreaterThan(common);
  });
});

describe('successes, kept apart from uses', () => {
  const one = () => rememberRecipe([], { prompt: 'x', role: 'worker', approach: 'y', at: 1 });

  it('does not count a run that died as a success', () => {
    const credited = creditRecipe(one(), 'x', 99);
    expect(credited[0].hits).toBe(1);
    expect(credited[0].successes ?? 0).toBe(0);
  });

  it('counts one that landed', () => {
    const credited = creditRecipe(one(), 'x', 99, true);
    expect(credited[0]).toMatchObject({ hits: 1, successes: 1 });
  });
});
