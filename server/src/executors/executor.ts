import type { Agentling, Job, JobMeter } from '@agentlings/shared';

export interface ExecutorResult {
  summary: string;
  /** One line the agentling learned; appended to its memory file. */
  lesson?: string;
  /** What the session cost, when the executor can tell. */
  meter?: JobMeter;
  /** How to do this kind of job next time; becomes a recipe. */
  approach?: string;
}

/** Extra shaping for one run, set by the router rather than by the job. */
export interface RunHint {
  /** Run as a single call instead of an exploring loop. */
  oneShot?: boolean;
  /** What worked last time, handed to the session so it need not rediscover it. */
  approach?: string;
  /**
   * The recipe this run is a repeat of, carried through to the ledger so the
   * quote can price it against its own history. Set only for a one-shot: it is
   * the tier whose quote is keyed by recipe, and marking a full session with it
   * would take that row out of its role's history, which is what prices a
   * session.
   */
  recipeKey?: string;
}

/**
 * Runs the real work for a job inside its sandbox directory. Progress lines
 * surface in the reporting terminal; the agentling (when given) carries the
 * role and memory that shape the session.
 */
export interface Executor {
  run(
    job: Job,
    sandboxDir: string,
    onProgress?: (detail: string) => void,
    agentling?: Agentling,
    hint?: RunHint,
  ): Promise<ExecutorResult>;

  /**
   * Stop the work for this job, returning whether anything was stopped.
   * Optional: an executor with nothing to kill simply does not have it.
   */
  cancel?(jobId: string): boolean;
}

/**
 * Picks between two executors when a job actually runs, rather than when the
 * level runtime is built (#32).
 *
 * The choice used to be made once, at construction: `useClaude ? claude :
 * simulated`. That is what made a model key pasted in Settings inert — the
 * drawer stores the key and patches live `process.env` in the same call
 * (D-078), so the key is there, and this object had already been handed the
 * simulator. The install stayed pretending until someone restarted a server
 * that, on a host, has no shell to restart it from.
 *
 * `RoutedExecutor` only ever touches its fallback at call time, so nothing
 * there had to change — the seam was already in the right place, and only the
 * value flowing through it was frozen.
 */
export class ChosenExecutor implements Executor {
  constructor(
    private choose: () => boolean,
    private whenTrue: Executor,
    private whenFalse: Executor,
  ) {}

  run(
    job: Parameters<Executor['run']>[0],
    sandboxDir: string,
    onProgress?: (detail: string) => void,
    agentling?: Parameters<Executor['run']>[3],
    hint?: RunHint,
  ): Promise<ExecutorResult> {
    return (this.choose() ? this.whenTrue : this.whenFalse).run(
      job,
      sandboxDir,
      onProgress,
      agentling,
      hint,
    );
  }

  /**
   * Both, not the current choice. A job that started while the engine was on
   * has a live child process; if the switch went off while it ran, asking only
   * the executor `choose()` names now would report "nothing to stop" and leave
   * that child running. Cancelling an executor that is not running the job is
   * how it already answers false.
   */
  cancel(jobId: string): boolean {
    const stoppedTrue = this.whenTrue.cancel?.(jobId) ?? false;
    const stoppedFalse = this.whenFalse.cancel?.(jobId) ?? false;
    return stoppedTrue || stoppedFalse;
  }
}
