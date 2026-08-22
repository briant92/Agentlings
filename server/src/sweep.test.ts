import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Job } from '@agentlings/shared';
import { sweepWorkingCopies, workingCopies } from './sweep';

const job = (id: string, status: Job['status']): Job => ({
  id,
  title: `job ${id}`,
  prompt: `do ${id}`,
  status,
  slot: -1,
  createdAt: 1,
});

/** A level directory the scanner will find: level.json plus stored jobs. */
function level(root: string, id: string, jobs: Job[], closed = false): string {
  const dir = path.join(root, 'levels', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'level.json'),
    JSON.stringify({
      id,
      name: id,
      project: 'P',
      theme: 'cave',
      createdAt: 1,
      ...(closed ? { closedAt: 2 } : {}),
    }),
  );
  writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(jobs, null, 2));
  return dir;
}

/** A 64-byte working copy under one job's sandbox. */
function clone(dir: string, jobId: string): string {
  const repo = path.join(dir, 'jobs', jobId, 'repo');
  mkdirSync(repo, { recursive: true });
  writeFileSync(path.join(repo, 'f.txt'), 'x'.repeat(64));
  return repo;
}

describe('working copies', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-sweep-'));
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it('splits clones by whether their job is settled', async () => {
    const dir = level(root, 'l1', [
      job('a', 'promoted'),
      job('b', 'done'),
      job('d', 'discarded'),
      job('e', 'cleared'), // let go without a verdict: settled all the same (D-216)
    ]);
    clone(dir, 'a');
    clone(dir, 'b');
    clone(dir, 'c'); // no job row: proves nothing about itself, so kept
    clone(dir, 'd');
    clone(dir, 'e');
    const info = await workingCopies(root);
    expect(info.sweepable).toEqual({ clones: 3, bytes: 192 });
    expect(info.kept).toEqual({ clones: 2, bytes: 128 });
  });

  it('sweeps only the settled clones and only the clone itself', async () => {
    const dir = level(root, 'l1', [job('a', 'promoted'), job('b', 'done')]);
    const swept = clone(dir, 'a');
    writeFileSync(path.join(dir, 'jobs', 'a', '.session.json'), '{}');
    const kept = clone(dir, 'b');

    expect(await sweepWorkingCopies(root)).toEqual({ clones: 1, bytes: 64, skipped: 0 });
    expect(existsSync(swept)).toBe(false);
    // The sandbox around the clone is the training data — untouched.
    expect(existsSync(path.join(dir, 'jobs', 'a', '.session.json'))).toBe(true);
    expect(existsSync(kept)).toBe(true);
    // A second sweep finds nothing: the report never re-claims freed space.
    expect(await sweepWorkingCopies(root)).toEqual({ clones: 0, bytes: 0, skipped: 0 });
  });

  /**
   * D-176. A failed job has no outcome left to take: nothing reads its clone —
   * promote applies DIFF.patch to the real repo and a continuation applies it
   * to a fresh one — so the clone is residue while `done` and `partial`, which
   * are still awaiting review, keep theirs.
   */
  it('sweeps a failed job’s clone and still keeps done and partial', async () => {
    const dir = level(root, 'l1', [
      job('f', 'failed'),
      job('b', 'done'),
      job('p', 'partial'),
    ]);
    const swept = clone(dir, 'f');
    const keptDone = clone(dir, 'b');
    const keptPartial = clone(dir, 'p');

    const info = await workingCopies(root);
    expect(info.sweepable).toEqual({ clones: 1, bytes: 64 });
    expect(info.kept).toEqual({ clones: 2, bytes: 128 });

    expect(await sweepWorkingCopies(root)).toEqual({ clones: 1, bytes: 64, skipped: 0 });
    expect(existsSync(swept)).toBe(false);
    expect(existsSync(keptDone)).toBe(true);
    expect(existsSync(keptPartial)).toBe(true);
  });

  /**
   * The patch is what promote and carryForward actually read, and it lives at
   * the sandbox root — so sweeping the clone must never take it with it.
   */
  it('leaves a failed job’s DIFF.patch, which is what continuation reads', async () => {
    const dir = level(root, 'l1', [job('f', 'failed')]);
    clone(dir, 'f');
    const patch = path.join(dir, 'jobs', 'f', 'DIFF.patch');
    writeFileSync(patch, 'diff --git a/x b/x\n');

    await sweepWorkingCopies(root);
    expect(existsSync(patch)).toBe(true);
  });

  it('includes closed levels — the rule is per job, not per level', async () => {
    const dir = level(root, 'shut', [job('a', 'promoted')], true);
    const repo = clone(dir, 'a');
    expect((await sweepWorkingCopies(root)).clones).toBe(1);
    expect(existsSync(repo)).toBe(false);
  });

  it('keeps every clone when the jobs file cannot be read', async () => {
    const dir = level(root, 'l1', []);
    writeFileSync(path.join(dir, 'jobs.json'), 'not json');
    const repo = clone(dir, 'a');
    const info = await workingCopies(root);
    expect(info.sweepable.clones).toBe(0);
    expect(info.kept.clones).toBe(1);
    expect((await sweepWorkingCopies(root)).clones).toBe(0);
    expect(existsSync(repo)).toBe(true);
  });

  it('reads an empty store as zeros', async () => {
    expect(await workingCopies(root)).toEqual({
      sweepable: { clones: 0, bytes: 0 },
      kept: { clones: 0, bytes: 0 },
    });
  });
});
