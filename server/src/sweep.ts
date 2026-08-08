import { existsSync, readdirSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Job, SweepResult, WorkingCopiesInfo } from '@agentlings/shared';
import { repoDir } from './gitwork';
import { listLevelDirs } from './levels';
import { readStoredJobs } from './queue';

/**
 * The disk weight is not the levels, it is the repo/ working copies inside
 * job sandboxes — measured 2026-08-08 at 1,003 MB of a 1,019 MB store. The
 * sweep removes only those clones, and only under promoted or discarded
 * jobs: a done, partial or failed job's clone is where a reply's
 * continuation still works ("the review gate recovers work from runs
 * nobody was billed for"), and a sandbox with no job row proves nothing
 * about itself, so it is kept rather than guessed at. Transcripts,
 * close-outs, outputs and everything else in the sandbox stay — a redo
 * clones fresh anyway.
 *
 * The walk is async because the store is not small: the first live call
 * measured 19 seconds over ~150k files, and a synchronous walk holds the
 * event loop — the sim, the sockets and every other request — for all of
 * it. Sizes ride the thread pool instead; the world keeps ticking.
 */

const SWEEPABLE = new Set<Job['status']>(['promoted', 'discarded']);

async function dirBytes(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0; // unreadable counts as nothing rather than failing the scan
  }
  let total = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += await dirBytes(full);
      else if (entry.isFile()) total += (await stat(full)).size;
    } catch {
      // A file the sync client is holding: skip it, keep counting.
    }
  }
  return total;
}

/** Every repo/ under every level's sandboxes, split by whether it may go. */
function scanClones(sandboxRoot: string): { sweepable: string[]; kept: string[] } {
  const sweepable: string[] = [];
  const kept: string[] = [];
  // Closed levels included on purpose: the rule is per-job, not per-level.
  for (const levelDir of listLevelDirs(sandboxRoot)) {
    const statusOf = new Map(readStoredJobs(levelDir).map((job) => [job.id, job.status]));
    const jobsRoot = path.join(levelDir, 'jobs');
    if (!existsSync(jobsRoot)) continue;
    for (const entry of readdirSync(jobsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const repo = repoDir(path.join(jobsRoot, entry.name));
      if (!existsSync(repo)) continue;
      const status = statusOf.get(entry.name);
      (status && SWEEPABLE.has(status) ? sweepable : kept).push(repo);
    }
  }
  return { sweepable, kept };
}

export async function workingCopies(sandboxRoot: string): Promise<WorkingCopiesInfo> {
  const { sweepable, kept } = scanClones(sandboxRoot);
  const sum = async (dirs: string[]) =>
    (await Promise.all(dirs.map(dirBytes))).reduce((total, bytes) => total + bytes, 0);
  return {
    sweepable: { clones: sweepable.length, bytes: await sum(sweepable) },
    kept: { clones: kept.length, bytes: await sum(kept) },
  };
}

/**
 * Remove the sweepable clones. Bytes are measured before each removal and
 * counted only when the removal went through whole, so the report never
 * claims space a locked file kept.
 */
export async function sweepWorkingCopies(sandboxRoot: string): Promise<SweepResult> {
  const { sweepable } = scanClones(sandboxRoot);
  const result: SweepResult = { clones: 0, bytes: 0, skipped: 0 };
  for (const repo of sweepable) {
    const bytes = await dirBytes(repo);
    try {
      await rm(repo, { recursive: true, force: true });
      result.clones++;
      result.bytes += bytes;
    } catch {
      result.skipped++;
    }
  }
  return result;
}
