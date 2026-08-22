import type { SendApprovalInfo } from '@agentlings/shared';

/**
 * The standing-approval rows in the backoffice, folded (UI.md, step 2): the
 * three-dot meter per job rides in the section header, so the 1-of-3 state
 * reads without opening it, and the line under each key says what the next
 * approvals do rather than only counting them.
 */

/** Approvals a job needs before it may send itself (D-082). */
export const APPROVALS_TO_AUTO = 3;

/** How many of the meter's dots are lit: all of them once auto-send is on. */
export function litDots(approval: Pick<SendApprovalInfo, 'approvals' | 'auto'>): number {
  if (approval.auto) return APPROVALS_TO_AUTO;
  return Math.max(0, Math.min(APPROVALS_TO_AUTO, approval.approvals));
}

/** The line under a key: where this job stands and what the next approval does. */
export function approvalLine(
  approval: Pick<SendApprovalInfo, 'approvals' | 'auto' | 'eligible'>,
): string {
  if (approval.auto) return 'sends itself';
  const toGo = Math.max(0, APPROVALS_TO_AUTO - approval.approvals);
  const count = `${approval.approvals} of ${APPROVALS_TO_AUTO} unchanged`;
  if (approval.eligible) return `${count} · the offer waits at the next review`;
  return `${count} · ${toGo} to go`;
}

/** The header's summary: the meters are drawn beside it; this is the sentence after them. */
export function approvalsSummary(
  approvals: readonly Pick<SendApprovalInfo, 'approvals' | 'auto'>[],
): string {
  const auto = approvals.filter((a) => a.auto).length;
  const sending = auto === 0 ? 'none sends itself yet' : `${auto} send${auto === 1 ? 's' : ''} itself`;
  const counts = approvals.filter((a) => !a.auto).map((a) => a.approvals);
  if (counts.length === 0) return sending;
  const low = Math.min(...counts);
  const high = Math.max(...counts);
  const range = low === high ? `${low} of ${APPROVALS_TO_AUTO} each` : `${low}–${high} of ${APPROVALS_TO_AUTO}`;
  return `${range} · ${sending}`;
}
