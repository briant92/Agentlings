import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Agentling, Job } from '@agentlings/shared';
import { cloneRepo, patchFile, writeDiff } from '../gitwork';
import {
  TOOL_CANDIDATE_RUNS,
  creditRecipe,
  noteToolCandidate,
  readRecipes,
  rememberRecipe,
  writeRecipes,
} from '../recipes';
import { producedArtefacts } from '../outputs';
import { type Decision, decide } from '../router';
import {
  RUN_SCRIPT,
  TOOL_TIMEOUT_MS,
  VERIFY_SCRIPT,
  isComplete,
  readTools,
  recordToolRun,
  toolDir,
  usableTools,
} from '../tools';
import { fetchPage } from '../web';
import { CANCELLED, SessionFailure } from './claude';
import type { Executor, ExecutorResult, RunHint } from './executor';

/**
 * Runs one plain-node script in the sandbox and says whether it succeeded.
 * Killed at the timeout, because a compiled tool that hangs has stopped being
 * cheaper than the session it replaced.
 */
function runNode(script: string, cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd, stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, TOOL_TIMEOUT_MS);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/**
 * Wraps the real executor with the deterministic layer. Work the router
 * recognises is done here, in code, for nothing; work it doesn't recognise
 * goes through to a session exactly as before.
 *
 * On the way back it does the other half: when a session explains how it
 * solved something, that becomes a recipe, so the next job of the same shape
 * skips the exploring and runs as a single shot — and once a recipe has proved
 * itself often enough, a compiled tool can take the job away from the model
 * altogether.
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

  /**
   * Runs a compiled tool, and keeps its work only if the tool can prove it.
   *
   * Both scripts are plain node, so nothing here needs a shell or cares which
   * platform it is on. Returns null when the tool did not run or did not
   * convince, which sends the job back down the ordinary path.
   */
  private async runTool(
    name: string,
    job: Job,
    sandboxDir: string,
    onProgress?: (detail: string) => void,
  ): Promise<ExecutorResult | null> {
    const manifest = readTools(this.levelDir).find((t) => t.name === name);
    if (!manifest || !isComplete(this.levelDir, manifest)) return null;

    const dir = toolDir(this.levelDir, name);
    onProgress?.(`running the ${name} tool — no session needed`);

    if (job.repoPath) await cloneRepo(job.repoPath, sandboxDir);

    const ran = await runNode(path.join(dir, RUN_SCRIPT), sandboxDir);
    // Checked in a second process on purpose: a run that crashed cannot be
    // trusted to report that it crashed.
    const proved = ran && (await runNode(path.join(dir, VERIFY_SCRIPT), sandboxDir));

    const after = recordToolRun(this.levelDir, manifest, proved);
    if (!proved) {
      // Discarding the *result* is not enough: the tool's files are the work.
      // Found live — a half-finished clone left behind collided with the one
      // the fallback session then tried to make, and the job died on the
      // collision instead of quietly being done properly. The sandbox is ours
      // alone until the session starts, so emptying it is exactly right.
      rmSync(sandboxDir, { recursive: true, force: true });
      mkdirSync(sandboxDir, { recursive: true });
      if (after.retiredReason) onProgress?.(`${name} retired — ${after.retiredReason}`);
      return null;
    }

    if (job.repoPath) await writeDiff(sandboxDir);
    return {
      summary: `Done by the ${name} tool, which the crew wrote after doing this by hand. No session, no cost.`,
      meter: { costUsd: 0, turns: 0, routed: true, tooled: true },
    };
  }

  async run(
    job: Job,
    sandboxDir: string,
    onProgress?: (detail: string) => void,
    agentling?: Agentling,
  ): Promise<ExecutorResult> {
    const recipes = readRecipes(this.levelDir);
    const decision: Decision = job.noRouter
      ? { kind: 'agent' }
      : decide(job, {
          knowledge: this.knowledge(),
          recipes,
          tools: usableTools(this.levelDir),
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

    let toolFellBack = false;
    if (decision.kind === 'tool') {
      const done = await this.runTool(decision.toolName, job, sandboxDir, onProgress);
      if (done) return done;
      toolFellBack = true;
      // It could not prove its own output, so nothing it produced is kept and
      // the job carries on as if no tool existed. A free wrong answer is the
      // one outcome worse than paying for a right one.
      onProgress?.('the tool could not prove its work — doing it properly instead');
    }

    let hint: RunHint | undefined;
    if (decision.kind === 'oneshot') {
      hint = { oneShot: true, approach: decision.approach, recipeKey: decision.recipeKey };
      onProgress?.(`done before — running it with less exploring (${decision.reason})`);
    } else if (decision.kind === 'agent' && decision.approach) {
      hint = { approach: decision.approach };
      onProgress?.('something like this was done before — starting from that method');
    }
    // Whichever way the method arrived, the recipe was used.
    const usedKey = decision.kind === 'tool' ? undefined : decision.recipeKey;

    let result: ExecutorResult | undefined;
    let failure: unknown;
    try {
      result = await this.fallback.run(job, sandboxDir, onProgress, agentling, hint);
    } catch (err) {
      failure = err;
    }

    // Counted after the run rather than before it, so it can know whether the
    // run happened. Work stopped on purpose is not evidence that anybody wants
    // it compiled — the same reasoning that keeps a cancelled job `failed`
    // even when it left a diff behind. Found by reading the file: a job
    // cancelled two seconds in had logged a candidate exactly like a real one.
    //
    // A run that *failed* still counts. It was asked for and attempted, and
    // most runs on a short leash end that way — gating this on a clean exit is
    // the mistake this project has already paid for five times over.
    if (usedKey && !(failure instanceof SessionFailure && failure.message === CANCELLED)) {
      const used = recipes.find((r) => r.key === usedKey);
      if (used && (used.successes ?? 0) >= TOOL_CANDIDATE_RUNS) {
        // Not acted on: this only counts how often a compiled tool could have
        // served the job for nothing, so the fourth tier gets built on evidence
        // that the repeat work exists rather than on the hope that it does.
        noteToolCandidate(this.levelDir, {
          at: Date.now(),
          jobId: job.id,
          prompt: job.prompt,
          recipeKey: usedKey,
          successes: used.successes ?? 0,
        });
      }
    }

    // Bank what the run earned whether or not it finished. A run that died
    // still used its recipe, and SessionFailure carries the approach it wrote
    // down before it ran out — the contract already says the caller should
    // bank that, and this caller used to drop it on the floor. Measured: all
    // 13 recipe runs on this machine failed, so in 36 jobs no recipe was ever
    // credited or improved. Learning only from clean successes goes blind
    // exactly where a short leash puts most of its runs.
    const approach =
      result?.approach ?? (failure instanceof SessionFailure ? failure.approach : undefined);
    // The answer is only ever a finished run's, and only when nothing outside
    // the sandbox fed into it. A failed run's summary is its error message,
    // and an answer is replayed to the user word for word.
    const answer =
      result && !job.repoPath && !job.tools?.length ? result.summary : undefined;

    let updated = recipes;
    if (usedKey) {
      // Did the work, not exited cleanly — the same test `partial` uses, so
      // the app has one notion of a run that delivered. A run that produced a
      // correct diff and then ran out of turns writing it up has proved the
      // job is repeatable, which is the only question the counter is asking.
      //
      // Measured: three runs of a mechanical repo job, two of which wrote a
      // correct 129-line file, scored zero. Counting clean exits promotes
      // small jobs a script cannot do and excludes the big mechanical ones it
      // could — exactly backwards.
      //
      // Deliberately *narrower* than `partial`, and the two questions are not
      // the same however alike they look. `partial` asks whether there is
      // something here worth the user's attention — a half-finished generator
      // is. This asks whether the recipe reliably gets the job done, because
      // three of these compile it into a tool that runs with no model at all.
      //
      // Measured on job 2711da49: a run wrote a working PDF generator, ran out
      // of turns before executing it, produced no PDF — and under a files-on-
      // disk test banked a success. Three of those would compile a tool from a
      // method that never finishes, and the fall-through would absorb the cost
      // every time it failed. Widening this alongside `partial` was one change
      // too many, made the same day, on the strength of the two sounding
      // similar.
      const delivered = result !== undefined || existsSync(patchFile(sandboxDir));
      updated = creditRecipe(updated, usedKey, Date.now(), delivered);
    }
    if (approach && agentling) {
      // An answer is replayed to the user word for word, which is right when
      // the words *were* the deliverable and a lie when they only described
      // one. Measured on job 57bbff81: a run that had written a PDF banked its
      // own summary, and the next identical request was answered for free with
      // "hello-world.pdf (1,380 bytes) is a valid one-page PDF" — and no PDF.
      // The user asked for a file, was told its size, and got nothing.
      //
      // So a run that made something banks only its method. A repeat then runs
      // as a short one-shot that rebuilds the artefact, which is cheap and
      // true, rather than free and false.
      const madeSomething = producedArtefacts(sandboxDir);
      updated = rememberRecipe(updated, {
        prompt: job.prompt,
        role: agentling.role,
        approach,
        ...(answer !== undefined && !madeSomething ? { answer } : {}),
        at: Date.now(),
      });
      onProgress?.('noted how to do this next time');
    }
    if (updated !== recipes || usedKey) {
      writeRecipes(this.levelDir, updated);
    }

    if (!result) throw failure;
    // The user was quoted nothing, because a tool was going to do it. The tool
    // did not, and a promise of free that arrives as a bill is the one thing
    // the quote exists to prevent — so this one is on the app.
    return toolFellBack ? { ...result, meter: { ...result.meter, toolFellBack } } : result;
  }
}
