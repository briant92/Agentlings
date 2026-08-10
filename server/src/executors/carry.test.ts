import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cloneRepo, writeDiff } from '../gitwork';
import { carryForward } from './claude';

const run = promisify(execFile);

/**
 * A reply is a new job, so the only thing making it a continuation is that its
 * sandbox starts where the last one stopped. These are the tests that would
 * have caught it silently starting from scratch — which looks like success and
 * costs a second full session.
 */
describe('carryForward', () => {
  let root: string;
  let origin: string;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-carry-'));
    origin = path.join(root, 'origin');
    mkdirSync(origin, { recursive: true });
    writeFileSync(path.join(origin, 'notes.md'), 'first line\n');
    await run('git', ['-C', origin, 'init', '-q']);
    await run('git', ['-C', origin, 'config', 'user.email', 't@t']);
    await run('git', ['-C', origin, 'config', 'user.name', 'test']);
    await run('git', ['-C', origin, 'add', '.']);
    await run('git', ['-C', origin, 'commit', '-qm', 'init']);
  });
  /**
   * Deleting four git repositories on Windows, where something outside this
   * process may still hold one of their files — a virus scan, OneDrive, a
   * git.exe that has only just exited. This test has failed once in a full
   * suite run and never alone, which is the shape of a lock rather than a bug:
   * a failing hook is reported under the test's own name, so the cleanup and
   * the assertion are indistinguishable in the output.
   *
   * `rmSync` cannot do this. Measured against a file held with share mode
   * `None`: `force` threw EPERM at once, and so did `maxRetries: 30` — the
   * synchronous path does not retry this failure at all. The async `rm` with
   * the same options waited the lock out and deleted the tree after 1,672ms.
   *
   * The catch is deliberate on top of that: a lock can outlast any bounded
   * retry, and a leaked directory under %TEMP% is the operating system's
   * problem, never a verdict on `carryForward`.
   */
  afterEach(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(
      () => {},
    );
  });

  const sandbox = (id: string) => {
    const dir = path.join(root, 'jobs', id);
    mkdirSync(dir, { recursive: true });
    return dir;
  };

  it('applies the earlier run’s patch to the fresh clone', async () => {
    const first = sandbox('a');
    await cloneRepo(origin, first);
    writeFileSync(path.join(first, 'repo', 'notes.md'), 'first line\nsecond line\n');
    expect(await writeDiff(first)).toBe(true);

    const second = sandbox('b');
    await cloneRepo(origin, second);
    await carryForward('a', second, true);

    expect(readFileSync(path.join(second, 'repo', 'notes.md'), 'utf8')).toContain('second line');
  });

  it('carries what the earlier run produced', async () => {
    const first = sandbox('a');
    writeFileSync(path.join(first, 'report.pdf'), 'PDF BYTES');
    const second = sandbox('b');
    await carryForward('a', second, false);
    expect(readFileSync(path.join(second, 'report.pdf'), 'utf8')).toBe('PDF BYTES');
  });

  // The new run writes its own. Inheriting RESULT.md would make "did this
  // deliver" true before the session had done anything at all — and an
  // inherited PENDING.md satisfies the close-out's short-circuit, stamping a
  // parent's account onto a run it never described (found live on fb19d020,
  // 2026-08-07: the continuation composed its outbox, and the review showed
  // the parent's "halted" story).
  it('leaves the earlier run’s paperwork behind', async () => {
    const first = sandbox('a');
    for (const name of ['RESULT.md', 'LESSON.md', 'APPROACH.md', 'PENDING.md']) {
      writeFileSync(path.join(first, name), 'old');
    }
    const second = sandbox('b');
    await carryForward('a', second, false);
    for (const name of ['RESULT.md', 'LESSON.md', 'APPROACH.md', 'PENDING.md']) {
      expect(existsSync(path.join(second, name))).toBe(false);
    }
  });

  /**
   * The report is the one piece of paperwork handed over — renamed, so every
   * "did this deliver" check still reads the leg's own RESULT.md. The first
   * paid More Time leg (c19da3d1, 2026-08-10) found no report, wrote "the
   * last run never reported", and spent paid turns re-deriving what its
   * parent had already written down (D-145).
   */
  it('hands the earlier report over as PREVIOUS-RESULT.md', async () => {
    const first = sandbox('a');
    writeFileSync(path.join(first, 'RESULT.md'), 'the parent reported');
    const second = sandbox('b');
    await carryForward('a', second, false);
    expect(readFileSync(path.join(second, 'PREVIOUS-RESULT.md'), 'utf8')).toBe(
      'the parent reported',
    );
    expect(existsSync(path.join(second, 'RESULT.md'))).toBe(false);
  });

  // The newest report in the chain rides: a third leg reads what the second
  // established, not what the first did.
  it('prefers the earlier run’s own report over its hand-me-down', async () => {
    const first = sandbox('a');
    writeFileSync(path.join(first, 'PREVIOUS-RESULT.md'), 'from leg one');
    writeFileSync(path.join(first, 'RESULT.md'), 'from leg two');
    const second = sandbox('b');
    await carryForward('a', second, false);
    expect(readFileSync(path.join(second, 'PREVIOUS-RESULT.md'), 'utf8')).toBe('from leg two');
  });

  // ...and a leg cut before it could report passes on the one it was handed,
  // rather than dropping the chain's memory on the floor.
  it('passes the hand-me-down on when the earlier run never reported', async () => {
    const first = sandbox('a');
    writeFileSync(path.join(first, 'PREVIOUS-RESULT.md'), 'from leg one');
    const second = sandbox('b');
    await carryForward('a', second, false);
    expect(readFileSync(path.join(second, 'PREVIOUS-RESULT.md'), 'utf8')).toBe('from leg one');
  });

  it('does nothing when there is no such run to carry from', async () => {
    const second = sandbox('b');
    await expect(carryForward('missing', second, false)).resolves.toBeUndefined();
  });
});
