import type { Outbox } from '@agentlings/shared';
import { executeOutbox, sendPriceUsd, type OutboxRun } from './channels';
import { appendSends } from './sends';

/**
 * The one door through which a reviewed outbox is sent (D-160).
 *
 * The idempotency story used to be read → send → stamp, in two copies (the
 * resolve route and auto-send), and it held only for *sequential* Approves:
 * the send in the middle takes real seconds, and a second Approve arriving
 * inside that window read a stamp that was not yet written and sent again —
 * job 3e14937a delivered Pepo the same PDF twice, one second apart, on
 * D-159's first in-app outing. "Approving twice can never message anyone
 * twice" (D-075) was a claim about a sequence the route never actually
 * serialized.
 *
 * So: one function, both callers, and a per-job claim held from before the
 * already-sent read until after the stamp. A second caller inside the window
 * gets `null` — refused by name, sending nothing — and the recipients list
 * is read *under the claim*, never before it. The claim is process-local,
 * which is exactly the scope of the race: both callers live in this one
 * server.
 */
const inFlight = new Set<string>();

export interface OutboxSendOpts {
  outbox: Outbox;
  jobId: string;
  levelId: string;
  /** The job's sandbox — where a message's `files` bytes live (D-159). */
  dir: string;
  /** Where `sends.jsonl` lives. */
  sandboxRoot: string;
  env: Record<string, string | undefined>;
  /**
   * Recipients already sent to, as a thunk on purpose: it is called under
   * the claim, so it always reads the stamp the previous send finished
   * writing — a plain array argument would be the pre-claim stale read that
   * caused the double.
   */
  alreadySent: () => readonly string[];
  /** Stamps the run onto the job (queue.recordOutboxSends); runs before the claim releases. */
  record: (run: OutboxRun) => void;
  /** Injectable for tests; the real one is global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Sends, audits and stamps one outbox run — or returns null when this job's
 * outbox is already mid-send, in which case nothing moved and the caller
 * should say so. The claim always releases, success or failure: a failed
 * run must leave the job retryable, not locked.
 */
export async function performOutboxSend(opts: OutboxSendOpts): Promise<OutboxRun | null> {
  if (inFlight.has(opts.jobId)) return null;
  inFlight.add(opts.jobId);
  try {
    const run = await executeOutbox(opts.outbox, opts.alreadySent(), {
      env: opts.env,
      dir: opts.dir,
      ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
    });
    const at = Date.now();
    // The user's own declared rate, when they set one — never a guess
    // (D-081). Only sends that happened carry it.
    const usd = sendPriceUsd(opts.outbox.channel, opts.env);
    const messageOf = (to: string) => opts.outbox.messages.find((m) => m.to === to);
    appendSends(opts.sandboxRoot, [
      ...run.sentTo.map((to) => ({
        at,
        levelId: opts.levelId,
        jobId: opts.jobId,
        channel: opts.outbox.channel,
        to,
        ...(messageOf(to)?.name ? { name: messageOf(to)?.name } : {}),
        ...(messageOf(to)?.body ? { body: messageOf(to)?.body } : {}),
        ...(messageOf(to)?.files?.length ? { files: messageOf(to)?.files } : {}),
        ok: true,
        ...(usd ? { usd } : {}),
      })),
      ...run.failed.map((f) => ({
        at,
        levelId: opts.levelId,
        jobId: opts.jobId,
        channel: opts.outbox.channel,
        to: f.to,
        ok: false,
        reason: f.reason,
      })),
    ]);
    opts.record(run);
    return run;
  } finally {
    inFlight.delete(opts.jobId);
  }
}
