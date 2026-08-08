import type {
  CloseLevelPreview,
  ClosedLevelInfo,
  Job,
  SendApprovalInfo,
} from '@agentlings/shared';
import { type SendApproval, describeApproval, readApprovals } from './approvals';
import { type LevelMeta, listLevelDirs, readMeta, writeMeta } from './levels';
import { readStoredJobs } from './queue';
import { type Schedule, describeSchedule, readSchedules, setPaused } from './schedules';

/**
 * Closing a level archives it in place: the folder stays whole under levels/
 * (so the id is never reissued and the ledger's rows keep pointing at real
 * history), the runtime stops, and nothing is destroyed. The app has no way
 * to delete a level's data — deliberately, the agentling let-go precedent
 * (D-029, D-050, D-111).
 */

/** Deliveries still waiting on a decision; kept as they are by a close. */
const IN_REVIEW = new Set<Job['status']>(['done', 'partial', 'failed']);

/**
 * Why this level cannot close right now, or null. Mid-flight work refuses —
 * the same rule that stops a busy agentling being rested, merged or let go —
 * and names who or what, so the message is something the user can act on.
 */
export function closeBlocker(jobs: Job[], workingName?: string): string | null {
  if (workingName) return `${workingName} is working — let them finish first`;
  const active = jobs.find((j) => j.status === 'running' || j.status === 'queued');
  if (active) {
    return `“${active.title}” is still ${active.status} — cancel it or let it finish first`;
  }
  return null;
}

/** Only granted approvals are powers; a counter still earning is not. */
function grantedInfos(approvals: SendApproval[]): SendApprovalInfo[] {
  return approvals.filter((a) => a.auto).map(describeApproval);
}

/**
 * What a close would keep and stop, computed before the button so the
 * confirmation can name consequences instead of asserting safety.
 */
export function closePreview(input: {
  jobs: Job[];
  workingName?: string;
  recipes: number;
  notes: number;
  crew: string[];
  schedules: Schedule[];
  approvals: SendApproval[];
}): CloseLevelPreview {
  return {
    blocker: closeBlocker(input.jobs, input.workingName),
    jobs: input.jobs.length,
    reviews: input.jobs.filter((j) => IN_REVIEW.has(j.status)).length,
    recipes: input.recipes,
    notes: input.notes,
    crew: input.crew,
    schedules: input.schedules.map(describeSchedule),
    approvals: grantedInfos(input.approvals),
  };
}

/**
 * Stamp the level closed. Schedules pause first, through the same tested path
 * the pause button uses; the closedAt stamp goes last, so a failure part-way
 * leaves the level open and the close retryable rather than half-taken.
 * Reopening deliberately does not resume them — a level asleep for months
 * must not fire a catch-up the moment it wakes.
 */
export function closeLevelFiles(dir: string, now: number): number {
  for (const schedule of readSchedules(dir)) {
    if (!schedule.paused) setPaused(dir, schedule.id, true, now);
  }
  const meta = readMeta(dir);
  meta.closedAt = now;
  writeMeta(dir, meta);
  return now;
}

/** Back on the map: clear the stamp; everything else is exactly as left. */
export function reopenLevelFiles(dir: string): LevelMeta {
  const meta = readMeta(dir);
  delete meta.closedAt;
  writeMeta(dir, meta);
  return meta;
}

export function listClosedLevels(sandboxRoot: string): { dir: string; meta: LevelMeta }[] {
  return listLevelDirs(sandboxRoot)
    .map((dir) => ({ dir, meta: readMeta(dir) }))
    .filter((entry) => entry.meta.closedAt);
}

/**
 * One closed-shelf row. It carries what a reopen would bring back — paused
 * schedules and still-granted approvals — so the reopen confirmation can name
 * them and no power returns silently.
 */
export function describeClosedLevel(dir: string, meta: LevelMeta): ClosedLevelInfo {
  const jobs = readStoredJobs(dir);
  return {
    id: meta.id,
    name: meta.name,
    project: meta.project,
    theme: meta.theme,
    closedAt: meta.closedAt ?? 0,
    jobs: jobs.length,
    reviews: jobs.filter((j) => IN_REVIEW.has(j.status)).length,
    schedules: readSchedules(dir).map(describeSchedule),
    approvals: grantedInfos(readApprovals(dir)),
  };
}
