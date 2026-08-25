import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Job } from '@agentlings/shared';
import { recipientFor } from './clarify';
import { readLedger } from './ledger';
import { listLevelDirs, readMeta } from './levels';
import { composeOutbox, OUTBOX_FILE } from './outbox';
import { readStoredJobs } from './queue';
import type { JobQueue } from './queue';
import {
  formatRealWork,
  lastFullWeek,
  realCount,
  REALWORK_PROMPT,
  realWork,
  type RealWorkBlock,
} from './realwork';
import { readRefusals } from './refusals';

/**
 * The score arrives on Monday (D-249, D-261): a schedule row may carry
 * `report: 'realwork'`, and its firing sends last week's real-work block
 * at $0 with no model in the loop. Code builds the block — the one function
 * `ledger:report` prints (D-260, D-030's rule) — and composes the outbox
 * through the same contract a session's OUTBOX.json meets, so the job lands
 * in review like any send: one card, Approve is the send, and after three
 * unchanged approvals the existing standing approval (D-082) sends it on
 * its own. Nothing here is a new way to send; it is a new way to compose.
 *
 * No door rides the firing, whatever the row says — the block is read off
 * disk, and a report that could reach anything would be a rule holding
 * something it never uses. No ledger row is written either: the ledger is
 * what a run cost, and nothing ran.
 */

/**
 * One fixed sentence for every report row, because the standing approval
 * keys on the normalised prompt (D-072, D-082): the count a Monday send
 * earns must be the count the next Monday send is judged by, whichever row
 * fired it. Defined beside the score, which excludes it by this very
 * sentence; re-exported here for the route.
 */
export { REALWORK_PROMPT };

const REALWORK_TITLE = "the week's real work";

/**
 * The block as the server sees it now: every level on disk, open or closed,
 * with the ledger and the refusals beside them — exactly what `ledger:report`
 * reads, so the printed score and the sent one cannot disagree.
 */
export function scoreBlock(sandboxRoot: string, now: number): RealWorkBlock {
  return realWork(
    lastFullWeek(now),
    listLevelDirs(sandboxRoot).map((dir) => {
      const meta = readMeta(dir);
      return { id: meta.id, name: meta.name, jobs: readStoredJobs(dir) };
    }),
    readLedger(sandboxRoot),
    readRefusals(sandboxRoot),
  );
}

/**
 * Fire one report row: the block as text, composed into an outbox to the
 * row's recipient and landed as a finished job. Throws with the reason when
 * the row cannot send — no channel, no recipient, or the contract refusing
 * the composition (a body over the channel's own cap, D-193) — and queues
 * nothing then, so the sweep lands the reason on the row like any other
 * failed firing.
 *
 * `add → start → write → complete` in one synchronous stretch: the job is
 * never queued where an agentling could pick it up, and the queue's own
 * completion seam parses the file back (`stampOutbox`), so what review shows
 * is what was written, read through the one reader every run's outbox has.
 */
export function fireRealWork(
  queue: JobQueue,
  row: { channel?: string; answers?: Record<string, string> },
  block: RealWorkBlock,
  now: number,
): Job {
  if (!row.channel) throw new Error('a report row needs a channel to send on');
  const recipient = recipientFor(row.answers, row.channel);
  if (!recipient) throw new Error('a report row needs a recipient');
  const composed = composeOutbox(row.channel, recipient, formatRealWork(block));
  if (composed.error) throw new Error(`OUTBOX.json: ${composed.error}`);

  const real = realCount(block);
  const job = queue.add({
    title: REALWORK_TITLE,
    prompt: REALWORK_PROMPT,
    channels: [row.channel],
    answers: row.answers,
  });
  const dir = queue.start(job.id);
  writeFileSync(path.join(dir, OUTBOX_FILE), `${JSON.stringify(composed.outboxes![0], null, 2)}\n`);
  queue.complete(
    job.id,
    `last week's real work — ${real} job${real === 1 ? '' : 's'} promoted or auto-sent on ${block.levels.length} real level${block.levels.length === 1 ? '' : 's'}; composed by the app, nothing ran`,
    { costUsd: 0, turns: 0, turnsAllowed: 0, durationMs: Math.max(0, Date.now() - now) },
  );
  return queue.get(job.id)!;
}
