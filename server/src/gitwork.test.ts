import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyPatch,
  beginPatch,
  cloneRepo,
  endPatch,
  patchFile,
  patchInFlight,
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
