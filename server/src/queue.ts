import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type {
  CheckVerdict,
  Job,
  JobAttachment,
  JobMeter,
  MoveOp,
  Outbox,
  OutboxSent,
} from '@agentlings/shared';
import { MAX_STATIONS, opKey } from '@agentlings/shared';
import type { Verdict } from '@agentlings/shared';
import { CANCELLED, parsePending } from './executors/claude';
import { patchFile, summarizePatch, writeDiff } from './gitwork';
import { readOutbox } from './outbox';
import { attachmentShape } from './inputshape';
import { readReconciliation, summariseReconciliation } from './reconciliation';
import { readWithheld } from './redact';
import { MOVES_FILE, type MovesRunResult, readMoves } from './moves';
import { PARTY_FILE, readPartyDraft } from './party';
import { PACK_FILE, readPackDraft } from './packcontract';
import { deliveredFiles, deliverySummary, safeAttachmentName } from './outputs';
import { deliveredTool } from './tools';

export interface NewJobSpec {
  title: string;
  prompt: string;
  repoPath?: string;
  preferredRole?: string;
  /** Connections this job may use; absent means sandbox only. */
  tools?: string[];
  /** Skip the deterministic router and run a real session. */
  noRouter?: boolean;
  /** A turn cap this job needs in its own right, overriding the role's. */
  maxTurns?: number;
  /** Answers given before the run, handed to the session on top of the prompt. */
  clarifications?: string[];
  /** Files the user attached, written into the sandbox before it can run. */
  attachments?: { name: string; data: Buffer }[];
  /** This job compiles a recipe into a tool; recorded for the ledger's sake. */
  compile?: boolean;
  /** The job this one answers, whose sandbox it carries forward. */
  continues?: string;
  /** Standing instructions for the session, kept out of the prompt (D-074). */
  brief?: string;
  /** The channels this job sends on, when intake detected any (D-079, D-179). */
  channels?: string[];
  /** The real folder this job reorganizes, picked at intake (D-132). */
  organizeRoot?: string;
  /** Recipient and words both, when the desk holds the whole send (D-097). */
  send?: { to: string; words: string };
  /** Ceiling quoted before the work. */
  quotedUsd?: number;
  /** The sentences still to run after this one (D-105). */
  steps?: string[];
  /** Which step this job is, for the cards. */
  step?: { n: number; of: number };
  /** The previous step's job id — the chain link the review groups by. */
  stepPrev?: string;
  /** The chain asked for something to be kept out (D-183). */
  withholding?: boolean;
  /** The sentence asked for the work to be checked (TEAMWORK T1, D-194). */
  checked?: boolean;
  /** This job is a check pass: the job it checks, and whose work to avoid. */
  check?: { of: string; avoid?: string };
  /** This job is a hand of a work party, or its gather (TEAMWORK T2, D-195). */
  party?: Job['party'];
  /** The card's answers, carried so the rest of the chain can hear them. */
  answers?: Record<string, string>;
  /**
   * A channel the prompt mentioned that this job never carried (D-093), and
   * the channels it asked for that a one-channel job could not take (D-178).
   *
   * `channelMention` is here because it was *missing*: `queuedJobSpec` has
   * built it since D-093 and this interface never declared it, so `add` below
   * never copied it and `Job.channelMention` was never once set — the review
   * line telling a user that approving sends nothing could not render. Proven
   * by handing the spec straight to `add` and reading the job back. The exact
   * shape D-097 recorded twice: a correct function, a correct route, and the
   * thing building the object silently dropping the field.
   */
  channelMention?: { channel: string; label: string };
  alsoAsked?: { channel: string; label: string }[];
}

export function jobsFile(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'jobs.json');
}

/**
 * The stored jobs, read without opening the level. Constructing a JobQueue is
 * not a read — restore() fails running jobs over and rewrites the file — so
 * anything that only wants to look at a closed level's jobs comes here.
 */
export function readStoredJobs(sandboxRoot: string): Job[] {
  const file = jobsFile(sandboxRoot);
  if (!existsSync(file)) return [];
  try {
    const stored = JSON.parse(readFileSync(file, 'utf8')) as Job[];
    return Array.isArray(stored) ? stored.filter((job) => job?.id).map(liftJob) : [];
  } catch {
    return []; // a torn file reads as empty, the same tolerance restore() has
  }
}

/**
 * A job written before D-179 made channels, outboxes and send stamps into
 * lists — lifted on the way in, so no reader has to know both shapes and
 * nothing on disk has to be rewritten to be readable.
 *
 * Backfill by identification, never by guess (D-033): a legacy stamp belongs
 * to the one outbox that job had, and its channel is read off that outbox
 * rather than assumed. A stamp with no outbox to name keeps whatever channel
 * the job carried, and failing that is dropped — a send record naming no
 * channel cannot be deduplicated against anything, and a wrong name would
 * suppress a real send.
 */
function liftJob(job: Job): Job {
  // Read through a shape that describes what may be *on disk*, not what the
  // type says today — an intersection with `Job` would keep the new list
  // types and hide exactly the old ones this has to find.
  const legacy = job as unknown as {
    channel?: string;
    outbox?: Outbox | Outbox[];
    outboxSent?: OutboxSent | OutboxSent[];
  };
  if (typeof legacy.channel === 'string') {
    job.channels = [legacy.channel];
    delete legacy.channel;
  }
  const outboxes = Array.isArray(legacy.outbox)
    ? legacy.outbox
    : legacy.outbox
      ? [legacy.outbox]
      : undefined;
  if (outboxes) job.outbox = outboxes;
  const stamp = legacy.outboxSent;
  if (stamp && !Array.isArray(stamp)) {
    const channel = outboxes?.[0]?.channel ?? job.channels?.[0];
    job.outboxSent = channel ? [{ ...stamp, channel }] : undefined;
  }
  return job;
}

export const INTERRUPTED = 'interrupted — the app restarted while this was running';

/**
 * Job store plus station-slot bookkeeping and sandbox dirs, persisted to
 * disk so a restart no longer loses the queue.
 *
 * A job that was running when the process stopped cannot be resumed — its
 * session was a child process that died with it — so restoring marks it
 * failed rather than leaving a job that looks alive and never moves. Its
 * sandbox survives, so whatever it produced is still there to review.
 */
export class JobQueue {
  private jobs = new Map<string, Job>();
  private rev = 0;

  constructor(private sandboxRoot: string) {
    this.restore();
  }

  private restore(): void {
    const file = jobsFile(this.sandboxRoot);
    if (!existsSync(file)) return;
    let stored: Job[];
    try {
      stored = JSON.parse(readFileSync(file, 'utf8')) as Job[];
    } catch {
      return; // a torn file must not stop the level from opening
    }
    if (!Array.isArray(stored)) return;

    for (const raw of stored) {
      if (!raw?.id) continue;
      // The same lift `readStoredJobs` does, because both are ways in and a
      // way in that skipped it would put a legacy shape back in the map.
      const job = liftJob(raw);
      if (job.status === 'running') {
        job.status = 'failed';
        job.error = INTERRUPTED;
        job.finishedAt = job.finishedAt ?? Date.now();
        job.slot = -1;
      }
      // An assignment from the previous run is stale: that agentling is not
      // carrying this job any more, and leaving it set strands the job,
      // since only unassigned work is ever picked up.
      if (job.status === 'queued') job.assignedTo = undefined;
      this.jobs.set(job.id, job);
    }
    // A continuation names its parent, but until D-139 nothing stamped the
    // parent back — so an answered failure kept offering its reply box. The
    // child's `continues` identifies the parent exactly: backfill by
    // identification (D-026's rule), healing rows written before the field.
    for (const job of this.jobs.values()) {
      if (!job.continues) continue;
      const parent = this.jobs.get(job.continues);
      if (parent && !parent.continuedBy) parent.continuedBy = job.id;
    }
    // Runs finished before `delivered` existed are stamped once here, from
    // the sandbox they left — read, never guessed from the summary (D-026),
    // and only for jobs still lacking it (UI.md, step 9). A job whose
    // sandbox is gone stays unstamped, which the row reads as it always did.
    for (const job of this.jobs.values()) {
      if (job.delivered || job.status === 'queued' || job.status === 'running') continue;
      const dir = this.sandboxDir(job.id);
      if (!existsSync(dir)) continue;
      // A sandbox that exists but cannot be listed — a stray file where the
      // folder should be, an ACL — must not stop the level opening: the job
      // stays unstamped, which the row reads as it always did (review of
      // 2026-08-22).
      try {
        job.delivered = deliverySummary(dir);
      } catch {
        continue;
      }
    }
    this.persist();
  }

  /**
   * Writes the diff for jobs the last run was killed in the middle of.
   *
   * Their sandbox clone survived with the work in it, but the diff is written
   * after a session returns and there was nothing to return to — so the
   * changes existed on disk with no way to see or promote them. Async, and
   * therefore separate from restore(): opening a level must not wait on git.
   */
  async harvestInterrupted(): Promise<number> {
    let harvested = 0;
    for (const job of this.list()) {
      if (job.error !== INTERRUPTED || job.changes) continue;
      const dir = this.sandboxDir(job.id);
      if (!existsSync(path.join(dir, 'repo'))) continue;
      try {
        if (!(await writeDiff(dir))) continue;
        job.changes = summarizePatch(readFileSync(patchFile(dir), 'utf8'));
        job.status = 'partial';
        harvested++;
      } catch {
        // A sandbox we can no longer read is not worth failing a startup for.
      }
    }
    if (harvested > 0) this.persist();
    return harvested;
  }

  /**
   * Bumped on every change to the queue, so a watcher can be told the job list
   * again only when there is something new in it. Every mutator funnels
   * through `persist`, which is what makes one counter here trustworthy.
   */
  revision(): number {
    return this.rev;
  }

  private persist(): void {
    this.rev++;
    mkdirSync(this.sandboxRoot, { recursive: true });
    writeFileSync(jobsFile(this.sandboxRoot), `${JSON.stringify(this.list(), null, 2)}\n`);
  }

  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /**
   * The sentence a chain of continuations began with. A reply's prompt embeds
   * the whole transcript ("You have already worked on this…"), so anything
   * keyed on it — a standing approval's signature — mints a key no future
   * sentence can match. Recipes already credit a continuation as the job it
   * continues (D-074); this is the same identification for everyone else.
   * Stops at a missing parent or a cycle, and answers with the job's own
   * prompt when there is nothing further to walk to.
   */
  rootPrompt(id: string): string | undefined {
    let job = this.jobs.get(id);
    if (!job) return undefined;
    const seen = new Set<string>([job.id]);
    while (job.continues) {
      const parent = this.jobs.get(job.continues);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      job = parent;
    }
    return job.prompt;
  }

  /**
   * The whole chain a job sits at the end of: itself, then each parent up the
   * `continues` links — rootPrompt's walk, kept whole instead of keeping only
   * the top. The pricing seam reads it at promote (D-150): the cut legs that
   * fed a promoted end are the ones whose work landed.
   */
  ancestry(id: string): Job[] {
    const chain: Job[] = [];
    let job = this.jobs.get(id);
    const seen = new Set<string>();
    while (job && !seen.has(job.id)) {
      chain.push(job);
      seen.add(job.id);
      job = job.continues ? this.jobs.get(job.continues) : undefined;
    }
    return chain;
  }

  /**
   * The queued-event line for a carry-on of `previousId` — said where chain
   * steps and schedule firings already say how they came to exist. Without it
   * a continued run renders as a brand-new job with an identical title, and a
   * three-leg evening reads as twelve unrelated lines (D-192).
   */
  continuationDetail(previousId: string): string {
    return `more turns — leg ${this.ancestry(previousId).length + 1} of the same request`;
  }

  add(spec: NewJobSpec): Job {
    const job: Job = {
      id: randomUUID().slice(0, 8),
      title: spec.title,
      prompt: spec.prompt,
      repoPath: spec.repoPath,
      preferredRole: spec.preferredRole,
      ...(spec.tools?.length ? { tools: spec.tools } : {}),
      ...(spec.noRouter ? { noRouter: true } : {}),
      ...(spec.maxTurns ? { maxTurns: spec.maxTurns } : {}),
      ...(spec.clarifications?.length ? { clarifications: spec.clarifications } : {}),
      ...(spec.compile ? { compile: true } : {}),
      ...(spec.continues ? { continues: spec.continues } : {}),
      ...(spec.brief ? { brief: spec.brief } : {}),
      ...(spec.channels?.length ? { channels: spec.channels } : {}),
      ...(spec.organizeRoot ? { organizeRoot: spec.organizeRoot } : {}),
      ...(spec.send ? { send: spec.send } : {}),
      ...(spec.quotedUsd ? { quotedUsd: spec.quotedUsd } : {}),
      ...(spec.steps?.length ? { steps: spec.steps } : {}),
      ...(spec.step ? { step: spec.step } : {}),
      ...(spec.stepPrev ? { stepPrev: spec.stepPrev } : {}),
      ...(spec.answers && Object.keys(spec.answers).length ? { answers: spec.answers } : {}),
      ...(spec.withholding ? { withholding: true } : {}),
      ...(spec.checked ? { checked: true } : {}),
      ...(spec.check ? { check: spec.check } : {}),
      ...(spec.party ? { party: spec.party } : {}),
      ...(spec.channelMention ? { channelMention: spec.channelMention } : {}),
      ...(spec.alsoAsked?.length ? { alsoAsked: spec.alsoAsked } : {}),
      status: 'queued',
      slot: this.freeSlot(),
      createdAt: Date.now(),
    };
    const attached = this.writeAttachments(job.id, spec.attachments);
    if (attached.length > 0) job.attachments = attached;
    this.jobs.set(job.id, job);
    this.persist();
    return job;
  }

  /**
   * Puts attached files in the sandbox before the job is picked up.
   *
   * Written here rather than staged and copied at `start`, because the sandbox
   * is simply a directory and there is nothing to gain by creating it a few
   * minutes later — no staging area, no copy step, and nothing to orphan if
   * the job is never run.
   *
   * They go in `input/` rather than at the root, which is what keeps them from
   * being counted as output the run never produced: every "did it deliver"
   * check reads top-level files only.
   */
  private writeAttachments(
    jobId: string,
    files: { name: string; data: Buffer }[] | undefined,
  ): JobAttachment[] {
    if (!files?.length) return [];
    const dir = path.join(this.sandboxDir(jobId), 'input');
    mkdirSync(dir, { recursive: true });
    const written: JobAttachment[] = [];
    for (const file of files) {
      const name = safeAttachmentName(file.name);
      if (!name) continue;
      writeFileSync(path.join(dir, name), file.data);
      written.push({ name, bytes: file.data.length, shape: attachmentShape(name, file.data) });
    }
    return written;
  }

  /** Where a job's attached files wait for it. */
  inputDir(jobId: string): string {
    return path.join(this.sandboxDir(jobId), 'input');
  }

  /**
   * Oldest queued job this agentling should take: one matched to their role
   * first, then unrouted work, then work routed to a role nobody holds — so a
   * job whose specialist was never hired still gets done rather than starving.
   *
   * A check pass prefers a different member than the one whose work it checks
   * (TEAMWORK T1): `check.avoid` names them and they skip it — unless they are
   * the only awake holder of their role (`soleOfRole`), because a check that
   * starves is worse than a self-check in a fresh session (D-021: the second
   * process is what matters; a second identity is better when available).
   */
  nextUnassigned(
    role?: string,
    rolesPresent?: Set<string>,
    me?: { id: string; soleOfRole: boolean },
  ): Job | undefined {
    const waiting = this.list().filter(
      (j) =>
        j.status === 'queued' &&
        j.slot >= 0 &&
        !j.assignedTo &&
        !(me && j.check?.avoid === me.id && !me.soleOfRole),
    );
    return (
      waiting.find((j) => j.preferredRole && j.preferredRole === role) ??
      waiting.find((j) => !j.preferredRole) ??
      waiting.find((j) => !rolesPresent || !rolesPresent.has(j.preferredRole!))
    );
  }

  assign(jobId: string, agentlingId: string): void {
    this.mustGet(jobId).assignedTo = agentlingId;
    this.persist();
  }

  /** Marks the job running and returns its (created) sandbox directory. */
  start(jobId: string): string {
    const job = this.mustGet(jobId);
    job.status = 'running';
    job.startedAt = Date.now();
    const dir = this.sandboxDir(jobId);
    mkdirSync(dir, { recursive: true });
    this.persist();
    return dir;
  }

  /**
   * Whether the run left anything for the user — the one notion of delivery,
   * asked on both the success and the failure path.
   *
   * It was only ever asked on failure. A session that exits cleanly was
   * assumed to have delivered, and one that ends by explaining it *cannot* do
   * the job exits cleanly too: job 149620b5 said "I need write permission to
   * complete this job", produced an empty sandbox, and was filed `done` and
   * charged 4.7c (D-041).
   */
  private delivered(job: Job, sandbox: string): boolean {
    // A compile is judged only on its tool: half of one is not a delivery,
    // `installTool` refuses it, and its stray working files must not be
    // mistaken for output.
    if (job.compile) return deliveredTool(sandbox);
    return existsSync(patchFile(sandbox)) || deliveredFiles(sandbox);
  }

  complete(jobId: string, summary: string, meter?: JobMeter): void {
    const job = this.mustGet(jobId);
    // Finishing is not delivering. A run that produced nothing is a failure
    // however politely it ended, and its own summary is the best explanation
    // of why — so it becomes the error rather than being thrown away. Failure
    // is also what stops it being billed, since `priceFor` absorbs those.
    if (!this.delivered(job, this.sandboxDir(jobId))) {
      job.summary = summary;
      this.fail(jobId, summary, meter);
      return;
    }
    job.status = 'done';
    job.summary = summary;
    if (meter) job.meter = meter;
    const patch = patchFile(this.sandboxDir(jobId));
    if (existsSync(patch)) job.changes = summarizePatch(readFileSync(patch, 'utf8'));
    this.finish(job);
  }

  /**
   * A failure still records what it spent, and still shows any diff the run
   * managed to produce — otherwise absorbed cost is invisible and finished
   * work is thrown away because the last turn was cut.
   */
  fail(jobId: string, error: string, meter?: JobMeter): void {
    const job = this.mustGet(jobId);
    job.error = error;
    if (meter) job.meter = meter;
    const sandbox = this.sandboxDir(jobId);
    const patch = patchFile(sandbox);
    const hasPatch = existsSync(patch);
    if (hasPatch) job.changes = summarizePatch(readFileSync(patch, 'utf8'));
    // A run that died holding its deliverable did the work and lost the
    // write-up. Calling that a failure hides work that is ready to review.
    //
    // For most jobs the deliverable is a diff. For a compile it is never a
    // diff — its output is the two scripts, and `promote` deliberately does
    // not apply its patch — so asking only about a patch called every compile
    // a failure, including the one that wrote two working programs and ran out
    // saying so. Measured on job 760e0bf6: delivered, verified by hand, filed
    // `failed`. Running out is a compile's ordinary ending, the same way it is
    // the close-out's.
    //
    // For a job with no repository there is no diff to find, so asking only
    // about a patch called every such run a failure however much it produced.
    // Measured 2026-07-31 on job 2ff16bf2: a valid PDF written from scratch,
    // filed `failed`, reachable only through the backoffice. Delivery is
    // "it left something for the user", and a diff is one shape of that.
    //
    // Cancelling is the exception, and stays an exception: you stopped it on
    // purpose, and presenting the result as delivery would argue with that.
    // The guard belongs here rather than in the caller because a killed
    // session rejects through this path, not through `cancel`.
    job.status = this.delivered(job, sandbox) && error !== CANCELLED ? 'partial' : 'failed';
    this.finish(job);
  }

  resolve(jobId: string, action: Verdict): Job {
    const job = this.mustGet(jobId);
    if (job.status !== 'done' && job.status !== 'failed' && job.status !== 'partial') {
      throw new Error(`job ${jobId} is ${job.status}, not resolvable`);
    }
    job.status = action === 'promote' ? 'promoted' : action === 'discard' ? 'discarded' : 'cleared';
    this.persist();
    return job;
  }

  /**
   * Stop a job on purpose. A queued job simply never starts; a running one
   * needs its session killed by the executor first, which is the caller's
   * job — this only records the outcome.
   */
  cancel(jobId: string, meter?: JobMeter): Job {
    const job = this.mustGet(jobId);
    if (job.status !== 'queued' && job.status !== 'running') {
      throw new Error(`job ${jobId} is ${job.status}, not running`);
    }
    // Stays 'failed' even with a diff: you stopped this on purpose, and
    // presenting it as partial delivery would argue with that.
    job.status = 'failed';
    job.error = 'cancelled';
    if (meter) job.meter = meter;
    const patch = patchFile(this.sandboxDir(jobId));
    if (existsSync(patch)) job.changes = summarizePatch(readFileSync(patch, 'utf8'));
    this.finish(job);
    return job;
  }

  sandboxDir(jobId: string): string {
    return path.join(this.sandboxRoot, 'jobs', jobId);
  }

  private finish(job: Job): void {
    this.stampOutbox(job);
    this.stampWithheld(job);
    this.stampReconciliation(job);
    this.stampPackDraft(job);
    this.stampPartyDraft(job);
    this.stampMoves(job);
    this.stampPending(job);
    this.stampDelivered(job);
    job.finishedAt = Date.now();
    job.slot = -1;
    // Hand the freed slot to the oldest job still waiting without one.
    const waiting = this.list().find((j) => j.status === 'queued' && j.slot < 0);
    if (waiting) waiting.slot = this.freeSlot();
    this.persist();
  }

  /**
   * Parse anything the run asked to send, on every way a job ends — review
   * shows messages, not a filename, and an OUTBOX.json that is not a valid
   * outbox surfaces as its reason rather than reading as "no messages"
   * (D-075). One seam for complete, fail and cancel alike.
   */
  private stampOutbox(job: Job): void {
    // A compile's deliverable is its tool, never sends — same rule as
    // `delivered`, which judges a compile only on the tool it left.
    if (job.compile) return;
    const read = readOutbox(this.sandboxDir(job.id));
    if (!read) return;
    if (read.error) {
      job.outboxError = `OUTBOX.json: ${read.error}`;
      return;
    }
    // The brief's channel line, enforced (D-193 amendment): the brief had
    // promised "naming any other channel is refused" while nothing refused
    // it — a run pivoting a telegram job to gmail would have sailed to
    // Approve with none of the desk's contracts (recipients, legend,
    // standing-approval signature) ever asked for that channel. Fewer
    // channels than queued is fine (D-180: a missing recipient leaves that
    // channel out, said in RESULT.md); a channel the desk never settled is
    // not. A job that queued with no channels keeps its old behaviour —
    // that boundary is D-093's territory, not this rule's.
    const wrong = job.channels?.length
      ? read.outboxes!.find((o) => !job.channels!.includes(o.channel))
      : undefined;
    if (wrong) {
      job.outboxError =
        `OUTBOX.json: channel "${wrong.channel}" is not this job's — it was queued for ` +
        `${job.channels!.join(' and ')}, and a different channel needs its own sentence`;
      return;
    }
    job.outbox = read.outboxes;
  }

  /**
   * What the run says it took out before sending (D-181), read at the same
   * seam as the outbox — the two are judged together at Approve, so a
   * declaration that arrived and a declaration that parsed have to be the
   * same question. A malformed one surfaces as its reason rather than reading
   * as "nothing was withheld", which would turn the gate off in silence.
   */
  /**
   * The split a plan job proposed (TEAMWORK T3, D-196), read at the same
   * seam as every contract and only off a plan job — a PARTY.json on any
   * other job means nothing and stamps nothing. A malformed plan surfaces
   * as its reason, never as "no plan": promoting an unreviewable proposal
   * is exactly the trust hole the reviewed step exists to close.
   */
  private stampPartyDraft(job: Job): void {
    if (!job.party?.plan) return;
    const read = readPartyDraft(this.sandboxDir(job.id));
    if (!read) return;
    if ('error' in read) job.partyDraftError = `${PARTY_FILE}: ${read.error}`;
    else job.partyDraft = read.draft;
  }

  private stampWithheld(job: Job): void {
    if (job.compile) return;
    const read = readWithheld(this.sandboxDir(job.id));
    if (!read) return;
    if (read.error) job.withheldError = `WITHHELD.json: ${read.error}`;
    else job.withheld = read.withheld;
  }

  /**
   * The reconciliation the run declared, recomputed here and stamped on the
   * job (D-222) — the card and the Approve gate read this summary and never
   * the file's own claim of a balance. Same seam as the outbox and the
   * withheld declaration, for the same reason: one place decides what the
   * run left.
   */
  private stampReconciliation(job: Job): void {
    if (job.compile) return;
    const read = readReconciliation(this.sandboxDir(job.id));
    if (!read) return;
    if (read.reconciliation) job.reconciliation = summariseReconciliation(read.reconciliation);
    else job.reconciliationError = `RECONCILIATION.json: ${read.error}`;
  }

  /**
   * The world a run authored, if it left one (M4). Same seam and same rule as
   * the outbox: a malformed PACK.json surfaces as its reason rather than
   * reading as "no pack", because a job promoted while silently dropping the
   * only thing it was for is the worst outcome available.
   */
  /**
   * Where the run got to and what it left (D-114), read off the sandbox at the
   * same seam as the outbox and the pack.
   *
   * Read here rather than threaded back through the executor because the
   * close-out writes `PENDING.md` before either completion path returns, and
   * because this seam already fires on *every* ending — the review of a
   * cancelled run deserves the account as much as a finished one.
   */
  private stampPending(job: Job): void {
    const file = path.join(this.sandboxDir(job.id), 'PENDING.md');
    if (!existsSync(file)) return;
    const pending = parsePending(readFileSync(file, 'utf8'));
    if (pending) job.pending = pending;
  }

  /**
   * What the run left, counted at this seam because every ending passes
   * through it and the sandbox is final by now — the close-out has written
   * whatever it writes (UI.md, step 9). The one notion the backoffice row
   * reads, so "nothing on disk" can no longer be said of a run that wrote a
   * PDF the row never looked for.
   */
  private stampDelivered(job: Job): void {
    job.delivered = deliverySummary(this.sandboxDir(job.id));
  }

  private stampPackDraft(job: Job): void {
    if (job.compile) return;
    const dir = this.sandboxDir(job.id);
    // A pack delivered as an installable FOLDER — PACK.json and its rasters
    // one level down — is lifted to the root before reading (D-156). The
    // shape is coached by the checker's own CLI hint ("drop the folder into
    // web/public/packs"), and the first smooth chain followed it to the
    // letter: harvest found nothing, the promote stamped with no install.
    // Same bytes, normalised to where the contract reads; only when the
    // root has no PACK.json and exactly one child folder holds one.
    if (existsSync(dir) && !existsSync(path.join(dir, PACK_FILE))) {
      const holders = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(path.join(dir, e.name, PACK_FILE)))
        .map((e) => e.name);
      if (holders.length === 1) {
        const from = path.join(dir, holders[0]);
        for (const entry of readdirSync(from, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          const dest = path.join(dir, entry.name);
          if (!existsSync(dest)) copyFileSync(path.join(from, entry.name), dest);
        }
      }
    }
    const read = readPackDraft(dir);
    if (!read) return;
    if (read.error) job.packDraftError = `${PACK_FILE}: ${read.error}`;
    else job.packDraft = read.draft;
  }

  /**
   * The folder reorganization a run proposed, read off the sandbox at the same
   * seam as the outbox and the pack (D-132). Only a job that was pointed at a
   * folder can carry one — without a root there is nothing to move against, so
   * a stray MOVES.json from an ordinary job is ignored rather than acted on.
   */
  private stampMoves(job: Job): void {
    if (job.compile || !job.organizeRoot) return;
    const read = readMoves(this.sandboxDir(job.id));
    if (!read) return;
    if (read.error) job.movesError = `${MOVES_FILE}: ${read.error}`;
    else job.moves = read.moves;
  }

  /** Merges one Approve's send results; `sentTo` accumulates so retries skip them. */
  /**
   * Stamp a check pass's verdict onto the job it checked (TEAMWORK T1).
   * Through persist() like every mutation, so the revision moves and the
   * browser sees the card change.
   */
  recordCheckVerdict(jobId: string, verdict: CheckVerdict): Job {
    const job = this.mustGet(jobId);
    job.checkVerdict = verdict;
    this.persist();
    return job;
  }

  recordOutboxSends(
    jobId: string,
    channel: string,
    run: { sentTo: string[]; failed: { to: string; reason: string }[] },
  ): Job {
    const job = this.mustGet(jobId);
    const stamps = job.outboxSent ?? [];
    // Merged into this channel's own stamp (D-179), never across channels:
    // an address reached on Gmail says nothing about the same address on
    // Telegram, and one flat list would suppress the second send.
    const prior = stamps.find((s) => s.channel === channel);
    // A set, not a concatenation (D-160): the double-send stamped one
    // recipient twice and this line faithfully kept the duplicate — the
    // stamp is who has been sent to, not how many times sending happened.
    const merged = {
      at: Date.now(),
      channel,
      sentTo: [...new Set([...(prior?.sentTo ?? []), ...run.sentTo])],
      failed: run.failed,
    };
    job.outboxSent = prior
      ? stamps.map((s) => (s.channel === channel ? merged : s))
      : [...stamps, merged];
    this.persist();
    return job;
  }

  /** Merges one Approve's move results; `done` accumulates so retries skip them (D-132). */
  recordMoves(jobId: string, run: MovesRunResult): Job {
    const job = this.mustGet(jobId);
    const prior = job.movesRun?.done ?? [];
    // `done` records what is moved, not how many times moving happened — the
    // undo walks it backwards and a duplicated op would fail its second
    // reverse. The same set rule recordOutboxSends keeps for its stamp
    // (D-160; D-162).
    const seen = new Set(prior.map(opKey));
    const fresh = run.done.filter((op) => !seen.has(opKey(op)));
    job.movesRun = { at: Date.now(), done: [...prior, ...fresh], failed: run.failed };
    this.persist();
    return job;
  }

  /** After an undo, the ops still in force — what has not been reversed (D-132). */
  setMovesDone(jobId: string, done: MoveOp[]): Job {
    const job = this.mustGet(jobId);
    job.movesRun = { at: Date.now(), done, failed: [] };
    this.persist();
    return job;
  }

  /** A reply or carry-on took this job over (D-139) — the routes stamp the
   *  parent so its card can stop offering what has already been done. */
  markContinued(jobId: string, byJobId: string): Job {
    const job = this.mustGet(jobId);
    job.continuedBy = byJobId;
    this.persist();
    return job;
  }

  private freeSlot(): number {
    const used = new Set(
      this.list()
        .filter((j) => (j.status === 'queued' || j.status === 'running') && j.slot >= 0)
        .map((j) => j.slot),
    );
    for (let s = 0; s < MAX_STATIONS; s++) {
      if (!used.has(s)) return s;
    }
    return -1;
  }

  private mustGet(jobId: string): Job {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`unknown job ${jobId}`);
    return job;
  }
}
