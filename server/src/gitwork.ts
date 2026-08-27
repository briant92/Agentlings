import { execFile, execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { branchName, type JobChanges, type PromotedTo, repoTarget } from '@agentlings/shared';
import { openPullRequest } from './github';
import type { Http } from './library';

const run = promisify(execFile);
const MAX_DIFF_BYTES = 50 * 1024 * 1024;

/** The job's working copy inside its sandbox. */
export function repoDir(sandboxDir: string): string {
  return path.join(sandboxDir, 'repo');
}

export function patchFile(sandboxDir: string): string {
  return path.join(sandboxDir, 'DIFF.patch');
}

/**
 * Git is never given the token in an argument or in a URL: `-c` config set
 * before the subcommand is transient — unlike `clone --config`, it is not
 * written into the new repository — so the clone the session then works in
 * holds a plain remote and no credential of the operator's.
 *
 * `GIT_TERMINAL_PROMPT=0` is the other half: without it a private repo and no
 * token is not a failure, it is a server waiting forever for a username.
 */
function gitAuth(token?: string): { config: string[]; env: NodeJS.ProcessEnv } {
  const config = ['-c', 'credential.helper='];
  if (token) {
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    config.push('-c', `http.extraHeader=Authorization: Basic ${basic}`);
  }
  return { config, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } };
}

/** Cheap local clone the agent can tear up without touching the original. */
export async function cloneRepo(
  repoPath: string,
  sandboxDir: string,
  token?: string,
): Promise<string> {
  const target = repoDir(sandboxDir);
  const where = repoTarget(repoPath);
  if (where.kind === 'unsupported') throw new Error(where.reason);
  if (where.kind === 'url') {
    const auth = gitAuth(token);
    await run('git', [...auth.config, 'clone', where.url, target], { env: auth.env });
  } else {
    await run('git', ['clone', '--local', '--no-hardlinks', where.path, target]);
  }
  return target;
}

/**
 * The branch a promote opens against — the clone's own idea of what the remote
 * calls its default, which `git clone` records. Read from the remote rather
 * than from the checked-out branch because a job that carries a sandbox
 * forward (D-139) may already be sitting on a promote's branch.
 */
export function baseBranch(sandboxDir: string): string {
  const repo = repoDir(sandboxDir);
  try {
    const head = execFileSync('git', ['-C', repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return head.replace(/^origin\//, '');
  } catch {
    return execFileSync('git', ['-C', repo, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  }
}

/**
 * Promote for a URL-backed level (D-275): the reviewed change, committed on
 * its own branch and pushed. The reviewed change is the sandbox clone's
 * working tree, which is exactly what `writeDiff` read to produce DIFF.patch —
 * so this pushes what was reviewed rather than replaying a patch onto a second
 * checkout of the same thing.
 *
 * Idempotent on purpose: `checkout -B` and a force-with-lease push mean a
 * promote retried after the pull request half failed lands the same one
 * commit, not a second.
 */
export async function pushBranch(
  sandboxDir: string,
  opts: { remote: string; branch: string; message: string; token?: string },
): Promise<void> {
  const repo = repoDir(sandboxDir);
  const auth = gitAuth(opts.token);
  const at = ['-C', repo];
  // Its own identity, not the operator's: a container has no git config at
  // all, and a commit with no author is a promote that fails at the last step.
  const who = ['-c', 'user.name=Agentlings', '-c', 'user.email=agentlings@localhost'];
  await run('git', [...at, 'checkout', '-B', opts.branch]);
  await run('git', [...at, 'add', '-A']);
  const { stdout: staged } = await run('git', [...at, 'diff', '--cached', '--name-only'], {
    maxBuffer: MAX_DIFF_BYTES,
  });
  if (staged.trim()) {
    await run('git', [...at, ...who, 'commit', '-m', opts.message]);
  }
  await run('git', [...at, ...auth.config, 'push', '--force-with-lease', opts.remote, `HEAD:refs/heads/${opts.branch}`], {
    env: auth.env,
  });
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

/**
 * The patch-apply claim (D-163). `applyPatch` is the resolve route's second
 * await — D-162's recheck guards the first — and a resolve request landing
 * inside it would either race a second `git apply` onto the real repository
 * or discard a job whose patch is mid-flight. The route's door refuses both
 * actions while a job is claimed; the apply block releases in a `finally`,
 * so a failed apply leaves the job resolvable. Process-local like D-160's
 * send claim, which is the scope of the race: every caller lives in this
 * one server.
 */
const patching = new Set<string>();

/** Marks the job's patch mid-flight. The route's door is what refuses on it. */
export function beginPatch(jobId: string): void {
  patching.add(jobId);
}

export function endPatch(jobId: string): void {
  patching.delete(jobId);
}

export function patchInFlight(jobId: string): boolean {
  return patching.has(jobId);
}

/**
 * The whole of what Approve does on a URL-backed level (D-275), in one place
 * the route calls and a test can drive.
 *
 * It exists rather than living inline in the resolve route because the two
 * halves below are separately tested and their *composition* is the part that
 * has historically reached nothing (D-030): a correct pusher and a correct
 * pull-request call, wired by hand in a route with no seam under it, is
 * exactly the shape that ships inert. `http` is injected the way every other
 * outward call in this server injects it, so the composition is provable
 * against a real git remote and a fake code host.
 *
 * The two results are kept apart on purpose. The push is the durable half; if
 * the pull request is refused the branch is still on the remote, and saying
 * so is the only true answer.
 */
export async function promoteToRemote(
  sandboxDir: string,
  target: { url: string; owner: string; name: string },
  job: { id: string; title: string; prompt: string },
  deps: { http: Http; token?: string },
): Promise<PromotedTo> {
  const branch = branchName(job.id, job.title);
  const base = baseBranch(sandboxDir);
  await pushBranch(sandboxDir, {
    remote: target.url,
    branch,
    message: job.title,
    token: deps.token,
  });
  const pr = await openPullRequest(
    {
      owner: target.owner,
      name: target.name,
      head: branch,
      base,
      title: job.title,
      body: `Queued in Agentlings as job \`${job.id}\` and approved at review.\n\n${job.prompt}`,
    },
    deps,
  );
  return 'error' in pr
    ? { branch, prError: pr.error }
    : { branch, prNumber: pr.number, prUrl: pr.url };
}
