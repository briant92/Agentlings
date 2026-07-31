import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('reads the patch into change counts when the job completes', () => {
    const job = queue.add({ title: 'Repo job', prompt: 'x', repoPath: '/somewhere' });
    queue.assign(job.id, 'a1');
    const dir = queue.start(job.id);
    writeFileSync(
      path.join(dir, 'DIFF.patch'),
      [
        'diff --git a/app.ts b/app.ts',
        '--- a/app.ts',
        '+++ b/app.ts',
        '-old line',
        '+new line',
        '+another new line',
      ].join('\n'),
    );

    queue.complete(job.id, 'did the thing');
    const changes = queue.get(job.id)!.changes;
    expect(changes).toEqual({ files: 1, added: 2, removed: 1, names: ['app.ts'] });
  });

  it('leaves changes unset when the job produced no patch', () => {
    const job = queue.add({ title: 'Report only', prompt: 'x' });
    queue.assign(job.id, 'a1');
    queue.start(job.id);
    queue.complete(job.id, 'wrote a report');
    expect(queue.get(job.id)!.changes).toBeUndefined();
  });

  it('rejects resolving a job that is still queued', () => {
    const job = queue.add({ title: 'Too soon', prompt: 'x' });
    expect(() => queue.resolve(job.id, 'promote')).toThrow(/not resolvable/);
  });

  describe('routing by role', () => {
    const present = new Set(['mason', 'scribe']);

    it('gives an agentling the job matched to their role first', () => {
      queue.add({ title: 'Docs', prompt: 'x', preferredRole: 'scribe' });
      queue.add({ title: 'Code', prompt: 'x', preferredRole: 'mason' });
      expect(queue.nextUnassigned('mason', present)?.title).toBe('Code');
      expect(queue.nextUnassigned('scribe', present)?.title).toBe('Docs');
    });

    it('takes unrouted work when nothing matches their role', () => {
      queue.add({ title: 'Docs', prompt: 'x', preferredRole: 'scribe' });
      queue.add({ title: 'Anything', prompt: 'x' });
      expect(queue.nextUnassigned('mason', present)?.title).toBe('Anything');
    });

    it('does not strand work routed to a role nobody holds', () => {
      queue.add({ title: 'Needs a scout', prompt: 'x', preferredRole: 'scout' });
      expect(queue.nextUnassigned('mason', present)?.title).toBe('Needs a scout');
    });

    it('leaves another role’s work alone while someone can take it', () => {
      queue.add({ title: 'Docs', prompt: 'x', preferredRole: 'scribe' });
      expect(queue.nextUnassigned('mason', present)).toBeUndefined();
    });
  });

  // A session can run out of turns after finishing the work. Dropping its
  // meter hides money we actually spent, and dropping its diff throws away
  // work that is sitting on disk, reviewable.
  describe('a failure that still produced something', () => {
    it('records what the failed run spent', () => {
      const job = queue.add({ title: 'Ran out of turns', prompt: 'x' });
      queue.start(job.id);
      queue.fail(job.id, 'agent session failed (error_max_turns)', { costUsd: 0.42, turns: 8 });

      const failed = queue.get(job.id)!;
      expect(failed.status).toBe('failed');
      expect(failed.meter?.costUsd).toBe(0.42);
      expect(failed.meter?.turns).toBe(8);
    });

    it('shows the diff a failed run left behind', () => {
      const job = queue.add({ title: 'Died on the last turn', prompt: 'x' });
      const dir = queue.start(job.id);
      writeFileSync(
        path.join(dir, 'DIFF.patch'),
        [
          'diff --git a/slugify.js b/slugify.js',
          '--- a/slugify.js',
          '+++ b/slugify.js',
          '@@ -1,1 +1,2 @@',
          '-old',
          '+new',
          '+newer',
          '',
        ].join('\n'),
      );
      queue.fail(job.id, 'agent session failed (error_max_turns)');

      expect(queue.get(job.id)!.changes).toBeDefined();
    });

    it('still reports no changes when the run touched nothing', () => {
      const job = queue.add({ title: 'Nothing to show', prompt: 'x' });
      queue.start(job.id);
      queue.fail(job.id, 'session timed out');
      expect(queue.get(job.id)!.changes).toBeUndefined();
    });
  });
});
