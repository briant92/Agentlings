import type { RefusalReading } from '@agentlings/shared';

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

/**
 * The tail under the refusal lines (#22): what happens to Start.
 *
 * Its words are the UI's own, and D-259 is what makes them true — the desk
 * warns, it does not block, and Start is never disabled. So no word here may
 * read as one, and `planLine.test.ts` holds it to that.
 */
export const REFUSE_TAIL = 'Start still works — the crew does the rest and says what it left to you.';

/**
 * What the desk shows under the plan for a sentence the crew will refuse
 * (#22): the rows to draw a line from, and the tail — or no tail at all.
 *
 * The tail comes back **once**, however many rows: it is a fact about the
 * button, not a fourth warning, and repeating it per row is the reader's cue
 * that neither copy matters. That "once" is only half here — this returns one
 * string, and the JSX drawing exactly one `<p>` from it is the other half,
 * which no web test can see (D-177, D-178) and `prove-refusal-ui.mjs` counts
 * in the real DOM instead.
 *
 * No row's own words are written here, and none are read: the lead-in, the
 * board's `why` and what the crew will do instead all arrive on the row from
 * the server, and the rows pass through untouched — so the desk and the board
 * cannot drift apart, and a row gaining a field needs no edit here.
 */
export function refusalDesk(
  refuses: readonly RefusalReading[] | undefined,
): { lines: readonly RefusalReading[]; tail: string | null } {
  const lines = refuses ?? [];
  return { lines, tail: lines.length > 0 ? REFUSE_TAIL : null };
}
