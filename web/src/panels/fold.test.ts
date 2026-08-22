import { describe, expect, it } from 'vitest';
import { foldKey, foldOpen, page, setFold, type FoldStore } from './fold';

function store(): FoldStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('foldOpen', () => {
  it('starts from the default the panel gives it', () => {
    const s = store();
    expect(foldOpen(s, 'library', 'jobs', true)).toBe(true);
    expect(foldOpen(s, 'library', 'abilities', false)).toBe(false);
  });

  it('remembers what the user chose over the default', () => {
    const s = store();
    setFold(s, 'library', 'abilities', true);
    expect(foldOpen(s, 'library', 'abilities', false)).toBe(true);
    setFold(s, 'library', 'jobs', false);
    expect(foldOpen(s, 'library', 'jobs', true)).toBe(false);
  });

  it('keys per panel and per section, so two panels never share a fold', () => {
    const s = store();
    setFold(s, 'profile', 'memory', false);
    expect(foldOpen(s, 'settings', 'memory', true)).toBe(true);
    expect(foldKey('profile', 'memory')).not.toBe(foldKey('settings', 'memory'));
  });

  it('falls back to the default with no store, or a store that throws', () => {
    expect(foldOpen(null, 'a', 'b', true)).toBe(true);
    const broken: FoldStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(foldOpen(broken, 'a', 'b', false)).toBe(false);
    expect(() => setFold(broken, 'a', 'b', true)).not.toThrow();
  });
});

describe('page', () => {
  it('shows the first ten and counts the rest', () => {
    const list = Array.from({ length: 14 }, (_, i) => i);
    expect(page(list, 10)).toEqual({ rows: list.slice(0, 10), hidden: 4 });
  });

  it('shows everything when it fits, with nothing to reveal', () => {
    expect(page([1, 2, 3], 10)).toEqual({ rows: [1, 2, 3], hidden: 0 });
    expect(page([], 10)).toEqual({ rows: [], hidden: 0 });
  });
});
