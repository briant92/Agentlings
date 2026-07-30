import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Job } from '@agentlings/shared';
import type { Executor, ExecutorResult } from './executor';

/** Stand-in executor: pretends to work, then writes a RESULT.md into the sandbox. */
export class SimulatedExecutor implements Executor {
  constructor(
    private minMs = 3000,
    private maxMs = 7000,
  ) {}

  async run(job: Job, sandboxDir: string): Promise<ExecutorResult> {
    const duration = this.minMs + Math.random() * (this.maxMs - this.minMs);
    await new Promise((r) => setTimeout(r, duration));
    const summary = `Simulated result for "${job.title}" (${Math.round(duration)}ms of pretend work).`;
    writeFileSync(
      path.join(sandboxDir, 'RESULT.md'),
      `# ${job.title}\n\n` +
        `> Simulated output — the real Claude Agent SDK executor lands in M1 (see SPEC.md).\n\n` +
        `**Prompt:** ${job.prompt}\n\n` +
        (job.repoPath ? `**Target repo:** ${job.repoPath}\n\n` : '') +
        `${summary}\n`,
    );
    return { summary };
  }
}
