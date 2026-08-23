import type { CrewCv, RoleInfo, TierCost } from '@agentlings/shared';
import { MAX_CEILING_USD, roleCeilingUsd } from './estimate';
import { DEFAULT_MAX_TURNS, TURN_CEILING } from './executors/claude';
import type { LedgerEntry, Tier } from './ledger';

/**
 * The crew's CV, read from what the app already holds (the Meet-the-crew
 * screen behind Settings): every role as served, the most a session of it
 * may be quoted — the role's own ceiling under the env clamp, the global cap
 * where it names none — and what full sessions of it have actually cost on
 * the ledger. Nominal and measured are returned side by side on purpose:
 * the screen contrasts them rather than letting either stand in for the
 * other. Pure; the route hands in the registry, the ledger and the env.
 *
 * Measured by `jobClass` — the role that ran the row — and not through
 * `history()`, which keys a row on its recipe key first: under that reading
 * 133 session rows, every drafter run among them, belong to a recipe and to
 * no role, and the drafter's card would read "no full session yet" against
 * seven sessions on record (the D-221 seam, seen from this side).
 */
export function crewCv(
  roles: readonly RoleInfo[],
  ledger: readonly LedgerEntry[],
  envMaxUsd: number | undefined,
): CrewCv {
  return {
    roles: roles.map((role) => {
      const costs = ledger
        .filter((e) => e.tier === 'session' && e.jobClass === role.name && e.costUsd > 0)
        .map((e) => e.costUsd);
      return {
        ...role,
        ceilingUsd: roleCeilingUsd(role.maxCostUsd, envMaxUsd) ?? MAX_CEILING_USD,
        measured: { samples: costs.length, meanUsd: mean(costs), maxUsd: costs.length ? Math.max(...costs) : 0 },
      };
    }),
    turnCeiling: TURN_CEILING,
    defaultTurns: DEFAULT_MAX_TURNS,
    tiers: { oneshot: tierCost(ledger, 'oneshot'), session: tierCost(ledger, 'session') },
  };
}

/** A paid tier's mean over the rows that cost something — the ladder's rung, measured. */
function tierCost(ledger: readonly LedgerEntry[], tier: Tier): TierCost {
  const costs = ledger.filter((e) => e.tier === tier && e.costUsd > 0).map((e) => e.costUsd);
  return { samples: costs.length, meanUsd: mean(costs) };
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
