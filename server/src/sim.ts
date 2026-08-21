import type { Agentling, Job, JobEvent, WorldFrame, WorldState } from '@agentlings/shared';
import { EXIT_X, STATION_BASE_X, STATION_SPACING } from '@agentlings/shared';
import { SessionFailure } from './executors/claude';
import type { Executor } from './executors/executor';
import type { CrewSeed } from './levels';
import type { JobQueue } from './queue';

export type EmitEvent = (event: Omit<JobEvent, 'id' | 'at'>) => void;
export type OnOutcome = (
  agentling: Agentling,
  /** The job itself, so callers can read its meter and quote. */
  job: Job,
  outcome: 'done' | 'failed',
  detail: string,
  lesson?: string,
) => void;
/**
 * A run has begun: the job is `running` and persisted, its sandbox exists,
 * and nothing else is known yet. What the ledger opens its row on (D-199).
 */
export type OnStart = (agentling: Agentling, job: Job) => void;

const WALK_SPEED = 6; // world units per tick
const PATROL_MIN = 48; // just clear of the left rock wall
const PATROL_MAX = 950; // bounce at the right wall, past the arch
const SPAWN_AT = 80; // hires drop in under the hatch

/** The persisted crew record; the sim materialises the awake ones. */
export type { CrewSeed } from './levels';

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
  /** Patrol heading per agentling; 'idle' means walking the level like a lemming. */
  private dirs = new Map<string, 1 | -1>();
  /** Walking out for good — removed when they reach the door. */
  private leaving = new Set<string>();

  constructor(
    crew: CrewSeed[],
    private queue: JobQueue,
    private executor: Executor,
    private emit: EmitEvent = () => {},
    private onOutcome: OnOutcome = () => {},
    private onStart: OnStart = () => {},
  ) {
    const span = PATROL_MAX - PATROL_MIN;
    this.agentlings = crew.map((seed, i) => {
      const x = Math.round(PATROL_MIN + ((i + 1) / (crew.length + 1)) * span);
      return {
        ...seed,
        state: 'idle' as const,
        x,
        targetX: x,
        jobsDone: seed.jobsDone ?? 0,
        jobsFailed: seed.jobsFailed ?? 0,
      };
    });
    this.agentlings.forEach((a, i) => this.dirs.set(a.id, i % 2 === 0 ? 1 : -1));
  }

  /** A new hire drops in under the hatch and joins the patrol. */
  addAgentling(seed: CrewSeed): Agentling {
    const a: Agentling = {
      ...seed,
      state: 'idle',
      x: SPAWN_AT,
      targetX: SPAWN_AT,
      jobsDone: seed.jobsDone ?? 0,
      jobsFailed: seed.jobsFailed ?? 0,
    };
    this.agentlings.push(a);
    this.dirs.set(a.id, 1);
    return a;
  }

  /**
   * Sends someone to the door and off the world. Resting and leaving for good
   * look the same from here — the roster is what remembers the difference.
   * Returns false if they are mid-job and can't be interrupted.
   */
  sendOut(id: string): boolean {
    const a = this.agentlings.find((other) => other.id === id);
    if (!a || a.state === 'working') return false;
    a.jobId = undefined;
    a.state = 'delivering'; // the walk-to-the-door animation, reused
    a.targetX = EXIT_X;
    this.leaving.add(id);
    return true;
  }

  state(): WorldState {
    return { tick: this.tick, agentlings: this.agentlings, jobs: this.queue.list() };
  }

  /**
   * What goes on the wire for one tick. The job list is the expensive part —
   * a copy and a sort of every job ever queued — so it is only built when the
   * caller knows the watcher's copy is stale.
   */
  frame(withJobs: boolean): WorldFrame {
    return {
      tick: this.tick,
      agentlings: this.agentlings,
      ...(withJobs ? { jobs: this.queue.list() } : {}),
    };
  }

  step(): void {
    this.tick++;
    for (const a of this.agentlings) {
      switch (a.state) {
        case 'idle':
          this.tryPickUp(a);
          if (a.state === 'idle') this.patrol(a);
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

  /** The resting state is motion: march the level, turn at the walls. */
  private patrol(a: Agentling): void {
    const dir = this.dirs.get(a.id) ?? 1;
    a.x += WALK_SPEED * dir;
    if (a.x >= PATROL_MAX) {
      a.x = PATROL_MAX;
      this.dirs.set(a.id, -1);
    } else if (a.x <= PATROL_MIN) {
      a.x = PATROL_MIN;
      this.dirs.set(a.id, 1);
    }
    a.targetX = a.x;
  }

  private tryPickUp(a: Agentling): void {
    const rolesPresent = new Set(this.agentlings.map((other) => other.role));
    // Whether anyone else awake holds this role — a check pass prefers a
    // different member than the one it checks, and this is what lets a sole
    // holder take it anyway rather than starving it (TEAMWORK T1).
    const soleOfRole = !this.agentlings.some(
      (other) => other.id !== a.id && other.role === a.role,
    );
    const job = this.queue.nextUnassigned(a.role, rolesPresent, { id: a.id, soleOfRole });
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
    if (this.leaving.has(a.id)) {
      this.agentlings = this.agentlings.filter((other) => other.id !== a.id);
      this.dirs.delete(a.id);
      this.leaving.delete(a.id);
      return;
    }
    if (a.state === 'delivering') {
      // Result dropped at the exit; turn around and rejoin the patrol.
      a.jobId = undefined;
      a.state = 'idle';
      this.dirs.set(a.id, -1);
      return;
    }
    if (!a.jobId) {
      a.state = 'idle';
      return;
    }
    this.beginWork(a, a.jobId);
  }

  /**
   * Stop a job on request. A running session is killed and its own failure
   * path records the outcome, so the diff and the cost it already earned are
   * still harvested. Work that never started has nothing to kill and is
   * simply closed out here.
   */
  cancelJob(jobId: string): boolean {
    const job = this.queue.get(jobId);
    if (!job) return false;
    if (job.status !== 'queued' && job.status !== 'running') return false;

    // The kill makes the run reject, and the catch in beginWork does the
    // rest — recording it here as well would resolve the job twice.
    if (job.status === 'running' && this.executor.cancel?.(jobId)) return true;

    this.queue.cancel(jobId);
    const holder = this.agentlings.find((a) => a.jobId === jobId);
    if (holder) {
      holder.jobId = undefined;
      holder.state = 'idle';
    }
    this.emit({
      type: 'failed',
      jobId,
      title: job.title,
      ...(holder ? { agentling: holder.name } : {}),
      detail: 'cancelled',
    });
    return true;
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
    // Before the executor is asked anything: a process that dies under the
    // run from here on leaves the row this opens, not nothing (D-199).
    this.onStart(a, job);
    this.executor
      .run(
        job,
        sandboxDir,
        (detail) =>
          this.emit({ type: 'progress', jobId, title: job.title, agentling: a.name, detail }),
        a,
      )
      .then((result) => {
        this.queue.complete(jobId, result.summary, result.meter);
        /**
         * The queue decides whether that counted, not this callback.
         *
         * A run can finish cleanly and deliver nothing — the session that says
         * it cannot do the job returns normally — and `complete` now files
         * that as a failure. Reading the verdict back keeps the three things
         * that follow from it honest: the event the terminal shows, the
         * agentling's career record, and the outcome the ledger prices. This
         * used to hardcode `done`, so a job that produced nothing was
         * announced as delivered, credited to the crew member who could not do
         * it, and billed (D-041).
         */
        const after = this.queue.get(jobId) ?? job;
        const landed = after.status !== 'failed';
        const detail = landed ? result.summary : (after.error ?? result.summary);
        this.emit({
          type: landed ? 'done' : 'failed',
          jobId,
          title: job.title,
          agentling: a.name,
          detail,
        });
        if (landed) a.jobsDone++;
        else a.jobsFailed++;
        this.onOutcome(a, after, landed ? 'done' : 'failed', detail, result.lesson);
        if (landed) {
          a.state = 'delivering';
          a.targetX = EXIT_X;
        } else {
          a.jobId = undefined;
          a.state = 'idle'; // nothing to carry to the exit
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        const salvaged = err instanceof SessionFailure ? err : undefined;
        this.queue.fail(jobId, message, salvaged?.meter);
        this.emit({ type: 'failed', jobId, title: job.title, agentling: a.name, detail: message });
        a.jobsFailed++;
        this.onOutcome(a, this.queue.get(jobId) ?? job, 'failed', message, salvaged?.lesson);
        a.jobId = undefined;
        a.state = 'idle'; // shake it off, back on patrol
      });
  }
}
