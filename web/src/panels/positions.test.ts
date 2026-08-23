import { describe, expect, it } from 'vitest';
import { fills, POSITIONS, score, search, tally } from './positions';

describe('positions', () => {
  it('grades every duty with a reason, and names a trade the catalog has or none', () => {
    const trades = new Set(['worker', 'mason', 'scout', 'researcher', 'scribe', 'analyst', 'designer', 'drafter', 'architect', 'clerk']);
    for (const p of POSITIONS) {
      expect(p.duties.length).toBeGreaterThan(2);
      for (const duty of p.duties) expect(duty.why.length).toBeGreaterThan(10);
      if (p.trade !== null) expect(trades.has(p.trade)).toBe(true);
      // A seat that fills nothing is not a match; a no-seat position never has a clean "does".
      if (p.trade === null) expect(tally(p).y).toBe(0);
      else expect(tally(p).y).toBeGreaterThan(0);
    }
  });

  it('counts, never a percentage', () => {
    const ea = POSITIONS.find((p) => p.title === 'Executive assistant')!;
    expect(tally(ea)).toEqual({ y: 2, p: 2, n: 2 });
  });

  it('searches titles and aliases before duties, and misses honestly', () => {
    expect(search('bookkeeper')[0].title).toBe('Bookkeeper');
    expect(search('inbox')[0].trade).toBe('clerk');
    // A duty word alone still finds it, behind anything named for it.
    expect(search('refund').map((p) => p.title)).toEqual(['Customer support representative']);
    expect(search('sales')).toEqual([]);
    // Nothing typed: everything, in file order.
    expect(search('')).toHaveLength(POSITIONS.length);
    expect(score(POSITIONS[0], 'fix bugs')).toBe(6);
  });

  it('links a trade back to the positions it fills', () => {
    expect(fills('analyst')).toEqual(['Data analyst', 'Bookkeeper']);
    expect(fills('plumber')).toEqual([]);
  });
});
