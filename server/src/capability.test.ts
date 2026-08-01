import { describe, expect, it } from 'vitest';
import { capabilityTokens, sameSurface } from './capability';

/**
 * D-036 closed one axis — the connections a job could reach — and left the
 * rest open. These are the others: a role's tools, its skills, and the
 * libraries a sandbox can resolve. Each of them changes what a good method is,
 * and each used to change nothing.
 */
describe('capabilityTokens', () => {
  it('prefixes each axis so two of them can never collide', () => {
    expect(capabilityTokens({ connections: ['web'], tools: ['web'] })).toEqual([
      'conn:web',
      'tool:web',
    ]);
  });

  it('sorts, so the same surface described in any order is the same surface', () => {
    const a = capabilityTokens({ connections: ['web', 'browser'], tools: ['Read', 'Bash'] });
    const b = capabilityTokens({ tools: ['Bash', 'Read'], connections: ['browser', 'web'] });
    expect(a).toEqual(b);
  });

  it('is empty for a run that could do nothing', () => {
    expect(capabilityTokens({})).toEqual([]);
  });
});

describe('sameSurface', () => {
  const base = capabilityTokens({
    connections: ['web'],
    tools: ['Read', 'Bash'],
    skills: ['cite-sources'],
    libraries: ['pdf-lib'],
  });

  it('is true for an identical surface', () => {
    expect(sameSurface(base, [...base])).toBe(true);
  });

  // The axis measured in D-031: an agentling that did not know pdf-lib existed
  // hand-assembled PDF bytes over several turns, and succeeded — which is what
  // made it expensive rather than obviously wrong. A method written then should
  // not still be shortening runs now the library is installed.
  it('is false once a library is installed', () => {
    const grown = capabilityTokens({
      connections: ['web'],
      tools: ['Read', 'Bash'],
      skills: ['cite-sources'],
      libraries: ['pdf-lib', 'docx'],
    });
    expect(sameSurface(base, grown)).toBe(false);
  });

  it('is false when the role gains or loses a tool', () => {
    const noBash = capabilityTokens({
      connections: ['web'],
      tools: ['Read'],
      skills: ['cite-sources'],
      libraries: ['pdf-lib'],
    });
    expect(sameSurface(base, noBash)).toBe(false);
  });

  it('is false when a skill is added', () => {
    const extra = capabilityTokens({
      connections: ['web'],
      tools: ['Read', 'Bash'],
      skills: ['cite-sources', 'small-diffs'],
      libraries: ['pdf-lib'],
    });
    expect(sameSurface(base, extra)).toBe(false);
  });

  // Unknown provenance is treated as changed rather than assumed to match.
  it('is false when either side is unknown', () => {
    expect(sameSurface(undefined, base)).toBe(false);
    expect(sameSurface(base, undefined)).toBe(false);
    expect(sameSurface(undefined, undefined)).toBe(false);
  });

  it('is true for two runs that could both do nothing', () => {
    expect(sameSurface([], [])).toBe(true);
  });
});
