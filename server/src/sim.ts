import type { Agentling, JobEvent, WorldState } from '@agentlings/shared';
import { EXIT_X, SPAWN_X, STATION_BASE_X, STATION_SPACING } from '@agentlings/shared';
import type { Executor } from './executors/executor';
import type { JobQueue } from './queue';

export type EmitEvent = (event: Omit<JobEvent, 'id' | 'at'>) => void;

const WALK_SPEED = 6; // world units per tick
const NAMES = ['Pip', 'Dot', 'Moss', 'Bea'];
const COLORS = [0x7bd88f, 0x6fb7ff, 0xffb86c, 0xff8fa3];

export function stationX(slot: number): number {
  return STATION_BASE_X + slot * STATION_SPACING;
}

/**
 * The world: a handful of agentlings that pick up queued jobs, walk to the
 * job's station, wait for the executor, and deliver the result to the exit.
 * The sim is presentation-state only — job truth lives in the JobQueue.
 */
export class Sim {
  tick = 0;
  agentlings: Agentling[];

  constructor(
    private queue: JobQueue,
    private executor: Executor,
    private emit: EmitEvent = () => {},
  ) {
    this.agentlings = NAMES.map((name, i) => ({
      id: `a${i + 1}`,
      name,
      color: COLORS[i],
      state: 'idle',
      x: SPAWN_X + i * 26,
      targetX: SPAWN_X + i * 26,
    }));
  }

  state(): WorldState {
    return { tick: this.tick, agentlings: this.agentlings, jobs: this.queue.list() };
  }

  step(): void {
    this.tick++;
    for (const a of this.agentlings) {
      switch (a.state) {
        case 'idle':
          this.tryPickUp(a);
          if (a.state === 'idle') this.wander(a);
          break;
        case 'walking':
        case 'delivering':
          this.walk(a);
          break;
        case 'working':
          break; // waiting on the executor promise
      }
    }
  }

  private tryPickUp(a: Agentling): void {
    const job = this.queue.nextUnassigned();
    if (!job) return;
    this.queue.assign(job.id, a.id);
    a.jobId = job.id;
    a.state = 'walking';
    a.targetX = stationX(job.slot);
  }

  private walk(a: Agentling): void {
    const dx = a.targetX - a.x;
    if (Math.abs(dx) <= WALK_SPEED) {
      a.x = a.targetX;
      this.arrive(a);
      return;
    }
    a.x += Math.sign(dx) * WALK_SPEED;
  }

  private arrive(a: Agentling): void {
    if (a.state === 'delivering') {
      // Result dropped at the exit; head home.
      a.jobId = undefined;
      a.state = 'walking';
      a.targetX = this.homeX();
      return;
    }
    if (!a.jobId) {
      a.state = 'idle';
      return;
    }
    this.beginWork(a, a.jobId);
  }

  private beginWork(a: Agentling, jobId: string): void {
    const job = this.queue.get(jobId);
    if (!job) {
      a.state = 'idle';
      a.jobId = undefined;
      return;
    }
    a.state = 'working';
    const sandboxDir = this.queue.start(jobId);
    this.emit({ type: 'started', jobId, title: job.title, agentling: a.name });
    this.executor
      .run(job, sandboxDir, (detail) =>
        this.emit({ type: 'progress', jobId, title: job.title, agentling: a.name, detail }),
      )
      .then((result) => {
        this.queue.complete(jobId, result.summary);
        this.emit({ type: 'done', jobId, title: job.title, agentling: a.name, detail: result.summary });
        a.state = 'delivering';
        a.targetX = EXIT_X;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.queue.fail(jobId, message);
        this.emit({ type: 'failed', jobId, title: job.title, agentling: a.name, detail: message });
        a.jobId = undefined;
        a.state = 'walking';
        a.targetX = this.homeX();
      });
  }

  private wander(a: Agentling): void {
    if (Math.random() < 0.02) {
      a.state = 'walking';
      a.targetX = this.homeX();
    }
  }

  private homeX(): number {
    return SPAWN_X + Math.random() * 100;
  }
}
