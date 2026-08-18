import { CHANNEL_LABELS } from './ChannelLogo';

/**
 * The guard the mention-guards were missing (D-193): a job that carried a
 * real send channel and reaches review with no outbox to send.
 *
 * D-093 covers the channel that was mentioned but never carried; D-178 the
 * channel asked for that could not ride. This is the third silence: the
 * channel was carried, the run composed — and the contract refused the file,
 * so Approve would promote the work and send nothing. Three runs and three
 * approvals once went exactly that way, the last one summarising "Done.
 * OUTBOX.json is updated to send via Gmail" over an outbox that did not
 * exist. The reviewer must read that from the Approve area, not deduce it
 * from an error line's absence of a card.
 *
 * Extracted from the JSX because a component condition is structurally
 * unreachable to the web suite (D-177).
 */
export function noSendLine(job: {
  channels?: string[];
  outbox?: unknown[];
  outboxError?: string;
}): string | null {
  if (!job.channels?.length) return null; // D-093's guard owns the channel-less case
  if (job.outbox?.length) return null; // a real outbox renders its own cards
  // The next move, in D-093's own phrasing — a guard that names the problem
  // without the recovery leaves a non-expert with only the wrong button.
  const label = CHANNEL_LABELS[job.channels[0]] ?? job.channels[0];
  const fix = ` To send, reply on the job's card: "Send it to … on ${label}".`;
  return job.outboxError
    ? `This job was meant to send and cannot — approving keeps the files and sends nothing. The outbox was refused: ${job.outboxError}${fix}`
    : `This job carried a send channel but the run wrote no outbox — approving keeps the files and sends nothing.${fix}`;
}
