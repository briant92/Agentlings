/**
 * The suffix after "<name> will take this" on the desk card — the two quiet
 * fallbacks, said out loud.
 *
 * The matcher declining is silent by design (below MIN_CONFIDENCE it names
 * nobody rather than guessing), but the job still runs — as the generalist,
 * with the generalist's limits. Measured 2026-08-18 (D-192): a research
 * sentence with two typos scored below the line, fell to the worker's
 * ten-minute wall, and timed out three times where the researcher's longer
 * wall would have held. The card is the one moment the user can still
 * reword, so this is where the fallback must be visible.
 *
 * Extracted from the JSX because a condition inside a component is
 * structurally unreachable to the web suite (D-177's lesson, D-178's shape).
 */
export function whoSuffix(plan: {
  role?: string | null;
  noOneHasRole?: boolean;
  agentling?: { role: string } | null;
}): string {
  if (!plan.agentling) return '';
  if (plan.role && plan.noOneHasRole) {
    return ` — nobody here is a ${plan.role}, so it goes to your ${plan.agentling.role}`;
  }
  if (!plan.role) {
    return ` — no trade recognised these words, so your ${plan.agentling.role} takes it; naming the work plainly (research, analysis, a write-up…) routes a specialist`;
  }
  return '';
}
