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
  /**
   * Every outbox this job asked for (D-179), sent under one claim in the
   * order the sentence asked for the channels.
   *
   * One claim rather than one per channel: the claim's job is to stop a
   * second Approve entering the read→send→stamp window, and a per-channel
   * claim would let the second Approve start channel two while the first is
   * still on channel one — the same race, one layer down.
   */
  outboxes: Outbox[];
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
  alreadySent: (channel: string) => readonly string[];
  /**
   * Stamps one channel's run onto the job (queue.recordOutboxSends), called
   * as each channel finishes rather than once at the end — so a failure on
   * the second channel cannot lose the first channel's record of who it
   * already reached, which is the only thing standing between a retry and a
   * double send.
   */
  record: (channel: string, run: OutboxRun) => void;
  /** Injectable for tests; the real one is global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Sends, audits and stamps one outbox run — or returns null when this job's
 * outbox is already mid-send, in which case nothing moved and the caller
 * should say so. The claim always releases, success or failure: a failed
 * run must leave the job retryable, not locked.
 */
export async function performOutboxSend(
  opts: OutboxSendOpts,
): Promise<{ channel: string; run: OutboxRun }[] | null> {
  if (inFlight.has(opts.jobId)) return null;
  inFlight.add(opts.jobId);
  try {
    const runs: { channel: string; run: OutboxRun }[] = [];
    for (const outbox of opts.outboxes) {
      const run = await executeOutbox(outbox, opts.alreadySent(outbox.channel), {
        env: opts.env,
        dir: opts.dir,
        ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
      });
      const at = Date.now();
      // The user's own declared rate, when they set one — never a guess
      // (D-081). Only sends that happened carry it.
      const usd = sendPriceUsd(outbox.channel, opts.env);
      const messageOf = (to: string) => outbox.messages.find((m) => m.to === to);
      appendSends(opts.sandboxRoot, [
        ...run.sentTo.map((to) => ({
          at,
          levelId: opts.levelId,
          jobId: opts.jobId,
          channel: outbox.channel,
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
          channel: outbox.channel,
          to: f.to,
          ok: false,
          reason: f.reason,
        })),
      ]);
      // Stamped per channel as it lands, not at the end: a throw on the next
      // channel must not take this one's record of who it reached with it.
      opts.record(outbox.channel, run);
      runs.push({ channel: outbox.channel, run });
    }
    return runs;
  } finally {
    inFlight.delete(opts.jobId);
  }
}
