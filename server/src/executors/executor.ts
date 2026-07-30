import type { Agentling, Job, JobMeter } from '@agentlings/shared';

export interface ExecutorResult {
  summary: string;
  /** One line the agentling learned; appended to its memory file. */
  lesson?: string;
  /** What the session cost, when the executor can tell. */
  meter?: JobMeter;
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
  ): Promise<ExecutorResult>;
}
