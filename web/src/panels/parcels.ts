import { outcomeOf, type Job } from '@agentlings/shared';

/**
 * The parcel desk's reading of the review backlog (the pile said ×40 and
 * clicking it opened one job blind).
 *
 * Grouped by what Approve would DO, because that is the triage question: a
 * delivery whose approval sends, installs or moves something is blocked on
 * the user in a way a files-only run never is. Oldest first within each
 * group — the pile's own order, so working the desk drains the same queue
 * the crates count.
 */

export type ParcelKind = 'acts' | 'patch' | 'files';

export const PARCEL_SECTIONS: { kind: ParcelKind; title: string; note: string }[] = [
  { kind: 'acts', title: 'acts on approval', note: 'approving performs the send, install or move' },
  { kind: 'patch', title: 'code patches', note: 'approving applies the diff to your repository' },
  { kind: 'files', title: 'files only', note: 'approving keeps the work; nothing runs' },
];

/**
 * Which section a delivery belongs to. Side-effects outrank the patch: a job
 * carrying both an outbox and a diff is above all a thing that will *send*.
 */
export function parcelKindOf(job: Job): ParcelKind {
  if (job.outbox || job.packDraft || job.moves) return 'acts';
  if ((job.changes?.files ?? 0) > 0) return 'patch';
  return 'files';
}

/**
 * The deliveries actually waiting on a verdict, oldest first. A continued
 * job is excluded by D-139's rule: a card solicits while a decision is open,
 * and not one moment after — More turns was its decision.
 */
export function waitingParcels(jobs: readonly Job[]): Job[] {
  return jobs
    .filter((j) => outcomeOf(j.status) === 'to review' && !j.continuedBy)
    .sort((a, b) => (a.finishedAt ?? a.createdAt) - (b.finishedAt ?? b.createdAt));
}

/** The desk's sections, in triage order, empty ones dropped. */
export function parcelSections(
  jobs: readonly Job[],
): { kind: ParcelKind; title: string; note: string; jobs: Job[] }[] {
  const waiting = waitingParcels(jobs);
  return PARCEL_SECTIONS.map((section) => ({
    ...section,
    jobs: waiting.filter((j) => parcelKindOf(j) === section.kind),
  })).filter((section) => section.jobs.length > 0);
}

/**
 * The flow order: every waiting id, flattened in the exact order the desk
 * shows them. "Work the pile" walks this list; it is snapshotted when the
 * flow starts so a verdict advancing the queue never reshuffles it mid-pass.
 */
export function parcelOrder(jobs: readonly Job[]): string[] {
  return parcelSections(jobs).flatMap((section) => section.jobs.map((j) => j.id));
}

/** The verdict-relevant chips for one row: what approving would touch. */
export function parcelChips(job: Job): string[] {
  const chips: string[] = [];
  if (job.packDraft) chips.push(`world “${job.packDraft.pack.name}”`);
  if (job.outbox) {
    const sent = job.outboxSent?.sentTo ?? [];
    const unsent = job.outbox.messages.filter((m) => !sent.includes(m.to)).length;
    chips.push(unsent === 1 ? '1 send' : `${unsent} sends`);
  }
  if (job.moves) chips.push(`${job.moves.moves.length} moves`);
  if ((job.changes?.files ?? 0) > 0) {
    chips.push(`+${job.changes!.added} −${job.changes!.removed}`);
  }
  return chips;
}

/** A parcel's age, said the way a person scans a backlog: 3m, 7h, 41d. */
export function parcelAge(job: Job, now: number): string {
  const at = job.finishedAt ?? job.createdAt;
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
