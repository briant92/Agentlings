import type { Delivery, Job } from '@agentlings/shared';

/**
 * One prompt, one review (D-233).
 *
 * A split sentence (D-105) runs as ordinary jobs chained by delivery, and
 * each used to surface its own REVIEW — two parallel panels for one ask,
 * with nothing tying them together but timestamps. These helpers walk the
 * `stepPrev` link the queue now stamps, so the terminal offers one door,
 * the inbox shows one card, and the review modal shows the steps as a rail.
 *
 * Everything here degrades rather than guesses: a link to a job that is no
 * longer listed truncates the walk, and a job with no chain is its own
 * chain of one.
 */

/**
 * The whole chain a job belongs to, step 1 first. Walks `stepPrev` back,
 * then successors forward — at most one successor exists per step, because
 * the next step is only queued by this one's delivery.
 */
export function chainOf(jobs: readonly Job[], job: Job): Job[] {
  if (!job.step) return [job];
  const seen = new Set<string>([job.id]);
  const back: Job[] = [];
  let cur: Job = job;
  while (cur.stepPrev) {
    const prev = jobs.find((j) => j.id === cur.stepPrev);
    if (!prev || seen.has(prev.id)) break;
    seen.add(prev.id);
    back.unshift(prev);
    cur = prev;
  }
  const chain = [...back, job];
  cur = job;
  for (;;) {
    const at: Job = cur;
    const next = jobs.find((j) => j.stepPrev === at.id);
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    chain.push(next);
    cur = next;
  }
  return chain;
}

/** Whether a later step of this job's chain already exists in the queue. */
export function hasNextStep(jobs: readonly Job[], jobId: string): boolean {
  return jobs.some((j) => j.stepPrev === jobId);
}

/**
 * The inbox rows regrouped so a chain renders once, as one card. Rows arrive
 * newest first and each group takes its newest member's place in that order,
 * with the members themselves put back in step order — the reading order.
 * A chain member whose siblings fell off the inbox cap stands alone.
 */
export function groupDeliveries(rows: readonly Delivery[]): Delivery[][] {
  const byId = new Map(rows.map((r) => [r.jobId, r]));
  const rootOf = (row: Delivery): string => {
    let cur = row;
    const seen = new Set<string>([row.jobId]);
    while (cur.stepPrev && !seen.has(cur.stepPrev)) {
      const prev = byId.get(cur.stepPrev);
      if (!prev) break;
      seen.add(prev.jobId);
      cur = prev;
    }
    return cur.jobId;
  };
  const groups = new Map<string, Delivery[]>();
  for (const row of rows) {
    const key = rootOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()].map((group) =>
    [...group].sort((a, b) => (a.step?.n ?? 0) - (b.step?.n ?? 0)),
  );
}

/**
 * The chain's still-running tail, if any: the step queued by the newest
 * delivered one, while it is not yet an inbox row itself. One hop is the
 * whole search — a later step cannot exist before this one delivers.
 */
export function runningNextStep(
  jobs: readonly Job[] | undefined,
  lastDeliveredId: string,
): Job | undefined {
  const next = jobs?.find((j) => j.stepPrev === lastDeliveredId);
  return next && (next.status === 'queued' || next.status === 'running') ? next : undefined;
}
