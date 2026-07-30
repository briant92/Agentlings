import type { Job } from '@agentlings/shared';

export interface ExecutorResult {
  summary: string;
}

/**
 * Runs the real work for a job inside its sandbox directory.
 * M1 swaps SimulatedExecutor for a Claude Agent SDK executor (see SPEC.md).
 */
export interface Executor {
  run(job: Job, sandboxDir: string): Promise<ExecutorResult>;
}
