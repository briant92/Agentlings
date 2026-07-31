import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  // Flags the ledger later reads off the job. Nothing derives them by sniffing
  // the title at read time, so they have to survive being queued and restored.
  it('carries the shaping flags a job was queued with', () => {
    const job = queue.add({ title: 'Compile', prompt: 'x', maxTurns: 10, compile: true });
    expect(queue.get(job.id)).toMatchObject({ maxTurns: 10, compile: true });
    expect(new JobQueue(root).get(job.id)).toMatchObject({ maxTurns: 10, compile: true });
  });

  it('leaves them off an ordinary job rather than writing false', () => {
    const job = queue.add({ title: 'Ordinary', prompt: 'x' });
    expect(queue.get(job.id)!.compile).toBeUndefined();
    expect(queue.get(job.id)!.maxTurns).toBeUndefined();
  });

  describe('revision', () => {
    // The socket sends the job list only when this moves. If a mutation ever
    // slips past persist(), a watcher silently stops seeing job updates --
    // so this is really a test that persist() is still the single funnel.
    it('moves when a job is added', () => {
      const before = queue.revision();
      queue.add({ title: 'Test job', prompt: 'x' });
      expect(queue.revision()).toBeGreaterThan(before);
    });

    it('moves through the whole life of a job', () => {
      const job = queue.add({ title: 'Test job', prompt: 'x' });
      const seen = [queue.revision()];
      queue.assign(job.id, 'a1');
      seen.push(queue.revision());
      queue.start(job.id);
      seen.push(queue.revision());
      queue.complete(job.id, 'done');
      seen.push(queue.revision());
      queue.resolve(job.id, 'promote');
      seen.push(queue.revision());
      // Strictly increasing: every step is something a watcher must be told.
      expect(seen).toEqual([...seen].sort((a, b) => a - b));
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('stands still when nothing happens', () => {
      queue.add({ title: 'Test job', prompt: 'x' });
      const settled = queue.revision();
      queue.list();
      queue.nextUnassigned();
      expect(queue.revision()).toBe(settled);
    });
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

  // Losing the queue on restart cost a verification run once: a server
  // reload dropped a job mid-flight and it simply vanished.
  describe('surviving a restart', () => {
    it('still has the queue after the process goes away', () => {
      const a = queue.add({ title: 'Still here', prompt: 'x' });
      queue.add({ title: 'Also here', prompt: 'y' });

      const reopened = new JobQueue(root);
      expect(reopened.list().map((j) => j.title)).toEqual(['Still here', 'Also here']);
      expect(reopened.get(a.id)?.prompt).toBe('x');
    });

    it('fails a job that was running, since its session died with the process', () => {
      const job = queue.add({ title: 'Interrupted', prompt: 'x' });
      queue.start(job.id);

      const reopened = new JobQueue(root);
      const restored = reopened.get(job.id)!;
      expect(restored.status).toBe('failed');
      expect(restored.error).toContain('restarted');
      expect(restored.slot).toBe(-1);
    });

    it('frees a queued job from the agentling that is no longer holding it', () => {
      const job = queue.add({ title: 'Was claimed', prompt: 'x' });
      queue.assign(job.id, 'a1');

      const reopened = new JobQueue(root);
      expect(reopened.get(job.id)?.assignedTo).toBeUndefined();
      // …and is therefore pickable again, rather than stranded forever.
      expect(reopened.nextUnassigned()?.id).toBe(job.id);
    });

    it('keeps finished work exactly as it was', () => {
      const job = queue.add({ title: 'Done already', prompt: 'x' });
      queue.start(job.id);
      queue.complete(job.id, 'all good', { costUsd: 0.25, turns: 3 });

      const restored = new JobQueue(root).get(job.id)!;
      expect(restored.status).toBe('done');
      expect(restored.summary).toBe('all good');
      expect(restored.meter?.costUsd).toBe(0.25);
    });

    it('opens the level anyway when the stored file is torn', () => {
      queue.add({ title: 'x', prompt: 'y' });
      writeFileSync(path.join(root, 'jobs.json'), '[{"id": "half');
      expect(() => new JobQueue(root)).not.toThrow();
      expect(new JobQueue(root).list()).toEqual([]);
    });
  });

  // A killed process leaves the work in the clone but never writes the diff,
  // because that happens after a session returns and there was nothing to
  // return to. The changes were on disk with no way to see or promote them.
  describe('recovering an interrupted job', () => {
    function repoWithEdit(dir: string): void {
      const repo = path.join(dir, 'repo');
      mkdirSync(repo, { recursive: true });
      const git = (...args: string[]) =>
        execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
      execFileSync('git', ['init', '-q', repo], { stdio: 'pipe' });
      git('config', 'user.name', 'Test');
      git('config', 'user.email', 'test@example.com');
      writeFileSync(path.join(repo, 'a.js'), 'const a = 1;\n');
      git('add', '.');
      git('commit', '-q', '-m', 'init');
      writeFileSync(path.join(repo, 'a.js'), 'const a = 2;\n'); // the lost work
    }

    it('writes the diff the killed run never got to write', async () => {
      const job = queue.add({ title: 'Killed mid-flight', prompt: 'x' });
      const dir = queue.start(job.id);
      repoWithEdit(dir);

      const reopened = new JobQueue(root);
      expect(reopened.get(job.id)!.status).toBe('failed');
      expect(await reopened.harvestInterrupted()).toBe(1);

      const recovered = reopened.get(job.id)!;
      expect(recovered.status).toBe('partial');
      expect(recovered.changes?.files).toBe(1);
      expect(existsSync(path.join(dir, 'DIFF.patch'))).toBe(true);
    });

    it('leaves an interrupted job alone when it changed nothing', async () => {
      const job = queue.add({ title: 'Killed early', prompt: 'x' });
      const dir = queue.start(job.id);
      const repo = path.join(dir, 'repo');
      mkdirSync(repo, { recursive: true });
      execFileSync('git', ['init', '-q', repo], { stdio: 'pipe' });

      const reopened = new JobQueue(root);
      expect(await reopened.harvestInterrupted()).toBe(0);
      expect(reopened.get(job.id)!.status).toBe('failed');
    });

    it('does nothing for a job that had no repository', async () => {
      const job = queue.add({ title: 'No repo', prompt: 'x' });
      queue.start(job.id);
      const reopened = new JobQueue(root);
      expect(await reopened.harvestInterrupted()).toBe(0);
    });
  });

  describe('cancelling', () => {
    it('closes out work that never started', () => {
      const job = queue.add({ title: 'Never mind', prompt: 'x' });
      const cancelled = queue.cancel(job.id);
      expect(cancelled.status).toBe('failed');
      expect(cancelled.error).toBe('cancelled');
      expect(cancelled.slot).toBe(-1);
    });

    it('keeps what a cancelled session already spent', () => {
      const job = queue.add({ title: 'Stopped midway', prompt: 'x' });
      queue.start(job.id);
      expect(queue.cancel(job.id, { costUsd: 0.08 }).meter?.costUsd).toBe(0.08);
    });

    it('refuses to cancel work that has already finished', () => {
      const job = queue.add({ title: 'Finished', prompt: 'x' });
      queue.start(job.id);
      queue.complete(job.id, 'done');
      expect(() => queue.cancel(job.id)).toThrow(/not running/);
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

    it('calls a run that left a diff partial, not failed', () => {
      const job = queue.add({ title: 'Out of turns', prompt: 'x' });
      const dir = queue.start(job.id);
      writeFileSync(
        path.join(dir, 'DIFF.patch'),
        'diff --git a/x.js b/x.js\n--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-a\n+b\n',
      );
      queue.fail(job.id, 'agent session failed (error_max_turns)');

      const partial = queue.get(job.id)!;
      expect(partial.status).toBe('partial');
      expect(partial.changes).toBeDefined();
      // …and is reviewable exactly like finished work.
      expect(queue.resolve(job.id, 'promote').status).toBe('promoted');
    });

    // A compile's deliverable is never a diff — its output is the two scripts,
    // and promote deliberately does not apply its patch — so asking only about
    // a patch called every compile a failure. Measured on job 760e0bf6: two
    // working programs on disk, verified by hand, filed `failed`.
    it('calls a compile that left both halves partial, not failed', () => {
      const job = queue.add({ title: 'Compile a recipe', prompt: 'x' });
      const dir = queue.start(job.id);
      writeFileSync(path.join(dir, 'run.mjs'), '// does the job\n');
      writeFileSync(path.join(dir, 'verify.mjs'), '// checks the job\n');
      queue.fail(job.id, 'agent session failed (error_max_turns)');

      const partial = queue.get(job.id)!;
      expect(partial.status).toBe('partial');
      expect(queue.resolve(job.id, 'promote').status).toBe('promoted');
    });

    // Half a tool is not a delivery: installTool refuses it, so the status
    // must not claim there is something to review.
    it('is a plain failure when a compile produced only half a tool', () => {
      const job = queue.add({ title: 'Compile a recipe', prompt: 'x' });
      const dir = queue.start(job.id);
      writeFileSync(path.join(dir, 'run.mjs'), '// does the job\n');
      queue.fail(job.id, 'agent session failed (error_max_turns)');
      expect(queue.get(job.id)!.status).toBe('failed');
    });

    it('is still a plain failure when nothing was produced', () => {
      const job = queue.add({ title: 'Nothing at all', prompt: 'x' });
      queue.start(job.id);
      queue.fail(job.id, 'session timed out');
      expect(queue.get(job.id)!.status).toBe('failed');
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
