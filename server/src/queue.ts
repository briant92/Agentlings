import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Job, JobMeter } from '@agentlings/shared';
import { MAX_STATIONS } from '@agentlings/shared';
import { patchFile, summarizePatch } from './gitwork';

export interface NewJobSpec {
  title: string;
  prompt: string;
  repoPath?: string;
  preferredRole?: string;
  /** Connections this job may use; absent means sandbox only. */
  tools?: string[];
  /** Skip the deterministic router and run a real session. */
  noRouter?: boolean;
  /** Ceiling quoted before the work. */
  quotedUsd?: number;
}

/** In-memory job store plus station-slot bookkeeping and sandbox dirs. */
export class JobQueue {
  private jobs = new Map<string, Job>();

  constructor(private sandboxRoot: string) {}

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
      ...(spec.quotedUsd ? { quotedUsd: spec.quotedUsd } : {}),
      status: 'queued',
      slot: this.freeSlot(),
      createdAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    return job;
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
  }

  /** Marks the job running and returns its (created) sandbox directory. */
  start(jobId: string): string {
    const job = this.mustGet(jobId);
    job.status = 'running';
    job.startedAt = Date.now();
    const dir = this.sandboxDir(jobId);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  complete(jobId: string, summary: string, meter?: JobMeter): void {
    const job = this.mustGet(jobId);
    job.status = 'done';
    job.summary = summary;
    if (meter) job.meter = meter;
    const patch = patchFile(this.sandboxDir(jobId));
    if (existsSync(patch)) job.changes = summarizePatch(readFileSync(patch, 'utf8'));
    this.finish(job);
  }

  fail(jobId: string, error: string): void {
    const job = this.mustGet(jobId);
    job.status = 'failed';
    job.error = error;
    this.finish(job);
  }

  resolve(jobId: string, action: 'promote' | 'discard'): Job {
    const job = this.mustGet(jobId);
    if (job.status !== 'done' && job.status !== 'failed') {
      throw new Error(`job ${jobId} is ${job.status}, not resolvable`);
    }
    job.status = action === 'promote' ? 'promoted' : 'discarded';
    return job;
  }

  sandboxDir(jobId: string): string {
    return path.join(this.sandboxRoot, 'jobs', jobId);
  }

  private finish(job: Job): void {
    job.finishedAt = Date.now();
    job.slot = -1;
    // Hand the freed slot to the oldest job still waiting without one.
    const waiting = this.list().find((j) => j.status === 'queued' && j.slot < 0);
    if (waiting) waiting.slot = this.freeSlot();
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
