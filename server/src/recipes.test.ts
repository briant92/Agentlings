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

  it('keeps only the words that carry meaning', () => {
    expect(terms('Please total the invoices in the spreadsheet')).toEqual([
      'total',
      'invoices',
      'spreadsheet',
    ]);
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
      terms: ['total', 'invoices'],
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
