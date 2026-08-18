import { describe, expect, it } from 'vitest';
import { whoSuffix } from './planLine';

describe('the plan line says its fallbacks out loud', () => {
  it('says nothing when a trade matched and someone holds it', () => {
    expect(whoSuffix({ role: 'clerk', noOneHasRole: false, agentling: { role: 'clerk' } })).toBe('');
  });

  it('keeps the nobody-holds-it sentence', () => {
    expect(
      whoSuffix({ role: 'researcher', noOneHasRole: true, agentling: { role: 'worker' } }),
    ).toBe(' — nobody here is a researcher, so it goes to your worker');
  });

  /**
   * The no-match fallback was the silent one (D-192): a typo'd research
   * sentence fell to the generalist and its shorter wall with no word said.
   * The nudge names who takes it and how to route a specialist instead.
   */
  it('says when no trade recognised the words, and how to route one', () => {
    const line = whoSuffix({ role: null, agentling: { role: 'worker' } });
    expect(line).toContain('no trade recognised these words');
    expect(line).toContain('your worker takes it');
    expect(line).toContain('research, analysis, a write-up');
  });

  it('stays quiet with no crew at all — the hire line owns that case', () => {
    expect(whoSuffix({ role: null, agentling: null })).toBe('');
  });
});
