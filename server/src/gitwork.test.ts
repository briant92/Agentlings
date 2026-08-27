import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { branchName, repoTarget } from '@agentlings/shared';
import type { Http } from './library';
import {
  applyPatch,
  baseBranch,
  beginPatch,
  cloneRepo,
  endPatch,
  patchFile,
  patchInFlight,
  promoteToRemote,
  pushBranch,
  repoDir,
  summarizePatch,
  writeDiff,
} from './gitwork';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'pipe' });
}

describe('gitwork', () => {
  let root: string;
  let origin: string;
  let sandbox: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-git-'));
    origin = path.join(root, 'origin');
    sandbox = path.join(root, 'sandbox');
    mkdirSync(origin);
    mkdirSync(sandbox);
    execFileSync('git', ['init', '-q', origin], { stdio: 'pipe' });
    git(origin, 'config', 'user.name', 'Test');
    git(origin, 'config', 'user.email', 'test@example.com');
    writeFileSync(path.join(origin, 'greet.js'), "console.log('Helo');\n");
    git(origin, 'add', '.');
    git(origin, 'commit', '-q', '-m', 'init');
  });

  // Deletes a git repository on Windows: rmSync cannot outwait a lock held by
  // something outside this process — see executors/carry.test.ts for the measurement.
  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  it('clones, captures edits and new files, and applies the patch upstream', async () => {
    const repo = await cloneRepo(origin, sandbox);
    expect(existsSync(path.join(repo, 'greet.js'))).toBe(true);

    writeFileSync(path.join(repo, 'greet.js'), "console.log('Hello');\n");
    writeFileSync(path.join(repo, 'NEW.md'), 'brand new file\n');

    expect(await writeDiff(sandbox)).toBe(true);
    const patch = patchFile(sandbox);
    expect(readFileSync(patch, 'utf8')).toContain('Hello');

    // The same patch, read back as counts a non-expert can act on.
    const changes = summarizePatch(readFileSync(patch, 'utf8'));
    expect(changes.files).toBe(2);
    expect(changes.names.sort()).toEqual(['NEW.md', 'greet.js']);
    expect(changes.added).toBe(2);
    expect(changes.removed).toBe(1);

    await applyPatch(origin, patch);
    expect(readFileSync(path.join(origin, 'greet.js'), 'utf8')).toContain('Hello');
    expect(readFileSync(path.join(origin, 'NEW.md'), 'utf8')).toContain('brand new');
  });

  it('names a deleted file from the "---" side of the patch', () => {
    const changes = summarizePatch(
      ['diff --git a/gone.txt b/gone.txt', '--- a/gone.txt', '+++ /dev/null', '-was here'].join('\n'),
    );
    expect(changes.names).toEqual(['gone.txt']);
    expect(changes.removed).toBe(1);
    expect(changes.added).toBe(0);
  });

  it('reports no diff when the agent changed nothing', async () => {
    await cloneRepo(origin, sandbox);
    expect(await writeDiff(sandbox)).toBe(false);
    expect(existsSync(patchFile(sandbox))).toBe(false);
  });

  it('refuses to apply a missing patch', async () => {
    await expect(applyPatch(origin, patchFile(sandbox))).rejects.toThrow(/no DIFF.patch/);
  });
});

describe('the patch-apply claim (D-163)', () => {
  it('holds exactly between begin and end — the resolve door reads it', () => {
    expect(patchInFlight('j1')).toBe(false);
    beginPatch('j1');
    expect(patchInFlight('j1')).toBe(true);
    endPatch('j1');
    expect(patchInFlight('j1')).toBe(false);
  });

  it('is per job — one job mid-patch never blocks another', () => {
    beginPatch('j2');
    expect(patchInFlight('j3')).toBe(false);
    endPatch('j2');
  });

  it('releasing twice is safe — a finally can never throw or leak', () => {
    beginPatch('j4');
    endPatch('j4');
    endPatch('j4');
    expect(patchInFlight('j4')).toBe(false);
  });
});

/**
 * A level's repo is either a folder on this disk or a URL (D-275). One reader
 * answers which, and the clone side, the promote side and the route that sets
 * it all ask it — the duplicated-notion mistake D-030 keeps charging for.
 */
describe('repoTarget', () => {
  it('reads anything that is not a URL as a folder on this disk', () => {
    expect(repoTarget('C:\\Users\\me\\projects\\app')).toEqual({
      kind: 'path',
      path: 'C:\\Users\\me\\projects\\app',
    });
    expect(repoTarget('/home/me/app')).toEqual({ kind: 'path', path: '/home/me/app' });
  });

  it('reads an https GitHub URL as a remote, with or without .git', () => {
    for (const url of [
      'https://github.com/briant92/scratch-repo',
      'https://github.com/briant92/scratch-repo.git',
      'https://github.com/briant92/scratch-repo/',
      'https://GitHub.com/briant92/scratch-repo',
    ]) {
      expect(repoTarget(url)).toEqual({
        kind: 'url',
        url: 'https://github.com/briant92/scratch-repo.git',
        owner: 'briant92',
        name: 'scratch-repo',
      });
    }
  });

  it('refuses a host that merely ends in the same letters (D-272 label boundary)', () => {
    const target = repoTarget('https://github.com.evil.example/briant92/scratch-repo');
    expect(target.kind).toBe('unsupported');
    expect(target.kind === 'unsupported' && target.reason).toMatch(/github\.com/);
  });

  it('refuses a URL carrying its own credentials — the token is ours to supply', () => {
    const target = repoTarget('https://someone:ghp_secret@github.com/briant92/scratch-repo');
    expect(target.kind).toBe('unsupported');
    expect(target.kind === 'unsupported' && target.reason).toMatch(/password|token|credential/i);
    // and never echoes the secret back at whoever pasted it
    expect(JSON.stringify(target)).not.toContain('ghp_secret');
  });

  it('refuses ssh, git and http forms by name, and a URL that is not one repo', () => {
    for (const bad of [
      'git@github.com:briant92/scratch-repo.git',
      'ssh://git@github.com/briant92/scratch-repo.git',
      'git://github.com/briant92/scratch-repo.git',
      'http://github.com/briant92/scratch-repo',
      'https://github.com/briant92',
      'https://github.com/briant92/scratch-repo/tree/main/server',
    ]) {
      expect(repoTarget(bad).kind, bad).toBe('unsupported');
    }
  });
});

describe('branchName', () => {
  it('is one branch per job, named from the title a person would recognise', () => {
    expect(branchName('7f3c1a2b-0000', 'Fix the null check in parser.ts')).toBe(
      'agentlings/7f3c1a2b-fix-the-null-check-in-parser-ts',
    );
  });

  it('falls back to the job id alone when the title slugs to nothing', () => {
    expect(branchName('7f3c1a2b-0000', '???')).toBe('agentlings/7f3c1a2b');
  });

  it('never produces a ref git would refuse', () => {
    const name = branchName('7f3c1a2b-0000', '  ..lots.. of / dots and //slashes.lock  ');
    expect(name.startsWith('agentlings/7f3c1a2b-')).toBe(true);
    expect(name).not.toMatch(/\.\.|\/\/|\.lock$|[~^:?*\s\\[]|[./]$/);
    execFileSync('git', ['check-ref-format', `refs/heads/${name}`], { stdio: 'pipe' });
  });

  it('caps the slug so a paragraph of a title cannot make an unusable ref', () => {
    const name = branchName('7f3c1a2b-0000', 'a'.repeat(300));
    expect(name.length).toBeLessThanOrEqual(60);
  });
});

/**
 * Promote for a URL-backed level is a branch pushed, not a patch applied
 * (D-275). Proven against a real bare repository rather than a mock: the
 * claim is that a remote ends up holding the reviewed change, and only git
 * can say whether it does.
 */
describe('pushBranch', () => {
  let root: string;
  let remote: string;
  let sandbox: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-push-'));
    remote = path.join(root, 'remote.git');
    sandbox = path.join(root, 'sandbox');
    mkdirSync(sandbox);
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { stdio: 'pipe' });
    const seed = path.join(root, 'seed');
    execFileSync('git', ['clone', '-q', remote, seed], { stdio: 'pipe' });
    execFileSync('git', ['-C', seed, 'config', 'user.name', 'Test'], { stdio: 'pipe' });
    execFileSync('git', ['-C', seed, 'config', 'user.email', 'test@example.com'], { stdio: 'pipe' });
    writeFileSync(path.join(seed, 'greet.js'), "console.log('Helo');\n");
    execFileSync('git', ['-C', seed, 'add', '.'], { stdio: 'pipe' });
    execFileSync('git', ['-C', seed, 'commit', '-q', '-m', 'init'], { stdio: 'pipe' });
    execFileSync('git', ['-C', seed, 'push', '-q', 'origin', 'main'], { stdio: 'pipe' });
  });

  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  it('pushes what the reviewer approved, and says what the base branch is', async () => {
    await cloneRepo(remote, sandbox);
    expect(baseBranch(sandbox)).toBe('main');

    writeFileSync(path.join(repoDir(sandbox), 'greet.js'), "console.log('Hello');\n");
    writeFileSync(path.join(repoDir(sandbox), 'NEW.md'), 'brand new file\n');
    expect(await writeDiff(sandbox)).toBe(true);

    await pushBranch(sandbox, {
      remote,
      branch: 'agentlings/abc123-fix-the-greeting',
      message: 'Fix the greeting',
    });

    // The remote holds it — read back from the bare repository, not from ours.
    const files = execFileSync(
      'git',
      ['-C', remote, 'ls-tree', '--name-only', 'agentlings/abc123-fix-the-greeting'],
      { encoding: 'utf8' },
    );
    expect(files.split('\n').filter(Boolean).sort()).toEqual(['NEW.md', 'greet.js']);
    const blob = execFileSync(
      'git',
      ['-C', remote, 'show', 'agentlings/abc123-fix-the-greeting:greet.js'],
      { encoding: 'utf8' },
    );
    expect(blob).toContain('Hello');
    // main is untouched: a promote proposes, it does not land on the default branch.
    expect(execFileSync('git', ['-C', remote, 'show', 'main:greet.js'], { encoding: 'utf8' })).toContain(
      'Helo',
    );
  });

  it('is safe to run twice — a promote retried after a failed pull request lands once', async () => {
    await cloneRepo(remote, sandbox);
    writeFileSync(path.join(repoDir(sandbox), 'greet.js'), "console.log('Hello');\n");
    await writeDiff(sandbox);
    const opts = { remote, branch: 'agentlings/abc123-again', message: 'Fix the greeting' };
    await pushBranch(sandbox, opts);
    await pushBranch(sandbox, opts);
    const log = execFileSync(
      'git',
      ['-C', remote, 'log', '--oneline', 'main..agentlings/abc123-again'],
      { encoding: 'utf8' },
    );
    expect(log.split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('commits under its own identity, so a host with no git config can still promote', async () => {
    await cloneRepo(remote, sandbox);
    writeFileSync(path.join(repoDir(sandbox), 'greet.js'), "console.log('Hello');\n");
    await writeDiff(sandbox);
    await pushBranch(sandbox, { remote, branch: 'agentlings/abc123-who', message: 'Fix it' });
    const who = execFileSync(
      'git',
      ['-C', remote, 'log', '-1', '--format=%an <%ae>', 'agentlings/abc123-who'],
      { encoding: 'utf8' },
    ).trim();
    expect(who).toBe('Agentlings <agentlings@localhost>');
  });
});

/**
 * The composition, against a real remote and a fake code host (D-275). The two
 * halves are proven above and in `github.test.ts`; this is the wiring between
 * them, which is the part that ships inert (D-030).
 */
describe('promoteToRemote', () => {
  let root: string;
  let remote: string;
  let sandbox: string;

  const job = { id: '7f3c1a2b-0000', title: 'Fix the greeting', prompt: 'make it say Hello' };

  function host(reply: unknown, status = 201) {
    const bodies: string[] = [];
    const http: Http = async (_url, _headers, init) => {
      bodies.push(init?.body ?? '');
      return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(reply) };
    };
    return { http, bodies };
  }

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-promote-'));
    remote = path.join(root, 'remote.git');
    sandbox = path.join(root, 'sandbox');
    mkdirSync(sandbox);
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { stdio: 'pipe' });
    const seed = path.join(root, 'seed');
    execFileSync('git', ['clone', '-q', remote, seed], { stdio: 'pipe' });
    execFileSync('git', ['-C', seed, 'config', 'user.name', 'Test'], { stdio: 'pipe' });
    execFileSync('git', ['-C', seed, 'config', 'user.email', 'test@example.com'], { stdio: 'pipe' });
    writeFileSync(path.join(seed, 'greet.js'), "console.log('Helo');\n");
    execFileSync('git', ['-C', seed, 'add', '.'], { stdio: 'pipe' });
    execFileSync('git', ['-C', seed, 'commit', '-q', '-m', 'init'], { stdio: 'pipe' });
    execFileSync('git', ['-C', seed, 'push', '-q', 'origin', 'main'], { stdio: 'pipe' });
    await cloneRepo(remote, sandbox);
    writeFileSync(path.join(repoDir(sandbox), 'greet.js'), "console.log('Hello');\n");
    await writeDiff(sandbox);
  });

  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  it('pushes the branch and opens the pull request against the remote default branch', async () => {
    const { http, bodies } = host({ number: 4, html_url: 'https://github.com/o/n/pull/4' });
    const result = await promoteToRemote(
      sandbox,
      { url: remote, owner: 'o', name: 'n' },
      job,
      { http, token: 'tok' },
    );
    expect(result).toEqual({
      branch: 'agentlings/7f3c1a2b-fix-the-greeting',
      prNumber: 4,
      prUrl: 'https://github.com/o/n/pull/4',
    });
    // The base is read off the clone, not assumed — this remote's default is main.
    expect(JSON.parse(bodies[0])).toMatchObject({
      base: 'main',
      head: 'agentlings/7f3c1a2b-fix-the-greeting',
      title: 'Fix the greeting',
    });
    // …and the change is actually on the remote, not merely reported.
    expect(
      execFileSync('git', ['-C', remote, 'show', 'agentlings/7f3c1a2b-fix-the-greeting:greet.js'], {
        encoding: 'utf8',
      }),
    ).toContain('Hello');
  });

  it('reports the branch when the pull request is refused — the push already happened', async () => {
    const { http } = host({}, 403);
    const result = await promoteToRemote(
      sandbox,
      { url: remote, owner: 'o', name: 'n' },
      job,
      { http, token: 'read-only' },
    );
    expect(result.branch).toBe('agentlings/7f3c1a2b-fix-the-greeting');
    expect(result.prUrl).toBeUndefined();
    expect(result.prError).toMatch(/permission|rate limit/i);
    // The half that succeeded stays true: the work is on the remote.
    expect(
      execFileSync('git', ['-C', remote, 'show', 'agentlings/7f3c1a2b-fix-the-greeting:greet.js'], {
        encoding: 'utf8',
      }),
    ).toContain('Hello');
  });
});
