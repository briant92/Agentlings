import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyPatch, cloneRepo, patchFile, writeDiff } from './gitwork';

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

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('clones, captures edits and new files, and applies the patch upstream', async () => {
    const repo = await cloneRepo(origin, sandbox);
    expect(existsSync(path.join(repo, 'greet.js'))).toBe(true);

    writeFileSync(path.join(repo, 'greet.js'), "console.log('Hello');\n");
    writeFileSync(path.join(repo, 'NEW.md'), 'brand new file\n');

    expect(await writeDiff(sandbox)).toBe(true);
    const patch = patchFile(sandbox);
    expect(readFileSync(patch, 'utf8')).toContain('Hello');

    await applyPatch(origin, patch);
    expect(readFileSync(path.join(origin, 'greet.js'), 'utf8')).toContain('Hello');
    expect(readFileSync(path.join(origin, 'NEW.md'), 'utf8')).toContain('brand new');
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
