import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedExecutor } from './executors/simulated';
import { JobQueue } from './queue';

describe('JobQueue', () => {
  let root: string;
  let queue: JobQueue;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-'));
    queue = new JobQueue(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('runs a job through its lifecycle', async () => {
    const job = queue.add({ title: 'Test job', prompt: 'do the thing' });
    expect(job.status).toBe('queued');
    expect(job.slot).toBe(0);

    queue.assign(job.id, 'a1');
    const dir = queue.start(job.id);
    expect(queue.get(job.id)!.status).toBe('running');

    const result = await new SimulatedExecutor(0, 0).run(job, dir);
    queue.complete(job.id, result.summary);

    const done = queue.get(job.id)!;
    expect(done.status).toBe('done');
    expect(done.slot).toBe(-1);
    expect(existsSync(path.join(dir, 'RESULT.md'))).toBe(true);
    expect(readFileSync(path.join(dir, 'RESULT.md'), 'utf8')).toContain('Test job');

    expect(queue.resolve(job.id, 'promote').status).toBe('promoted');
  });

  it('hands a freed slot to the oldest waiting job', () => {
    const jobs = Array.from({ length: 6 }, (_, i) =>
      queue.add({ title: `Job ${i}`, prompt: 'x' }),
    );
    expect(jobs[5].slot).toBe(-1); // MAX_STATIONS = 5, sixth job waits

    queue.assign(jobs[0].id, 'a1');
    queue.start(jobs[0].id);
    queue.fail(jobs[0].id, 'boom');

    expect(queue.get(jobs[5].id)!.slot).toBe(0);
    expect(queue.resolve(jobs[0].id, 'discard').status).toBe('discarded');
  });

  it('rejects resolving a job that is still queued', () => {
    const job = queue.add({ title: 'Too soon', prompt: 'x' });
    expect(() => queue.resolve(job.id, 'promote')).toThrow(/not resolvable/);
  });
});
