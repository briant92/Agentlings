import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Agentling, Job } from '@agentlings/shared';
import { creditRecipe, readRecipes, rememberRecipe, writeRecipes } from '../recipes';
import { decide } from '../router';
import { fetchPage } from '../web';
import type { Executor, ExecutorResult, RunHint } from './executor';

/**
 * Wraps the real executor with the deterministic layer. Work the router
 * recognises is done here, in code, for nothing; work it doesn't recognise
 * goes through to a session exactly as before.
 *
 * On the way back it does the other half: when a session explains how it
 * solved something, that becomes a recipe, so the next job of the same shape
 * skips the exploring and runs as a single shot.
 */
export class RoutedExecutor implements Executor {
  constructor(
    private levelDir: string,
    private knowledge: () => string[],
    private webConfig: () => { allow?: string[]; maxChars?: number } | null,
    private fallback: Executor,
  ) {}

  /** Work the router answered itself has no session to stop. */
  cancel(jobId: string): boolean {
    return this.fallback.cancel?.(jobId) ?? false;
  }

  async run(
    job: Job,
    sandboxDir: string,
    onProgress?: (detail: string) => void,
    agentling?: Agentling,
  ): Promise<ExecutorResult> {
    const recipes = readRecipes(this.levelDir);
    const decision = job.noRouter
      ? ({ kind: 'agent' } as const)
      : decide(job, {
          knowledge: this.knowledge(),
          recipes,
          canFetch: job.tools?.includes('web') === true,
        });

    if (decision.kind === 'answer') {
      writeFileSync(path.join(sandboxDir, 'RESULT.md'), `${decision.body}\n`);
      if (decision.recipeKey) {
        writeRecipes(this.levelDir, creditRecipe(recipes, decision.recipeKey, Date.now()));
      }
      onProgress?.(`answered without a session — ${decision.reason}`);
      return {
        summary: decision.summary,
        meter: { costUsd: 0, turns: 0, routed: true },
      };
    }

    if (decision.kind === 'fetch') {
      const web = this.webConfig() ?? {};
      const parts: string[] = [];
      for (const url of decision.urls) {
        onProgress?.(`reading ${url}`);
        const page = await fetchPage(url, { allow: web.allow, maxChars: web.maxChars });
        parts.push(
          page.error
            ? `## ${url}\n\nCould not read this: ${page.error}`
            : `## ${page.title ?? url}\n\nSource: ${url}\n\n${page.text}`,
        );
      }
      writeFileSync(
        path.join(sandboxDir, 'RESULT.md'),
        `# Pages you asked for\n\n${parts.join('\n\n')}\n\nFetched directly — no agentling session was needed.\n`,
      );
      const count = decision.urls.length;
      return {
        summary: `Fetched ${count} page${count === 1 ? '' : 's'} for you — no session needed.`,
        meter: { costUsd: 0, turns: 0, routed: true },
      };
    }

    let hint: RunHint | undefined;
    if (decision.kind === 'oneshot') {
      hint = { oneShot: true, approach: decision.approach };
      onProgress?.(`done before — running it with less exploring (${decision.reason})`);
    }

    const result = await this.fallback.run(job, sandboxDir, onProgress, agentling, hint);

    let updated = recipes;
    if (decision.kind === 'oneshot') {
      updated = creditRecipe(updated, decision.recipeKey, Date.now());
    }
    // Remember the approach, and the answer only when nothing outside the
    // sandbox fed into it — otherwise the same words could mean something
    // different next time.
    if (result.approach && agentling) {
      const reusable = !job.repoPath && !job.tools?.length;
      updated = rememberRecipe(updated, {
        prompt: job.prompt,
        role: agentling.role,
        approach: result.approach,
        ...(reusable ? { answer: result.summary } : {}),
        at: Date.now(),
      });
      onProgress?.('noted how to do this next time');
    }
    if (updated !== recipes || decision.kind === 'oneshot') {
      writeRecipes(this.levelDir, updated);
    }
    return result;
  }
}
