import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Executor, ExecutorResult } from './executors/executor';
import { JobQueue } from './queue';
import { Sim, stationX } from './sim';

/** Never resolves — keeps a job in 'working' while we assert on the world. */
const stuckExecutor: Executor = {
  run: () => new Promise<ExecutorResult>(() => {}),
};

describe('Sim', () => {
  let root: string;
  let queue: JobQueue;
  let sim: Sim;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-sim-'));
    queue = new JobQueue(root);
    sim = new Sim(queue, stuckExecutor);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('patrols in idle: everyone keeps moving and bounces at the walls', () => {
    const before = sim.agentlings.map((a) => a.x);
    sim.step();
    sim.agentlings.forEach((a, i) => expect(a.x).not.toBe(before[i]));

    const walker = sim.agentlings[0];
    walker.x = 949; // heading right, one step from the wall
    sim.step();
    expect(walker.x).toBe(950);
    sim.step();
    expect(walker.x).toBeLessThan(950); // turned around

    walker.x = 49;
    sim.step();
    sim.step();
    expect(walker.x).toBeGreaterThan(48); // bounced off the left wall too
  });

  it('breaks patrol to pick up a job and walk to its station', () => {
    const job = queue.add({ title: 'T', prompt: 'p' });
    sim.step();
    const worker = sim.agentlings.find((a) => a.jobId === job.id);
    expect(worker).toBeDefined();
    expect(worker!.state).toBe('walking');
    expect(worker!.targetX).toBe(stationX(job.slot));
    expect(queue.get(job.id)!.assignedTo).toBe(worker!.id);
  });
});
