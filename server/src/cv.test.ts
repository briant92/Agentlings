import { describe, expect, it } from 'vitest';
import type { RoleInfo } from '@agentlings/shared';
import type { LedgerEntry } from './ledger';
import { crewCv } from './cv';
import { MAX_CEILING_USD } from './estimate';

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    at: 1,
    jobId: 'j',
    levelId: 'hq',
    jobClass: 'mason',
    tier: 'session',
    outcome: 'done',
    costUsd: 0.1,
    priceUsd: 0.1,
    ...over,
  };
}

const mason: RoleInfo = { name: 'mason', description: 'builds', tools: [], skills: [], maxTurns: 15 };
const drafter: RoleInfo = { ...mason, name: 'drafter', maxTurns: 35, maxCostUsd: 5 };

describe('crewCv', () => {
  it('sets the nominal beside the measured, per role', () => {
    const cv = crewCv(
      [mason, drafter],
      [
        entry({ costUsd: 0.2 }),
        // Keyed to a recipe, and still a mason session: the role's measure must count it.
        entry({ costUsd: 0.4, recipeKey: 'fix the thing' }),
        // A one-shot and a free row do not describe a full session's price.
        entry({ tier: 'oneshot', costUsd: 0.05 }),
        entry({ tier: 'routed', costUsd: 0 }),
        entry({ jobClass: 'scribe', costUsd: 9 }),
      ],
      undefined,
    );
    const [m, d] = cv.roles;
    expect(m.name).toBe('mason');
    expect(m.ceilingUsd).toBe(MAX_CEILING_USD);
    expect(m.measured.samples).toBe(2);
    expect(m.measured.meanUsd).toBeCloseTo(0.3);
    expect(m.measured.maxUsd).toBe(0.4);
    // The drafter's own ceiling stands where the env names none; nothing measured yet.
    expect(d.ceilingUsd).toBe(5);
    expect(d.measured).toEqual({ samples: 0, meanUsd: 0, maxUsd: 0 });
    // The ladder's rungs: the one-shot row alone, and the three sessions that cost something.
    expect(cv.tiers.oneshot).toEqual({ samples: 1, meanUsd: 0.05 });
    expect(cv.tiers.session.samples).toBe(3);
    expect(cv.tiers.session.meanUsd).toBeCloseTo(3.2);
    expect(cv.turnCeiling).toBe(40);
    expect(cv.defaultTurns).toBe(10);
  });

  it('lets the env clamp win over a role ceiling', () => {
    const cv = crewCv([drafter], [], 1.5);
    expect(cv.roles[0].ceilingUsd).toBe(1.5);
  });
});
