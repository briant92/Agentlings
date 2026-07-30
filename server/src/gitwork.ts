import { execFile } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { JobChanges } from '@agentlings/shared';

const run = promisify(execFile);
const MAX_DIFF_BYTES = 50 * 1024 * 1024;

/** The job's working copy inside its sandbox. */
export function repoDir(sandboxDir: string): string {
  return path.join(sandboxDir, 'repo');
}

export function patchFile(sandboxDir: string): string {
  return path.join(sandboxDir, 'DIFF.patch');
}

/** Cheap local clone the agent can tear up without touching the original. */
export async function cloneRepo(repoPath: string, sandboxDir: string): Promise<string> {
  const target = repoDir(sandboxDir);
  await run('git', ['clone', '--local', '--no-hardlinks', repoPath, target]);
  return target;
}

/**
 * Captures everything the agent changed in the clone (including new files)
 * as DIFF.patch at the sandbox root. Returns false when nothing changed.
 */
export async function writeDiff(sandboxDir: string): Promise<boolean> {
  const repo = repoDir(sandboxDir);
  await run('git', ['-C', repo, 'add', '-N', '.']);
  const { stdout } = await run('git', ['-C', repo, 'diff', '--binary'], {
    maxBuffer: MAX_DIFF_BYTES,
  });
  const file = patchFile(sandboxDir);
  if (!stdout.trim()) {
    rmSync(file, { force: true });
    return false;
  }
  writeFileSync(file, stdout);
  return true;
}

/**
 * Reads a unified diff into counts a non-expert can act on: how many files,
 * how many lines in and out. Deletions name the file on the "---" side.
 */
export function summarizePatch(patch: string): JobChanges {
  const names = new Set<string>();
  let added = 0;
  let removed = 0;
  let lastFrom: string | null = null;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith('--- ')) {
      lastFrom = line.startsWith('--- a/') ? line.slice(6) : null;
    } else if (line.startsWith('+++ ')) {
      const to = line.startsWith('+++ b/') ? line.slice(6) : null;
      const name = to ?? lastFrom;
      if (name) names.add(name);
    } else if (line.startsWith('+')) {
      added++;
    } else if (line.startsWith('-')) {
      removed++;
    }
  }
  return { files: names.size, added, removed, names: [...names] };
}

/** Promote: replay the reviewed patch onto the real repository's working tree. */
export async function applyPatch(targetRepoPath: string, patch: string): Promise<void> {
  if (!existsSync(patch)) throw new Error('no DIFF.patch to apply');
  await run('git', ['-C', targetRepoPath, 'apply', '--whitespace=nowarn', patch]);
}
