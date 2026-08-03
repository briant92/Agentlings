import { type Delivery, type Job, outcomeOf } from '@agentlings/shared';
import { describeOutputs } from './outputs';

/**
 * Finished work, newest first — what the inbox lists.
 *
 * Everything that reached an outcome, not only what delivered files: a job
 * that failed is still an answer to "what happened to the thing I asked for",
 * and hiding it here would leave the terminal feed as the only place it was
 * ever mentioned — a feed that is numbered per server run and gone after a
 * restart.
 *
 * Capped, because each row costs a directory read. The cap is the caller's and
 * the count of what it left out is not reported here: `LevelProductivity.jobs`
 * already says how much work there has been, so a row of "and 43 more" would
 * be a second answer to a question already answered.
 */
export function deliveriesFor(
  jobs: readonly Job[],
  /** Who did it, by id — resting and departed crew included. */
  names: ReadonlyMap<string, string>,
  sandboxDir: (jobId: string) => string,
  limit: number,
): Delivery[] {
  const finished = jobs.filter((job) => outcomeOf(job.status) !== null);
  return (
    finished
      .sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt))
      .slice(0, limit)
      // Only now, on the handful that survived the cap: a readdir per job over
      // the whole history is the one expensive thing in here.
      .map((job) => ({
        jobId: job.id,
        title: job.title,
        // Someone since let go still did the work; their id is a poor label
        // but a truer one than pretending nobody did it.
        who: (job.assignedTo && names.get(job.assignedTo)) ?? job.assignedTo ?? '—',
        at: job.finishedAt ?? job.createdAt,
        status: job.status,
        // Non-null by construction: the filter above dropped everything the
        // map has no answer for.
        outcome: outcomeOf(job.status)!,
        // A free tier spent nothing, so it says nothing rather than "$0.00".
        costUsd:
          typeof job.meter?.costUsd === 'number' && job.meter.costUsd > 0
            ? job.meter.costUsd
            : null,
        files: describeOutputs(sandboxDir(job.id)),
        ...(job.changes ? { changes: job.changes } : {}),
      }))
  );
}
