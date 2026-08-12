import { opKey, type MoveOp } from '@agentlings/shared';

/** The rules the review card goes by for a folder reorganization (D-132). */

/** The ops not yet applied — the manifest minus what prior Approves did. */
export function movesLeft(moves: MoveOp[], done: MoveOp[]): MoveOp[] {
  const already = new Set(done.map(opKey));
  return moves.filter((op) => !already.has(opKey(op)));
}

/** Plain-words count for the card, built like `producedBy` for a patch. */
export function movesSummary(moves: MoveOp[]): string {
  const folders = moves.filter((m) => m.op === 'mkdir').length;
  const files = moves.filter((m) => m.op === 'move').length;
  const parts: string[] = [];
  if (folders > 0) parts.push(`${folders} folder${folders === 1 ? '' : 's'}`);
  parts.push(`${files} file${files === 1 ? '' : 's'} moved`);
  return parts.join(', ');
}

export interface MoveRow {
  from: string;
  to: string;
}

/**
 * The moves as from→to rows a reviewer reads, `mkdir`s dropped (an empty
 * folder is implied by what lands in it). Sorted by destination so files
 * heading to the same place sit together — the before/after, in a list.
 */
export function moveRows(moves: MoveOp[]): MoveRow[] {
  return moves
    .filter((m): m is Extract<MoveOp, { op: 'move' }> => m.op === 'move')
    .map((m) => ({ from: m.from, to: m.to }))
    .sort((a, b) => a.to.localeCompare(b.to));
}
