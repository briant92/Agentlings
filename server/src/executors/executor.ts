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
}
