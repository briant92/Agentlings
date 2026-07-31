import type { CrewMember, Job, JobStatus } from '@agentlings/shared';

/**
 * The work record behind the crew door.
 *
 * The terminal is a feed, not an archive: its events are numbered per server
 * run and held in memory, so everything it ever said is gone after a restart.
 * The jobs themselves are persisted, which makes them the only durable account
 * of what the crew has actually done — this turns that into something you can
 * read.
 */

/** What became of a job, grouped the way someone reviewing work would ask. */
export type Outcome = 'to review' | 'kept' | 'closed';

const OUTCOMES: Record<string, Outcome> = {
  done: 'to review',
  partial: 'to review',
  promoted: 'kept',
  discarded: 'closed',
  failed: 'closed',
};

export function outcomeOf(status: JobStatus): Outcome | null {
  return OUTCOMES[status] ?? null; // queued and running are not history yet
}

export interface Entry {
  job: Job;
  outcome: Outcome;
  /** Who did it, by name where the roster still knows them. */
  who: string;
  /** What it left behind, in one line. */
  produced: string;
  /** What it cost, or null when nothing was spent or nothing was measured. */
  costUsd: number | null;
}

/** A cost worth showing: a free tier spent nothing, so it says nothing. */
function costOf(job: Job): number | null {
  const cost = job.meter?.costUsd;
  return typeof cost === 'number' && cost > 0 ? cost : null;
}

/**
 * What the user actually gets from this job. A job with no diff is not empty —
 * most of them are answers or reports — so it falls back to the summary rather
 * than claiming nothing happened.
 */
export function producedBy(job: Job): string {
  const changes = job.changes;
  if (changes && changes.files > 0) {
    const files = changes.files === 1 ? '1 file' : `${changes.files} files`;
    return `${files} · +${changes.added} −${changes.removed}`;
  }
  if (job.status === 'failed') return job.error ?? 'nothing — it did not finish';
  return job.summary ? 'a written answer' : 'nothing on disk';
}

/**
 * Finished work, newest first. Anything still queued or running belongs to the
 * terminal, not to the record.
 */
export function entriesFor(jobs: readonly Job[], crew: readonly CrewMember[]): Entry[] {
  const names = new Map(crew.map((m) => [m.id, m.name]));
  const done: Entry[] = [];
  for (const job of jobs) {
    const outcome = outcomeOf(job.status);
    if (!outcome) continue;
    done.push({
      job,
      outcome,
      // Someone who has since been let go still did the work; their id is a
      // poor label but a truer one than pretending nobody did it.
      who: (job.assignedTo && names.get(job.assignedTo)) ?? job.assignedTo ?? '—',
      produced: producedBy(job),
      costUsd: costOf(job),
    });
  }
  return done.sort((a, b) => (b.job.finishedAt ?? 0) - (a.job.finishedAt ?? 0));
}

/**
 * Totals for the header.
 *
 * This is a subtotal of the rows on screen, not the level's lifetime spend —
 * it moves with the filters, and the ledger is the authority on what the app
 * has really paid out. The two legitimately differ: the ledger keeps a row for
 * every run ever made, while this can only see jobs still in the queue file.
 *
 * `unmeasured` is carried rather than quietly folded in as zero. A killed
 * session never reaches the message the SDK reports cost on, so its spend is
 * real and unknowable — and silently counting it as nothing is how a total
 * comes to understate itself.
 */
export function tally(entries: readonly Entry[]): {
  jobs: number;
  toReview: number;
  costUsd: number;
  unmeasured: number;
} {
  return {
    jobs: entries.length,
    toReview: entries.filter((e) => e.outcome === 'to review').length,
    costUsd: entries.reduce((sum, e) => sum + (e.costUsd ?? 0), 0),
    unmeasured: entries.filter((e) => e.job.meter?.costUnknown).length,
  };
}
