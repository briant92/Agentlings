import type { DeliveryFile } from '@agentlings/shared';

/**
 * The boundary sentence for a run a limit stopped (D-138: a cut is a
 * boundary, not an annulment; D-015/D-025: "ran out of turns" is often the
 * ordinary ending). The review used to show the raw cut error in red above a
 * perfectly reviewable delivery, which read as "definitively unfinished" —
 * this names the limit neutrally and, when the delivery is substantive, says
 * so in the same breath, so More turns/time below reads as an offer rather
 * than a repair.
 */

/** What the sentence is built from, as plain facts so tests need no Job. */
export interface CutFacts {
  outOfTurns?: boolean;
  timedOut?: boolean;
  /** The reported turn count, when the stream got far enough to have one. */
  turns?: number;
  /** A world draft rode the delivery (`job.packDraft`). */
  hasWorldDraft: boolean;
  /** Files a repo patch would change (`job.changes.files`). */
  patchedFiles: number;
  /** The sandbox listing, null while it is still loading. */
  files: DeliveryFile[] | null;
}

/** Null when the run was not cut — a real failure keeps its error styling. */
export function cutNotice(facts: CutFacts): string | null {
  if (!facts.outOfTurns && !facts.timedOut) return null;
  // Turns win when both limits are stamped — the carry-on button's own
  // precedence ("More time" only for a pure clock-cut).
  const limit = facts.outOfTurns ? 'The turn budget' : 'The clock';
  const head = `${limit} ended this run${facts.turns ? ` at turn ${facts.turns}` : ''}`;
  const kept: string[] = [];
  if (facts.hasWorldDraft) kept.push('a world draft');
  if (facts.patchedFiles > 0)
    kept.push(`a patch to ${facts.patchedFiles} file${facts.patchedFiles === 1 ? '' : 's'}`);
  if (facts.files?.some((f) => f.name === 'RESULT.md')) kept.push('its RESULT.md account');
  if (kept.length > 0) {
    const list =
      kept.length === 1
        ? kept[0]
        : `${kept.slice(0, -1).join(', ')} and ${kept[kept.length - 1]}`;
    return `${head} — below is everything it wrote, including ${list}.`;
  }
  // Nothing to point at yet: promise nothing. An empty sandbox stays an
  // honest cut, not a claimed delivery.
  if (facts.files && facts.files.length > 0) return `${head} — below is everything it wrote.`;
  return `${head}.`;
}
