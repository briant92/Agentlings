import { describe, expect, it } from 'vitest';
import type { Job } from '@agentlings/shared';
import { ChosenExecutor, type Executor, type ExecutorResult } from './executor';

/** An executor that records that it ran, and whether it was asked to stop. */
function stub(name: string, stops = false) {
  const ran: string[] = [];
  const cancelled: string[] = [];
  const executor: Executor = {
    async run(job): Promise<ExecutorResult> {
      ran.push(job.id);
      return { summary: name };
    },
    cancel(jobId: string) {
      cancelled.push(jobId);
      return stops;
    },
  };
  return { executor, ran, cancelled };
}

const JOB = { id: 'j1', title: 't', prompt: 'p' } as unknown as Job;

describe('ChosenExecutor (#32)', () => {
  it('asks at the run, so a key pasted after boot takes effect on the next job', () => {
    // The whole point. This was `useClaude ? claude : simulated`, decided once
    // when the level runtime was built — which made a key stored by the drawer
    // inert until someone restarted a server that, on a host, has no shell.
    let live = false;
    const real = stub('real');
    const pretend = stub('pretend');
    const chosen = new ChosenExecutor(() => live, real.executor, pretend.executor);

    return chosen.run(JOB, '/tmp').then(async (first) => {
      expect(first.summary).toBe('pretend');
      live = true;
      expect((await chosen.run(JOB, '/tmp')).summary).toBe('real');
      // No reconstruction happened between those two calls.
      expect(real.ran).toEqual(['j1']);
      expect(pretend.ran).toEqual(['j1']);
    });
  });

  it('passes every argument through untouched', async () => {
    const seen: unknown[] = [];
    const recorder: Executor = {
      async run(job, dir, onProgress, agentling, hint) {
        seen.push([job.id, dir, typeof onProgress, agentling, hint]);
        return { summary: 'ok' };
      },
    };
    const chosen = new ChosenExecutor(() => true, recorder, stub('other').executor);
    const hint = { oneShot: true };
    const agentling = { name: 'pip' } as never;
    await chosen.run(JOB, '/sand', () => {}, agentling, hint);
    expect(seen[0]).toEqual(['j1', '/sand', 'function', agentling, hint]);
  });

  it('cancels through both, because the switch may have moved mid-run', async () => {
    // A job that started while the engine was on has a live child process. If
    // the person switched it off while that job ran, asking only the executor
    // `choose()` names now would report "nothing to stop" and leave the child
    // running.
    const real = stub('real', true);
    const pretend = stub('pretend');
    const chosen = new ChosenExecutor(() => false, real.executor, pretend.executor);
    expect(chosen.cancel('j1')).toBe(true);
    expect(real.cancelled).toEqual(['j1']);
    expect(pretend.cancelled).toEqual(['j1']);
  });

  it('reports nothing stopped when neither had the job', () => {
    const chosen = new ChosenExecutor(() => true, stub('a').executor, stub('b').executor);
    expect(chosen.cancel('nobody')).toBe(false);
  });

  it('survives an executor with no cancel at all', () => {
    // `cancel` is optional on the interface, and the simulator does not have
    // one — a bare `.cancel(id)` here would throw instead of answering.
    const noCancel: Executor = { async run() { return { summary: 'x' }; } };
    const chosen = new ChosenExecutor(() => true, noCancel, noCancel);
    expect(chosen.cancel('j1')).toBe(false);
  });
});
