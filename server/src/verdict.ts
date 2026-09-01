import { rmSync } from 'node:fs';
import type { Job, ResolvedBy, SendApprovalInfo, Verdict } from '@agentlings/shared';
import { hasVerdict, isResolvable } from '@agentlings/shared';
import { describeApproval, recordApproval } from './approvals';
import { outboxRefusal } from './channels';
import type { Connection } from './connections';
import type { EventLog } from './events';
import { patchInFlight, type promoteToRemote } from './gitwork';
import { repriceChain, settleOutcome } from './ledger';
import { appendKnowledge, discardNotes, type CrewSeed, type LevelMeta } from './levels';
import type { Http } from './library';
import type { MemoryStore } from './memory';
import { nominaRefusal } from './nomina';
import { sentOn } from './outbox';
import type { OutboxSendOpts, performOutboxSend } from './outboxsend';
import type { PartyPlan } from './party';
import type { JobQueue } from './queue';
import { reconciliationRefusal, writeRollForward } from './reconciliation';
import { withholdingLeaks, withholdingRefusal } from './redact';
import { wireSettings, type StoredSettings } from './settings';
import { readTools, toolDir } from './tools';

/**
 * The verdict on a job — promote, discard or clear — performed whoever gives
 * it (D-278). One module for the gates that may refuse it by name, the acts a
 * promote carries out, and the settlement that stamps the job, records the
 * approval, prices the work and writes the feed line. The desk route and the
 * standing-approval path are its two callers; until they are migrated (#37,
 * #38) nothing calls it.
 *
 * Refusals are returned, never thrown: the reason is what the desk shows, in
 * the words it has always shown, and the kind is what each caller maps to its
 * own answer — 400, 409 or 500 at the route, a progress line on the auto path.
 */

/**
 * Where this install keeps things and what it can reach — the shape
 * `QUOTE_CTX` already proves, declared once so the intake, the engine choice
 * and the sweeps can take the same one when their turn comes (D-278 Q8).
 * Connections and settings are thunks: read at the call, as today.
 */
export interface InstallContext {
  sandboxRoot: string;
  repoRoot: string;
  env: Record<string, string | undefined>;
  http: Http;
  connections: () => Connection[];
  settings: () => StoredSettings;
}

/**
 * Queue the hands of a reviewed party plan (TEAMWORK T3). Intake glue the
 * verdict cannot import, so it rides the context bound to the level (D-278
 * Q4) until the Intake module replaces it. The shape is `queueParty`'s own.
 */
export type QueueParty = (
  text: string,
  plan: PartyPlan,
  opts: {
    tools?: string[];
    channel?: string;
    answers?: Record<string, string>;
    attachments?: { name: string; data: Buffer }[];
    channels?: string[];
    loadBearing?: number[];
    partyId?: string;
    repo?: boolean;
    scopes?: (string[] | undefined)[];
  },
) => Job[];

/**
 * What a verdict needs beyond the install: the two acts that leave the
 * machine, as adapters — real in the server, recording fakes in a test — and
 * the party thunk. Everything else a promote does is a plain import pointed at
 * a directory (D-278 Q3).
 */
export interface VerdictContext {
  install: InstallContext;
  /** The one send door (D-160): `performOutboxSend`, or a fake honouring its contract. */
  send: (opts: OutboxSendOpts) => ReturnType<typeof performOutboxSend>;
  /** A branch and a pull request on a URL-backed level (D-275). Absent until #36 moves the push. */
  pushRemote?: typeof promoteToRemote;
  /** Absent until #36 moves the party act. */
  queueParty?: QueueParty;
}

/** The slice of a level's runtime a verdict touches. `index.ts`'s `LevelRuntime` satisfies it. */
export interface VerdictRuntime {
  meta: Pick<LevelMeta, 'id' | 'repoPath'>;
  dir: string;
  queue: JobQueue;
  eventLog: EventLog;
  memory: MemoryStore;
  roster: CrewSeed[];
}

/**
 * `refused` is a gate's answer (400), `busy` a claim's (409): another request
 * holds this job's send or patch, or resolved it while the send ran. `bug` is
 * a refusal that should have happened earlier and did not (500) — the nómina
 * composer's, when #36 moves it.
 */
export type RefusalKind = 'refused' | 'busy' | 'bug';

export interface Refusal {
  reason: string;
  kind: RefusalKind;
}

export type VerdictResult =
  | { refused: Refusal; job?: undefined; sendApproval?: undefined }
  | { refused?: undefined; job: Job; sendApproval?: SendApprovalInfo };

const refuse = (reason: string, kind: RefusalKind = 'refused'): VerdictResult => ({
  refused: { reason, kind },
});

/**
 * Performs one verdict, whoever gives it, and returns the resolved job — with
 * the approval a promote of an outbox earned — or a refusal by name with the
 * job still reviewable. Every ordering rule the route used to carry lives
 * here: the send before anything applied, the racing-verdict re-read after
 * the send's await, the discard banked before the stamp, the roll-forward
 * only after it, the cut legs repriced strictly before the outcome settles.
 */
export async function performVerdict(
  rt: VerdictRuntime,
  pending: Job,
  verdict: Verdict,
  by: ResolvedBy,
  ctx: VerdictContext,
): Promise<VerdictResult> {
  const { install } = ctx;
  // A verdict must never land inside this job's own patch-apply await
  // (D-163): a second promote would race `git apply` on the real repository,
  // and a discard would disown a patch already going in.
  if (patchInFlight(pending.id)) {
    return refuse(
      "this job's patch is still applying — the first Approve is doing it; try again when it lands",
      'busy',
    );
  }
  // The statuses that may take a verdict — the queue's own rule, asked here
  // in the queue's words before anything real rather than by its throw at
  // the tail (D-278 Q5).
  if (!isResolvable(pending.status)) {
    return refuse(`job ${pending.id} is ${pending.status}, not resolvable`);
  }
  const promote = verdict === 'promote';
  /**
   * Discarding a compile un-reserves its name. The manifest is written before
   * the compiling session runs, so refusing its output has to remove it — left
   * behind it is a tool with nothing to execute, and `promote` reads it as
   * "a tool for that recipe already exists" and refuses every later attempt
   * (D-045). A clear leaves the compile uninstalled exactly as a discard does,
   * so the reserved name has to go either way (D-216).
   */
  if (!promote) {
    const abandoned = readTools(rt.dir).find((t) => t.pendingJobId === pending.id);
    if (abandoned) rmSync(toolDir(rt.dir, abandoned.name), { recursive: true, force: true });
  }
  /**
   * The reconciliation gate (D-222): the run was asked for a statement whose
   * two sides meet, the queue recomputed both at completion, and an Approve
   * of one that does not balance is refused by name before anything real
   * happens. A declaration that did not parse blocks too, for WITHHELD's
   * reason: read as "nothing to check", the gate would be off exactly where
   * it was asked for. A clear or a discard pass — neither keeps anything.
   */
  if (promote) {
    const unreconciled = reconciliationRefusal(pending);
    if (unreconciled) return refuse(unreconciled);
  }
  /**
   * The payee gate (D-268), beside the reconciliation gate and before any
   * send, patch or install: a batch naming somebody nobody approved is
   * refused whole, by name, with the job still reviewable and nothing
   * written — asked of Settings *now*, so adding the payee and pressing
   * Approve again is the whole fix.
   */
  if (promote) {
    const unapproved = nominaRefusal(pending, wireSettings(install.settings()));
    if (unapproved) return refuse(`nómina not composed — ${unapproved}`);
  }
  /**
   * A reviewed outbox is replayed exactly as a reviewed patch is: at Approve,
   * by us, never by the session (D-075). Before the patch on purpose — a
   * refused send must leave nothing half-promoted, while a failed patch after
   * a send retries cleanly, because recipients already sent to are skipped.
   *
   * Partial failures are the same shape as a refusal — results are stamped
   * per recipient first, so a second Approve retries only what failed and
   * can never message anyone twice.
   */
  let sentNow = 0;
  if (promote && pending.outbox?.length) {
    const outboxes = pending.outbox;
    // Counted per channel (D-179): the same address on two channels is two
    // messages, and one flat list would call the second one already sent.
    const remaining = outboxes.flatMap((outbox) =>
      outbox.messages.filter((m) => !sentOn(pending, outbox.channel).includes(m.to)),
    );
    if (remaining.length > 0) {
      const refusal = outboxRefusal(outboxes, install.connections(), install.settings(), install.env);
      if (refusal) return refuse(`outbox not sent — ${refusal}`);
      /**
       * The withholding gate (D-181), before the door and before any send:
       * the run said it took these values out; if one is still in a message,
       * a subject or a readable attachment the whole send is refused, because
       * sending the clean half of a redaction is sending half a leak. A
       * declaration that did not parse blocks too — reading it as "nothing
       * was withheld" would turn the gate off exactly where it was asked for.
       */
      if (pending.withheldError) {
        return refuse(`outbox not sent — ${pending.withheldError}. Nothing was sent.`);
      }
      if (pending.withheld) {
        const gate = withholdingLeaks(outboxes, pending.withheld, rt.queue.sandboxDir(pending.id));
        const leaked = withholdingRefusal(gate);
        if (leaked) return refuse(`outbox not sent — ${leaked}`);
      }
      /**
       * One door, claimed per job (D-160): a second Approve landing while
       * this one is mid-send is refused by name instead of racing through
       * the read→send→stamp gap. The recipients list is re-read under the
       * claim; `remaining` above only decides whether to enter at all.
       */
      const runs = await ctx.send({
        outboxes,
        jobId: pending.id,
        levelId: rt.meta.id,
        dir: rt.queue.sandboxDir(pending.id),
        sandboxRoot: install.sandboxRoot,
        env: install.env,
        // The one thread a reply can reach: the mail that queued this job
        // (D-248). A job with no trigger passes nothing.
        ...(pending.mailTrigger
          ? {
              mailThread: {
                threadId: pending.mailTrigger.threadId,
                msgId: pending.mailTrigger.msgId,
              },
            }
          : {}),
        alreadySent: (channel) => sentOn(rt.queue.get(pending.id), channel),
        record: (channel, r) => rt.queue.recordOutboxSends(pending.id, channel, r),
      });
      if (!runs) {
        return refuse(
          'this outbox is already sending — the first Approve is doing it; the card updates when it lands',
          'busy',
        );
      }
      sentNow = runs.reduce((n, r) => n + r.run.sentTo.length, 0);
      const failures = runs.flatMap((r) => r.run.failed.map((f) => ({ ...f, channel: r.channel })));
      if (failures.length > 0) {
        // The channel is named per failure: with two in play, "ana@x — not
        // connected" leaves the user guessing which send it belonged to.
        const detail = failures.map((f) => `${f.to} on ${f.channel}: ${f.reason}`).join('; ');
        return refuse(
          `sent ${sentNow} of ${remaining.length} — ${detail}. Approve again to retry the failures; nobody is messaged twice.`,
        );
      }
    }
  }
  /**
   * The send above is the first await. If another request resolved the job
   * while it ran — a discard racing a promote through that window; a second
   * promote is already refused by the send's own claim — everything below
   * would act for a verdict that no longer stands. The finished sends are
   * stamped and safe; stop here, before anything else real (D-162).
   */
  const current = rt.queue.get(pending.id);
  if (current && hasVerdict(current.status)) {
    return refuse(
      `while the outbox was sending, this job was ${current.status} by another request — nothing further was applied`,
      'busy',
    );
  }
  // The acts that stay on the machine — the compiled tool, the pack, the
  // party, the moves, the nómina, the patch or the push — join here (#36).

  /**
   * A delivery the user refused is banked before the stamp (D-201). Only a
   * delivery: `done` and `partial` are work handed over and turned down,
   * while discarding a `failed` job is clearing away a run that never
   * delivered. The maker is identified by `assignedTo` in this level's
   * roster; a job whose author is gone banks nothing rather than crediting a
   * lesson to whoever holds that role now (D-030's rule).
   */
  const rejected =
    verdict === 'discard' && (pending.status === 'done' || pending.status === 'partial')
      ? rt.roster.find((s) => s.id === pending.assignedTo)
      : undefined;
  if (rejected) {
    const notes = discardNotes({
      date: new Date().toISOString().slice(0, 10),
      maker: rejected,
      title: pending.title,
      reply: pending.reply,
    });
    rt.memory.append(rejected.name, notes.lesson);
    appendKnowledge(rt.dir, notes.note);
  }

  try {
    const job = rt.queue.resolve(pending.id, verdict, by);
    // The approved statement becomes the level's roll-forward state (D-223),
    // banked only after the stamp landed and only for a promote: a clear
    // writes nothing (D-216), a discard is a verdict on the run. Synchronous,
    // so the stretch between stamp and state admits no interleaving (D-162).
    if (promote && pending.reconciliation?.balances) writeRollForward(rt.dir, pending);
    // A reviewed, fully sent outbox is one more unchanged approval — the
    // count a standing approval is earned by (D-082). Recorded only on a
    // promote that got this far: every message either sent now or before.
    // Keyed on the root sentence, not the reply transcript (D-074's rule).
    const approval =
      promote && pending.outbox
        ? describeApproval(
            recordApproval(
              rt.dir,
              rt.queue.rootPrompt(pending.id) ?? pending.prompt,
              pending.outbox,
              Date.now(),
            ),
          )
        : null;
    // The chain's cut legs earn their price the moment the end promotes
    // (D-150): each at min(cost, its own quote); real failures in the chain
    // stay absorbed — only the funded-leash cuts are the seam.
    const cutLegs = promote
      ? rt.queue
          .ancestry(pending.id)
          .filter((leg) => leg.meter?.outOfTurns || leg.meter?.timedOut)
          .map((leg) => leg.id)
      : [];
    const chainPriced = promote
      ? repriceChain(install.sandboxRoot, cutLegs)
      : { rows: 0, chargedUsd: 0 };
    // And the row stops calling accepted work a failure (D-205). Strictly
    // after the repricing: `repriceChain` only touches rows that read
    // `failed`, so settling the outcome first would skip the price.
    if (promote) settleOutcome(install.sandboxRoot, [pending.id, ...cutLegs]);
    rt.eventLog.emit({
      type: 'resolved',
      jobId: job.id,
      title: job.title,
      detail: resolvedLine(verdict, by, {
        sentNow,
        channels: (pending.outbox ?? []).map((o) => o.channel).join(' and '),
        chainPriced,
        rejected: rejected?.name,
      }),
      by,
    });
    return { job, ...(approval ? { sendApproval: approval } : {}) };
  } catch (err) {
    return refuse(err instanceof Error ? err.message : String(err));
  }
}

/**
 * The feed line: your verb, not the ledger's. "promoted" is what the record
 * calls it; "approved" is what you did, and the feed is a list of your
 * decisions — and an auto-send says so, because it is precisely the case
 * nobody looked at (D-114).
 */
function resolvedLine(
  verdict: Verdict,
  by: ResolvedBy,
  did: {
    sentNow: number;
    channels: string;
    chainPriced: { rows: number; chargedUsd: number };
    rejected?: string;
  },
): string {
  if (verdict === 'clear') {
    return 'cleared — seen and let go: nothing applied, nothing banked, the work stays in the sandbox';
  }
  if (verdict === 'discard') {
    return (
      'discarded — nothing applied, the work stays in the sandbox' +
      (did.rejected ? ` · ${did.rejected} banked what was turned down` : '')
    );
  }
  const sent =
    did.sentNow > 0
      ? by === 'app'
        ? `sent automatically — ${did.sentNow} via ${did.channels}, standing approval`
        : `approved — sent ${did.sentNow} via ${did.channels}`
      : 'approved';
  const priced =
    did.chainPriced.rows > 0
      ? ` · the chain's ${did.chainPriced.rows} cut leg${did.chainPriced.rows === 1 ? '' : 's'} now charged $${did.chainPriced.chargedUsd.toFixed(2)}`
      : '';
  return sent + priced;
}
