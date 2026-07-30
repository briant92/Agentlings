import { execFile } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

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

/** Promote: replay the reviewed patch onto the real repository's working tree. */
export async function applyPatch(targetRepoPath: string, patch: string): Promise<void> {
  if (!existsSync(patch)) throw new Error('no DIFF.patch to apply');
  await run('git', ['-C', targetRepoPath, 'apply', '--whitespace=nowarn', patch]);
}
