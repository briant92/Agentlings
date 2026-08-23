import type { JobBoardHint, TaskCoverage, TaskGrade } from '@agentlings/shared';

/**
 * The world's postings (D-232): the O*NET half of the positions board, and
 * the hire modal's one-line hint. The hand-graded twelve are vouched; these
 * are *measured* — graded by the same benchmark grader the coverage numbers
 * come from — and the copy here keeps that difference visible everywhere a
 * grade shows: counts never percentages (D-229), the word "measured" on the
 * section and the hint, and every duty row carrying the reason its grade
 * rests on.
 */

export const WORLD_MARK: Record<TaskGrade, string> = { covered: '✓', partial: '◐', uncovered: '✕' };

/** The world grades wear the hand board's own pip classes, so red is red everywhere. */
export const GRADE_CLASS: Record<TaskGrade, 'y' | 'p' | 'n'> = {
  covered: 'y',
  partial: 'p',
  uncovered: 'n',
};

/** The tally line, counts only: "covered 17 · partly 10 · not 1". */
export function worldTally(counts: Record<TaskGrade, number>): string {
  return `covered ${counts.covered} · partly ${counts.partial} · not ${counts.uncovered}`;
}

/**
 * A duty row's reason, readable half first: the grader writes
 * "write: reports — Scribe writes and …" and the sentence after the dash is
 * the part a person reads; a reason with no dash (the matcher's own
 * sentences) shows whole.
 */
export function shortReason(t: Pick<TaskCoverage, 'reasons'>): string {
  const r = t.reasons[0] ?? '';
  const dash = r.indexOf(' — ');
  return dash >= 0 ? r.slice(dash + 3) : r;
}

/** The hire modal's line under the suggestion. Null when there is nothing worth saying. */
export function hintText(hint: JobBoardHint | null): string | null {
  if (!hint) return null;
  const total = hint.counts.covered + hint.counts.partial + hint.counts.uncovered;
  if (total === 0) return null;
  const who = hint.role ? `${hint.role} covers ${hint.counts.covered} of ${total} duties` : `${hint.counts.covered} of ${total} duties covered`;
  return `the world's posting "${hint.title}" — ${who}, measured`;
}
