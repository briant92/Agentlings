import { describe, expect, it } from 'vitest';
import { hireBanner } from './hire';

describe('hireBanner', () => {
  it('names the trade and the job over the level picker, and nothing when no hire waits', () => {
    expect(hireBanner(null)).toBeNull();
    expect(hireBanner({ role: 'mason', text: 'junior developer' })).toBe(
      'Hiring a mason as junior developer — pick the level it joins',
    );
    expect(hireBanner({ role: 'analyst', text: 'bookkeeper' })).toBe(
      'Hiring an analyst as bookkeeper — pick the level it joins',
    );
  });
});
