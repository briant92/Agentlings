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

  it('splits clones by whether their job is settled', () => {
    const dir = level(root, 'l1', [job('a', 'promoted'), job('b', 'done'), job('d', 'discarded')]);
    clone(dir, 'a');
    clone(dir, 'b');
    clone(dir, 'c'); // no job row: proves nothing about itself, so kept
    clone(dir, 'd');
    const info = workingCopies(root);
    expect(info.sweepable).toEqual({ clones: 2, bytes: 128 });
    expect(info.kept).toEqual({ clones: 2, bytes: 128 });
  });

  it('sweeps only the settled clones and only the clone itself', () => {
    const dir = level(root, 'l1', [job('a', 'promoted'), job('b', 'done')]);
    const swept = clone(dir, 'a');
    writeFileSync(path.join(dir, 'jobs', 'a', '.session.json'), '{}');
    const kept = clone(dir, 'b');

    expect(sweepWorkingCopies(root)).toEqual({ clones: 1, bytes: 64, skipped: 0 });
    expect(existsSync(swept)).toBe(false);
    // The sandbox around the clone is the training data — untouched.
    expect(existsSync(path.join(dir, 'jobs', 'a', '.session.json'))).toBe(true);
    expect(existsSync(kept)).toBe(true);
    // A second sweep finds nothing: the report never re-claims freed space.
    expect(sweepWorkingCopies(root)).toEqual({ clones: 0, bytes: 0, skipped: 0 });
  });

  it('includes closed levels — the rule is per job, not per level', () => {
    const dir = level(root, 'shut', [job('a', 'promoted')], true);
    const repo = clone(dir, 'a');
    expect(sweepWorkingCopies(root).clones).toBe(1);
    expect(existsSync(repo)).toBe(false);
  });

  it('keeps every clone when the jobs file cannot be read', () => {
    const dir = level(root, 'l1', []);
    writeFileSync(path.join(dir, 'jobs.json'), 'not json');
    const repo = clone(dir, 'a');
    const info = workingCopies(root);
    expect(info.sweepable.clones).toBe(0);
    expect(info.kept.clones).toBe(1);
    expect(sweepWorkingCopies(root).clones).toBe(0);
    expect(existsSync(repo)).toBe(true);
  });

  it('reads an empty store as zeros', () => {
    expect(workingCopies(root)).toEqual({
      sweepable: { clones: 0, bytes: 0 },
      kept: { clones: 0, bytes: 0 },
    });
  });
});
