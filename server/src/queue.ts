import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Job, JobAttachment, JobMeter } from '@agentlings/shared';
import { MAX_STATIONS } from '@agentlings/shared';
import { CANCELLED } from './executors/claude';
import { patchFile, summarizePatch, writeDiff } from './gitwork';
import { readOutbox } from './outbox';
import { PACK_FILE, readPackDraft } from './packcontract';
import { deliveredFiles, safeAttachmentName } from './outputs';
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
  /** The channel this job sends on, when intake detected one (D-079). */
  channel?: string;
  /** Recipient and words both, when the desk holds the whole send (D-097). */
  send?: { to: string; words: string };
  /** Ceiling quoted before the work. */
  quotedUsd?: number;
  /** The sentences still to run after this one (D-105). */
  steps?: string[];
  /** Which step this job is, for the cards. */
  step?: { n: number; of: number };
}

export function jobsFile(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'jobs.json');
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

    for (const job of stored) {
      if (!job?.id) continue;
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
      ...(spec.channel ? { channel: spec.channel } : {}),
      ...(spec.send ? { send: spec.send } : {}),
      ...(spec.quotedUsd ? { quotedUsd: spec.quotedUsd } : {}),
      ...(spec.steps?.length ? { steps: spec.steps } : {}),
      ...(spec.step ? { step: spec.step } : {}),
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
      written.push({ name, bytes: file.data.length });
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
   */
  nextUnassigned(role?: string, rolesPresent?: Set<string>): Job | undefined {
    const waiting = this.list().filter(
      (j) => j.status === 'queued' && j.slot >= 0 && !j.assignedTo,
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

  resolve(jobId: string, action: 'promote' | 'discard'): Job {
    const job = this.mustGet(jobId);
    if (job.status !== 'done' && job.status !== 'failed' && job.status !== 'partial') {
      throw new Error(`job ${jobId} is ${job.status}, not resolvable`);
    }
    job.status = action === 'promote' ? 'promoted' : 'discarded';
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
    this.stampPackDraft(job);
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
    if (read.error) job.outboxError = `OUTBOX.json: ${read.error}`;
    else job.outbox = read.outbox;
  }

  /**
   * The world a run authored, if it left one (M4). Same seam and same rule as
   * the outbox: a malformed PACK.json surfaces as its reason rather than
   * reading as "no pack", because a job promoted while silently dropping the
   * only thing it was for is the worst outcome available.
   */
  private stampPackDraft(job: Job): void {
    if (job.compile) return;
    const read = readPackDraft(this.sandboxDir(job.id));
    if (!read) return;
    if (read.error) job.packDraftError = `${PACK_FILE}: ${read.error}`;
    else job.packDraft = read.draft;
  }

  /** Merges one Approve's send results; `sentTo` accumulates so retries skip them. */
  recordOutboxSends(
    jobId: string,
    run: { sentTo: string[]; failed: { to: string; reason: string }[] },
  ): Job {
    const job = this.mustGet(jobId);
    const prior = job.outboxSent?.sentTo ?? [];
    job.outboxSent = { at: Date.now(), sentTo: [...prior, ...run.sentTo], failed: run.failed };
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
