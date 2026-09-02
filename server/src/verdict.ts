import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Job, PromotedTo, ResolvedBy, SendApprovalInfo, Verdict } from '@agentlings/shared';
import {
  hasVerdict,
  isResolvable,
  opKey,
  opLabel,
  promotedLine,
  repoTarget,
  slugProblem,
} from '@agentlings/shared';
import { describeApproval, recordApproval } from './approvals';
import { outboxRefusal } from './channels';
import type { Connection } from './connections';
import type { EventLog } from './events';
import {
  applyPatch,
  beginPatch,
  endPatch,
  patchFile,
  patchInFlight,
  type promoteToRemote,
} from './gitwork';
import { repriceChain, settleOutcome } from './ledger';
import { appendKnowledge, discardNotes, type CrewSeed, type LevelMeta } from './levels';
import type { Http } from './library';
import type { MemoryStore } from './memory';
import { appendMovesJournal, executeMoves } from './moves';
import { composeNomina, NOMINA_OUTPUT, nominaRefusal } from './nomina';
import { sentOn } from './outbox';
import type { OutboxSendOpts, performOutboxSend } from './outboxsend';
import { installPack, scanPacks } from './packs';
import type { PartyPlan } from './party';
import type { JobQueue } from './queue';
import { reconciliationRefusal, writeRollForward } from './reconciliation';
import { withholdingLeaks, withholdingRefusal } from './redact';
import { wireSettings, type StoredSettings } from './settings';
import { installTool, readTools, RUN_SCRIPT, toolDir, VERIFY_SCRIPT } from './tools';

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
  /** A branch and a pull request on a URL-backed level (D-275): `promoteToRemote`, or a fake. */
  pushRemote: typeof promoteToRemote;
  /** Queues a reviewed plan's hands, bound to the level. */
  queueParty: QueueParty;
}

/** What the desk sent beside the verdict; nothing, on the auto path. */
export interface VerdictGiven {
  /** The pack's slug as the review modal sent it — prefilled, so usually unchanged. */
  packSlug?: string;
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
 * composer's, after the payee gate let the batch through.
 */
export type VerdictRefusalKind = 'refused' | 'busy' | 'bug';

/**
 * A gate saying no to a verdict. Not the glossary's **Refusal** — that is a
 * sentence the desk was handed claiming a shelf-of-never row (`refusals.ts`);
 * this is a reviewed job the app will not stamp yet, and says why.
 */
export interface VerdictRefusal {
  reason: string;
  kind: VerdictRefusalKind;
  /**
   * Set only when a send partly succeeded before the refusal: how many
   * messages went, of how many were waiting to go. The desk reads the
   * reason and needs nothing else; the standing-approval path writes its own
   * sentence, so it is handed the numbers rather than parsing them back out.
   */
  partialSend?: { sent: number; of: number };
}

export type VerdictResult =
  | { refused: VerdictRefusal; job?: undefined; sendApproval?: undefined }
  | { refused?: undefined; job: Job; sendApproval?: SendApprovalInfo };

const refuse = (
  reason: string,
  kind: VerdictRefusalKind = 'refused',
  partialSend?: { sent: number; of: number },
): VerdictResult => ({
  refused: { reason, kind, ...(partialSend ? { partialSend } : {}) },
});

/**
 * Performs one verdict, whoever gives it, and returns the resolved job — with
 * the approval a promote of an outbox earned — or a refusal by name with the
 * job still reviewable. Every ordering rule the route used to carry lives
 * here: the send before anything applied, the racing-verdict re-read after
 * the send's await, then the tool, the pack, the party, the moves, the
 * nómina and the patch in that order, the discard banked before the stamp,
 * the roll-forward only after it, the cut legs repriced strictly before the
 * outcome settles. A refusal at any act leaves what already landed stamped.
 */
export async function performVerdict(
  rt: VerdictRuntime,
  pending: Job,
  verdict: Verdict,
  by: ResolvedBy,
  ctx: VerdictContext,
  given: VerdictGiven = {},
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
  // A compiled tool is executable instruction, so it installs on the same
  // approval as any other output rather than the moment it is written — and
  // a compile promotes only its tool: the send, the pack, the party, the
  // moves, the nómina and the patch all stand down while one is waiting.
  const waitingTool = promote
    ? readTools(rt.dir).find((t) => t.pendingJobId === pending.id)
    : undefined;
  /**
   * Discarding a compile un-reserves its name. The manifest is written before
   * the compiling session runs, so refusing its output has to remove it — left
   * behind it is a tool with nothing to execute, and `promote` reads it as
   * "a tool for that recipe already exists" and refuses every later attempt.
   *
   * Found by discarding one: the recipe became permanently uncompilable, which
   * is the opposite of what reviewing its output is for. The router was never
   * at risk — `usableTools` needs both scripts — so this was invisible until
   * somebody tried again (D-045). A clear leaves the compile uninstalled
   * exactly as a discard does, so the reserved name has to go either way
   * (D-216).
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
  if (promote && pending.outbox?.length && !waitingTool) {
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
       * the read→send→stamp gap — job 3e14937a sent Sammy the same PDF twice
       * through exactly that window. The recipients list is re-read under
       * the claim; `remaining` above only decides whether to enter at all.
       */
      const runs = await ctx.send({
        outboxes,
        jobId: pending.id,
        levelId: rt.meta.id,
        dir: rt.queue.sandboxDir(pending.id),
        sandboxRoot: install.sandboxRoot,
        env: install.env,
        // The one thread a reply can reach: the mail that queued this job
        // (D-248). A job with no trigger passes nothing, and a `reply: true`
        // message is then refused by the channel client by name.
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
          'refused',
          { sent: sentNow, of: remaining.length },
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
  /**
   * The compiling run has to have left both scripts; half a tool installs
   * nothing, the name stays reserved and the job stays reviewable.
   */
  if (waitingTool && !installTool(rt.dir, waitingTool, rt.queue.sandboxDir(pending.id))) {
    return refuse(`the compiling run did not leave both ${RUN_SCRIPT} and ${VERIFY_SCRIPT}`);
  }
  /**
   * A reviewed pack is installed exactly as a reviewed outbox is sent and a
   * reviewed patch applied: at Approve, by us, never by the session (M4).
   * Installing the identical pack again succeeds, so a retry after a failure
   * further down cannot be blocked by the work the first attempt did.
   */
  let installedPack: string | null = null;
  // An authoring job's whole deliverable is the pack. Promoting one with no
  // draft would stamp "promoted" while installing nothing and lock the retry
  // door behind the stamp — the first smooth chain did exactly that (D-156).
  // Refuse with the real reason instead. The marker is the author-pack
  // route's own prompt prefix, read at the chain's root so every
  // continuation leg carries it.
  const rootAsk = rt.queue.rootPrompt(pending.id) ?? pending.prompt;
  if (promote && !pending.packDraft && rootAsk.startsWith('Author a level pack:')) {
    return refuse(
      pending.packDraftError ??
        'no PACK.json at the sandbox root — if the run wrote it inside a folder, ' +
          'ask a follow-up run to move it up, then Approve again',
    );
  }
  if (promote && pending.packDraft && !waitingTool) {
    // The reviewer may rename it on the way through: a pack's name is the
    // one thing about it that has to be unique, so colliding must be fixable
    // at the review rather than a dead end. The modal prefills the slug and
    // always sends it, so an UNCHANGED slug is not a rename and is not
    // pre-checked against the installed list — measured on gates-of-troy
    // (D-141): Approve #1 installed the pack and then failed its repo patch;
    // Approve #2 was refused by #1's own install. installPack's
    // already-identical tolerance is the designed retry path.
    const sent = given.packSlug?.trim();
    const renamed = sent && sent !== pending.packDraft.slug ? sent : undefined;
    const draft = renamed ? { ...pending.packDraft, slug: renamed } : pending.packDraft;
    if (renamed) {
      const says = slugProblem(renamed, scanPacks(install.repoRoot).installed.map((p) => p.slug));
      if (says) return refuse(`pack not installed — ${says}`);
    }
    // The sandbox is where a draft's plates live (D-143); the install copies
    // them from there, re-checking at the moment of writing.
    const result = installPack(install.repoRoot, draft, rt.queue.sandboxDir(pending.id));
    if ('error' in result) return refuse(`pack not installed — ${result.error}`);
    if (!result.already) installedPack = draft.slug;
    // The name it went in under, so the record matches the world that now
    // exists — through the queue, which is what persists a job.
    if (renamed) rt.queue.setPackDraft(pending.id, draft);
  }
  /**
   * A reviewed party plan is performed exactly as a reviewed pack is
   * installed (TEAMWORK T3, D-196): approving it queues the hands as an
   * ordinary T2 party, carrying the spec the plan job stored — channels,
   * answers, and the load-bearing marks the reviewer just read. The model
   * proposed, the person disposed, and only now does anything run. The plan
   * job's own input files ride to every hand, since they are the request's
   * material.
   */
  if (promote && pending.partyDraft && pending.party?.plan && !waitingTool) {
    const spec = pending.party;
    const draft = pending.partyDraft;
    const loadBearing = draft.hands.flatMap((h, i) => (h.loadBearing ? [i + 1] : []));
    const inputDir = rt.queue.inputDir(pending.id);
    const carried: { name: string; data: Buffer }[] = existsSync(inputDir)
      ? readdirSync(inputDir, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => ({ name: e.name, data: readFileSync(path.join(inputDir, e.name)) }))
      : [];
    // A fully scoped plan on a repo level is a repo party (TEAMWORK T4):
    // hands clone and patch their own paths, the gather merges. The draft
    // validator already holds the all-or-none line, so a half-scoped plan
    // cannot reach here.
    const repoParty = Boolean(rt.meta.repoPath) && draft.hands.every((h) => h.scope?.length);
    ctx.queueParty(
      spec.asked ?? pending.prompt,
      {
        hands: draft.hands.map((h) => h.prompt),
        asked: { n: draft.hands.length, words: 'a planned party' },
      },
      {
        tools: pending.tools ?? [],
        ...(spec.channels?.length ? { channels: spec.channels } : {}),
        ...(spec.answers ? { answers: spec.answers } : {}),
        ...(loadBearing.length ? { loadBearing } : {}),
        ...(carried.length ? { attachments: carried } : {}),
        ...(repoParty ? { repo: true, scopes: draft.hands.map((h) => h.scope) } : {}),
        partyId: spec.id,
      },
    );
  }
  /**
   * A reviewed folder reorganization is replayed at Approve, by us, never by
   * the session (D-132): under the folder the job was pointed at — never a
   * root the model could name — each op stamped so a retry skips what
   * already moved, and a partial failure leaving the job reviewable so
   * "Approve again" finishes the rest and moves nothing twice. This is the
   * one act that touches a real folder outside the app.
   *
   * Deliberately synchronous end to end: with the recheck above, nothing
   * yields between reading `movesRun.done` and stamping it, so two Approves
   * cannot interleave here — the property D-160 had to build a claim to get
   * for the outbox, the event loop grants this stretch for free, and an
   * await introduced into it would silently take it away (D-162).
   */
  if (promote && pending.moves && pending.organizeRoot && !waitingTool) {
    const root = pending.organizeRoot;
    if (!existsSync(root)) return refuse(`the folder is not there any more: ${root}`);
    const alreadyDone = (pending.movesRun?.done ?? []).map(opKey);
    const run = executeMoves(pending.moves, root, alreadyDone);
    appendMovesJournal(rt.queue.sandboxDir(pending.id), {
      at: Date.now(),
      root,
      done: run.done,
      failed: run.failed,
    });
    rt.queue.recordMoves(pending.id, run);
    if (run.failed.length > 0) {
      const detail = run.failed.map((f) => `${opLabel(f.op)}: ${f.reason}`).join('; ');
      return refuse(
        `moved ${run.done.length}, but some failed — ${detail}. Approve again to retry; nothing moves twice.`,
      );
    }
  }
  /**
   * The batch, composed (D-268): written only here, only at Approve, and
   * only once the payee gate let it through — the same shape as the patch:
   * the real thing happens at the moment a person approves it, never when
   * the run finished. Until then there is no file to upload, which is what
   * "refused whole" has to mean for a deliverable.
   *
   * The composer re-asks the allowlist rather than trusting the gate, and
   * can still refuse on a column the specification bounds — a payee name of
   * 46 characters is nobody's fault and is not a file the bank would take.
   */
  let composedNomina = 0;
  if (promote && pending.nomina && !waitingTool) {
    const composed = composeNomina(pending.nomina, wireSettings(install.settings()));
    // Cannot refuse here: the gate asked this exact question, of the same
    // function, before anything was sent or applied. Kept as a guard rather
    // than an assertion because the alternative is writing a file we did not
    // check — but a refusal reaching this point is a bug, not a reviewer's
    // problem, and says so.
    if (composed.error !== undefined) {
      return refuse(
        `nómina not composed — ${composed.error} (this should have been refused before anything was sent; please report it)`,
        'bug',
      );
    }
    writeFileSync(path.join(rt.queue.sandboxDir(pending.id), NOMINA_OUTPUT), composed.text, 'utf8');
    // The file lands after the completion stamp, so what the sandbox holds is
    // counted again — otherwise the inbox reads a batch job as having
    // delivered a JSON declaration and no bank file.
    rt.queue.restampDelivered(pending.id);
    composedNomina = pending.nomina.rows.length;
  }
  /**
   * The reviewed patch, applied to the real repository — or, on a level
   * whose repo is a URL, a branch pushed and a pull request opened (D-275).
   * Where the level's repo actually is decides what promote *means*, and one
   * reader answers which, the same one the clone asked.
   *
   * A compiling run's deliverable is the tool, never the clone it tried the
   * tool out in: the session sensibly ran its own script to check it worked,
   * which left the output file in its clone, and promoting the compile
   * carried that stray file into the real repository. Its brief says to
   * change nothing else, so nothing else is what gets applied.
   */
  if (promote && pending.repoPath && !waitingTool) {
    const sandbox = rt.queue.sandboxDir(pending.id);
    const patch = patchFile(sandbox);
    const where = repoTarget(pending.repoPath);
    if (where.kind === 'unsupported') return refuse(where.reason);
    // A local path acts only when there is a patch to apply. A URL is asked
    // every time, because "there is no patch" is not the same as "there is
    // nothing to push" once a clone can hold commits — and deciding that
    // here would put the question in two places.
    if (where.kind === 'path' ? existsSync(patch) : true) {
      // The verdict's second await, claimed at the door (D-163): a verdict
      // landing inside it is refused as busy rather than racing `git apply`
      // on the real repository or disowning a patch already going in.
      // Released in `finally`, so a failed apply leaves the job resolvable.
      beginPatch(pending.id);
      try {
        if (where.kind === 'path') {
          await applyPatch(where.path, patch);
        } else {
          const to = await ctx.pushRemote(sandbox, where, pending, {
            http: install.http,
            token: install.env.GITHUB_TOKEN,
          });
          if (to) rt.queue.setPromotedTo(pending.id, to);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return refuse(
          where.kind === 'path' ? `patch did not apply: ${detail}` : `nothing was pushed: ${detail}`,
        );
      } finally {
        endPatch(pending.id);
      }
    }
  }

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
    // (D-150): work that fed an approved delivery finished by any honest
    // reading, and twice a chain of cut legs shipped a world for $0. Each
    // leg prices at min(cost, its own quote); real failures in the chain
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
    // `failed`, so settling the outcome first would skip the price. This
    // moves no money — a promoted run whose spend was unmeasurable stays
    // absorbed and still reads `done`, because absorbed is not failed.
    if (promote) settleOutcome(install.sandboxRoot, [pending.id, ...cutLegs]);
    rt.eventLog.emit({
      type: 'resolved',
      jobId: job.id,
      title: job.title,
      detail: resolvedLine(verdict, by, {
        sentNow,
        channels: (pending.outbox ?? []).map((o) => o.channel).join(' and '),
        installedPack,
        composedNomina,
        promotedTo: job.promotedTo,
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
 * The progress line the standing-approval path writes when the verdict it
 * asked for came back refused (D-278 Q9): a send that could not go out
 * is visible where a person looks rather than an error nobody sees. A
 * partial send keeps its own sentence — "sent 1 of 2" is an outcome, not a
 * failure to send, and what is left is now waiting for a person. The words
 * live here for the reason the resolved line's do: the feed is the module's,
 * and only the HTTP status belongs to the route.
 */
export function autoRefusalLine(refused: VerdictRefusal): string {
  return refused.partialSend
    ? `standing approval sent ${refused.partialSend.sent} of ${refused.partialSend.of} — the rest waits for your review`
    : `standing approval could not send — ${refused.reason}`;
}

/**
 * The feed line: your verb, not the ledger's. "promoted" is what the record
 * calls it; "approved" is what you did, and the feed is a list of your
 * decisions — and an auto-send says so, because it is precisely the case
 * nobody looked at (D-114). It names the act that happened, so the feed
 * remains the record: sent, installed the world, composed the batch, opened
 * the pull request.
 */
function resolvedLine(
  verdict: Verdict,
  by: ResolvedBy,
  acts: {
    sentNow: number;
    channels: string;
    installedPack: string | null;
    composedNomina: number;
    promotedTo: PromotedTo | undefined;
    chainPriced: ReturnType<typeof repriceChain>;
    rejected?: string;
  },
): string {
  if (verdict === 'clear') {
    return 'cleared — seen and let go: nothing applied, nothing banked, the work stays in the sandbox';
  }
  if (verdict === 'discard') {
    return (
      'discarded — nothing applied, the work stays in the sandbox' +
      (acts.rejected ? ` · ${acts.rejected} banked what was turned down` : '')
    );
  }
  const sent =
    acts.sentNow > 0
      ? by === 'app'
        ? `sent automatically — ${acts.sentNow} via ${acts.channels}, standing approval`
        : `approved — sent ${acts.sentNow} via ${acts.channels}`
      : acts.installedPack
        ? `approved — installed the ${acts.installedPack} world`
        : acts.composedNomina > 0
          ? // Never "paid": nothing was. The file is a deliverable, and the
            // act is Brian's token press at the bank (D-219, D-251).
            `approved — composed ${NOMINA_OUTPUT}, ${acts.composedNomina} ${acts.composedNomina === 1 ? 'payee' : 'payees'}; upload and authorise it at the bank`
          : acts.promotedTo
            ? // What promote did on a remote (D-275) — the feed is the record,
              // so it says which half happened. The sentence is the review
              // card's, from the one function both ask.
              `approved — ${promotedLine(acts.promotedTo)}`
            : 'approved';
  const priced =
    acts.chainPriced.rows > 0
      ? ` · the chain's ${acts.chainPriced.rows} cut leg${acts.chainPriced.rows === 1 ? '' : 's'} now charged $${acts.chainPriced.chargedUsd.toFixed(2)}`
      : '';
  return sent + priced;
}
