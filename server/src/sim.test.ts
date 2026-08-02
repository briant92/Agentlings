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

const CREW = [
  { id: 'a1', name: 'Pip', color: 0x7bd88f, role: 'worker' },
  { id: 'a2', name: 'Dot', color: 0x6fb7ff, role: 'worker' },
];

describe('Sim', () => {
  let root: string;
  let queue: JobQueue;
  let sim: Sim;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-sim-'));
    queue = new JobQueue(root);
    sim = new Sim(CREW, queue, stuckExecutor);
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

  describe('cancelling', () => {
    it('kills the session and lets its own failure path record the outcome', () => {
      const killed: string[] = [];
      const killable: Executor = {
        run: () => new Promise<ExecutorResult>(() => {}),
        cancel: (id) => {
          killed.push(id);
          return true;
        },
      };
      const s = new Sim(CREW, queue, killable);
      const job = queue.add({ title: 'T', prompt: 'p' });
      // Walk it all the way to its station so the session is actually running.
      for (let i = 0; i < 200 && queue.get(job.id)!.status !== 'running'; i++) s.step();
      expect(queue.get(job.id)!.status).toBe('running');

      expect(s.cancelJob(job.id)).toBe(true);
      expect(killed).toEqual([job.id]);
      // Deliberately still 'running': the kill makes the run reject, and the
      // catch there resolves it — doing it here too would resolve it twice.
      expect(queue.get(job.id)!.status).toBe('running');
    });

    it('closes out queued work itself, since there is no session to kill', () => {
      const job = queue.add({ title: 'T', prompt: 'p' });
      expect(sim.cancelJob(job.id)).toBe(true);
      expect(queue.get(job.id)!.status).toBe('failed');
      expect(queue.get(job.id)!.error).toBe('cancelled');
    });

    it('frees the agentling that was holding it', () => {
      const job = queue.add({ title: 'T', prompt: 'p' });
      sim.step();
      const holder = sim.agentlings.find((a) => a.jobId === job.id)!;
      sim.cancelJob(job.id);
      expect(holder.jobId).toBeUndefined();
      expect(holder.state).toBe('idle');
    });

    it('will not cancel work that already finished', () => {
      const job = queue.add({ title: 'T', prompt: 'p' });
      queue.start(job.id);
      queue.complete(job.id, 'done');
      expect(sim.cancelJob(job.id)).toBe(false);
    });
  });

  /**
   * The other half of D-041. `complete` files an empty run as a failure, and
   * this callback used to hardcode `done` regardless — so the terminal
   * announced a delivery, the agentling was credited with a job it had not
   * done, and the ledger priced it. All three follow the queue's verdict now.
   */
  describe('a run that finishes without delivering', () => {
    const emptyExecutor: Executor = {
      run: async () => ({ summary: 'I need write permission to complete this job.' }),
    };
    /** Waits for the executor promise and the callbacks chained after it. */
    const settle = () => new Promise((resolve) => setImmediate(resolve));

    it('is announced as failed, not as delivered', async () => {
      const events: { type: string; detail?: string }[] = [];
      const s = new Sim(CREW, queue, emptyExecutor, (e) => events.push(e));
      const job = queue.add({ title: 'Summarise', prompt: 'p' });
      for (let i = 0; i < 200 && queue.get(job.id)!.status === 'queued'; i++) s.step();
      await settle();

      expect(queue.get(job.id)!.status).toBe('failed');
      expect(events.map((e) => e.type)).toContain('failed');
      expect(events.map((e) => e.type)).not.toContain('done');
    });

    it('is not credited to the agentling that could not do it', async () => {
      const outcomes: string[] = [];
      const s = new Sim(CREW, queue, emptyExecutor, undefined, (_a, _j, outcome) =>
        outcomes.push(outcome),
      );
      const job = queue.add({ title: 'Summarise', prompt: 'p' });
      for (let i = 0; i < 200 && queue.get(job.id)!.status === 'queued'; i++) s.step();
      await settle();

      const worker = s.agentlings.find((a) => a.jobsFailed > 0)!;
      expect(worker.jobsDone).toBe(0);
      expect(worker.jobsFailed).toBe(1);
      // What the ledger prices. `failed` is what makes it absorbed.
      expect(outcomes).toEqual(['failed']);
      // Nothing to carry to the exit.
      expect(worker.state).toBe('idle');
    });
  });

  it('hires drop in at the hatch and join the patrol', () => {
    const hired = sim.addAgentling({ id: 'a3', name: 'Fen', color: 0xffb86c, role: 'worker' });
    expect(sim.agentlings).toHaveLength(3);
    expect(hired.state).toBe('idle');
    const before = hired.x;
    sim.step();
    expect(sim.agentlings.find((a) => a.id === 'a3')!.x).not.toBe(before);
  });
});
