import { mkdtempSync, rmSync } from 'node:fs';
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
      tools: [],
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
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

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
      tools: [],
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

  it('still calls an exact repeat strong', () => {
    expect(findRecipe(recipes, 'Add a test for the estimate module')?.strong).toBe(true);
  });

  it('finds nothing at all for unrelated work', () => {
    expect(findRecipe(recipes, 'book a table for dinner')).toBeNull();
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
    learnedAt: 1,
  };
  const prompt = 'Read the reddit programming page';

  it('shortens the run when the crew can reach exactly what it could before', () => {
    const found = findRecipe([{ ...base, tools: ['web'] }], prompt, ['web']);
    expect(found?.strong).toBe(true);
  });

  it('stops shortening it the moment a new capability appears', () => {
    const found = findRecipe([{ ...base, tools: ['web'] }], prompt, ['browser', 'web']);
    expect(found?.strong).toBe(false);
    // The method is still handed over — demoted, not discarded.
    expect(found?.recipe.approach).toContain('old.reddit');
  });

  it('stops too when a capability it relied on is taken away', () => {
    expect(findRecipe([{ ...base, tools: ['web'] }], prompt, [])?.strong).toBe(false);
  });

  it('does not care what order the connections arrive in', () => {
    const r = { ...base, tools: ['browser', 'web'] };
    expect(findRecipe([r], prompt, ['web', 'browser'])?.strong).toBe(true);
  });

  // Absent means written before this was recorded. Unknown provenance is
  // treated as changed, so every existing recipe is demoted exactly once and
  // then re-banked with its capabilities by the run that follows.
  it('treats a recipe of unknown provenance as changed', () => {
    expect(findRecipe([base], prompt, ['web'])?.strong).toBe(false);
    expect(findRecipe([base], prompt, [])?.strong).toBe(false);
  });

  it('heals itself: re-learning records what the run could reach', () => {
    const relearned = rememberRecipe([{ ...base }], {
      prompt,
      role: 'scout',
      approach: 'use the browser, the mirror is gone',
      at: 2,
      tools: ['web', 'browser'],
    });
    expect(relearned[0].tools).toEqual(['browser', 'web']);
    expect(findRecipe(relearned, prompt, ['browser', 'web'])?.strong).toBe(true);
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
