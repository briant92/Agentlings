import { describe, expect, it } from 'vitest';
import { type PublishedTemplate, templateDrift } from './template';

/**
 * The declared side, as `.railway/railway.ts` compiles to — the same three
 * facts `container.test.ts` already pins, reduced to what a published template
 * can be compared against.
 */
const declared = {
  repo: 'briant92/Agentlings',
  required: ['AGENTLINGS_PASSWORD'],
  mountPath: '/data',
};

/** What Railway's public API returns for a published template. */
const published = (over: Partial<PublishedTemplate['services'][string]> = {}): PublishedTemplate => ({
  services: {
    '29300d89': {
      name: 'Agentlings',
      source: { repo: 'https://github.com/briant92/Agentlings' },
      variables: { AGENTLINGS_PASSWORD: { isOptional: false } },
      volumeMounts: { '29300d89': { mountPath: '/data' } },
      ...over,
    },
  },
});

describe('templateDrift', () => {
  it('finds nothing when the published template is the program', () => {
    expect(templateDrift(declared, published())).toEqual([]);
  });

  /**
   * The fault this exists for. #31 regenerated the template and it came back
   * asking a stranger for three variables with no defaults, because the
   * generator carries names and not values — caught then by reading it, which
   * is exactly the check nobody runs twice.
   */
  it('names an input a stranger would be asked for and the program never declared', () => {
    const drift = templateDrift(
      declared,
      published({
        variables: {
          AGENTLINGS_PASSWORD: { isOptional: false },
          AGENTLINGS_HOME: { isOptional: false },
          AGENTLINGS_BIND: { isOptional: false },
        },
      }),
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('AGENTLINGS_HOME');
    expect(drift[0]).toContain('AGENTLINGS_BIND');
  });

  /**
   * A variable carrying no `isOptional` at all. The mutation round found this
   * one: reading it as "optional" would let a newly-required input that omits
   * the flag pass unseen, which is the fault this whole function is for.
   */
  it('counts an input with no isOptional flag as one a stranger is asked for', () => {
    const drift = templateDrift(
      declared,
      published({
        variables: { AGENTLINGS_PASSWORD: { isOptional: false }, SOME_NEW_INPUT: {} },
      }),
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('SOME_NEW_INPUT');
  });

  it('notices the password becoming optional — an ungated install by default', () => {
    const drift = templateDrift(
      declared,
      published({ variables: { AGENTLINGS_PASSWORD: { isOptional: true } } }),
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('AGENTLINGS_PASSWORD');
  });

  /**
   * The one that matters most (`container.test.ts` says so of its twin): a
   * mount path and a home that disagree is an install writing the operator's
   * keys into the container layer, working perfectly until the first redeploy.
   */
  it('notices the volume moving out from under the data directory', () => {
    const drift = templateDrift(
      declared,
      published({ volumeMounts: { a: { mountPath: '/var/data' } } }),
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('/var/data');
    expect(drift[0]).toContain('/data');
  });

  it('notices the volume disappearing entirely', () => {
    const drift = templateDrift(declared, published({ volumeMounts: {} }));
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatch(/volume/i);
  });

  it('notices the template pointing at another repository', () => {
    const drift = templateDrift(
      declared,
      published({ source: { repo: 'https://github.com/someone/else' } }),
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('someone/else');
  });

  // The same repository written the several ways Railway and git both accept.
  it('does not cry drift over how the repository is spelled', () => {
    for (const repo of [
      'https://github.com/briant92/Agentlings',
      'https://github.com/briant92/Agentlings.git',
      'https://github.com/briant92/Agentlings/',
      'briant92/Agentlings',
    ]) {
      expect(templateDrift(declared, published({ source: { repo } })), repo).toEqual([]);
    }
  });

  it('notices a second service — an install is one service and its volume', () => {
    const two = published();
    two.services.other = { name: 'Postgres' };
    const drift = templateDrift(declared, two);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatch(/one service/i);
  });

  it('reports every difference at once rather than the first', () => {
    const drift = templateDrift(
      declared,
      published({
        source: { repo: 'https://github.com/someone/else' },
        variables: { AGENTLINGS_PASSWORD: { isOptional: true } },
        volumeMounts: { a: { mountPath: '/elsewhere' } },
      }),
    );
    expect(drift).toHaveLength(3);
  });

  // A template that was never published, or whose code changed on publishing —
  // both happened in #31 — must read as "cannot compare", not as "no drift".
  it('refuses to call an absent template undrifted', () => {
    const drift = templateDrift(declared, { services: {} });
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatch(/one service/i);
  });
});
