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
