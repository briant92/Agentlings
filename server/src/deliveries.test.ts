import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Job } from '@agentlings/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deliveriesFor } from './deliveries';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'deliveries-'));
});
// rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
afterEach(() =>
  rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
);

const dirFor = (jobId: string) => path.join(root, jobId);

function sandbox(jobId: string, files: Record<string, string>): void {
  mkdirSync(dirFor(jobId), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(dirFor(jobId), name), body);
  }
}

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j',
    title: 'Write the note',
    prompt: 'p',
    status: 'done',
    slot: -1,
    createdAt: 1,
    finishedAt: 100,
    ...over,
  };
}

const names = new Map([['a1', 'Pip']]);

describe('deliveriesFor', () => {
  it('lists finished work newest first', () => {
    const jobs = [
      job({ id: 'old', finishedAt: 10 }),
      job({ id: 'new', finishedAt: 90 }),
      job({ id: 'mid', finishedAt: 50 }),
    ];
    expect(deliveriesFor(jobs, names, dirFor, 10).map((d) => d.jobId)).toEqual([
      'new',
      'mid',
      'old',
    ]);
  });

  it('leaves out work that has not finished', () => {
    const jobs = [job({ id: 'q', status: 'queued' }), job({ id: 'r', status: 'running' })];
    expect(deliveriesFor(jobs, names, dirFor, 10)).toEqual([]);
  });

  it('keeps every outcome, failures included', () => {
    const jobs = [
      job({ id: 'a', status: 'promoted' }),
      job({ id: 'b', status: 'partial' }),
      job({ id: 'c', status: 'failed' }),
      job({ id: 'd', status: 'discarded' }),
    ];
    // The terminal feed dies with the process, so hiding a failure here would
    // leave it with nowhere at all to be seen after a restart.
    expect(deliveriesFor(jobs, names, dirFor, 10).map((d) => d.outcome)).toEqual([
      'kept',
      'to review',
      'closed',
      'closed',
    ]);
  });

  it('names each file and its size, and reads no contents', () => {
    sandbox('j', { 'RESULT.md': 'hello', 'notes.csv': 'a,b\n' });
    const [delivery] = deliveriesFor([job()], names, dirFor, 10);
    expect(delivery.files).toEqual(
      expect.arrayContaining([
        { name: 'RESULT.md', bytes: 5 },
        { name: 'notes.csv', bytes: 4 },
      ]),
    );
    // Nothing on a listed file may carry its bytes: this endpoint is polled
    // and a sandbox can hold a 40MB document.
    expect(JSON.stringify(delivery.files)).not.toContain('hello');
  });

  it('survives a sandbox that is no longer there', () => {
    expect(deliveriesFor([job()], names, dirFor, 10)[0].files).toEqual([]);
  });

  it('resolves the worker by name, and falls back to their id', () => {
    const jobs = [job({ id: 'a', assignedTo: 'a1' }), job({ id: 'b', assignedTo: 'gone' })];
    const [first, second] = deliveriesFor(jobs, names, dirFor, 10);
    expect(first.who).toBe('Pip');
    // Someone since let go still did the work.
    expect(second.who).toBe('gone');
  });

  it('says nothing about cost when the run was free', () => {
    const jobs = [
      job({ id: 'a', meter: { costUsd: 0.3 } }),
      job({ id: 'b', meter: { costUsd: 0, routed: true } }),
      job({ id: 'c' }),
    ];
    expect(deliveriesFor(jobs, names, dirFor, 10).map((d) => d.costUsd)).toEqual([0.3, null, null]);
  });

  it('applies the cap after sorting, so the newest survive it', () => {
    const jobs = [
      job({ id: 'old', finishedAt: 1 }),
      job({ id: 'new', finishedAt: 100 }),
      job({ id: 'mid', finishedAt: 50 }),
    ];
    expect(deliveriesFor(jobs, names, dirFor, 2).map((d) => d.jobId)).toEqual(['new', 'mid']);
  });

  it('does not read a sandbox it is about to discard', () => {
    // The cap exists because each row costs a directory read. Reading first
    // and slicing after would make the limit pure decoration.
    sandbox('kept', { 'a.md': 'x' });
    sandbox('dropped', { 'b.md': 'x' });
    const jobs = [job({ id: 'kept', finishedAt: 90 }), job({ id: 'dropped', finishedAt: 10 })];
    const read: string[] = [];
    const spy = (jobId: string) => {
      read.push(jobId);
      return dirFor(jobId);
    };
    deliveriesFor(jobs, names, spy, 1);
    expect(read).toEqual(['kept']);
  });

  it('dates a job that never recorded finishing by when it was made', () => {
    const jobs = [
      job({ id: 'a', createdAt: 5, finishedAt: undefined }),
      job({ id: 'b', createdAt: 1, finishedAt: 3 }),
    ];
    const rows = deliveriesFor(jobs, names, dirFor, 10);
    expect(rows.map((d) => d.jobId)).toEqual(['a', 'b']);
    // The reported date needs the same fallback the sort uses, or the row
    // sorts to the top of the list showing 1970 beside it.
    expect(rows.map((d) => d.at)).toEqual([5, 3]);
  });
});
