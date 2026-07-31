import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { SIMILAR_ENOUGH, normalise, similarity, terms } from './recipes';

/**
 * The fourth tier: a job the crew has done enough times to compile.
 *
 * A recipe makes repeat work cheaper by saving the exploring; a tool makes it
 * free by removing the model. The agent stops being the thing that does the
 * job and becomes the thing that once wrote down how — interpretation
 * compiled. That is the only route to a cost per task that actually falls,
 * because notes still have to be read by something that charges to read them.
 *
 * What keeps this from being reckless is that a tool is never trusted. It
 * matches only on the shape it was compiled for, it must prove its output
 * before that output is kept, and two failures in a row retire it. A wrong
 * answer given for free is still a wrong answer — the router's whole rule is
 * that a missed saving costs money and a wrong answer costs trust.
 */

export interface ToolManifest {
  name: string;
  /** The recipe this was compiled from. The tool answers that job, not others. */
  recipeKey: string;
  terms: string[];
  /**
   * Whether the work it was compiled for had a repository. A tool written
   * against a clone is simply wrong when there is no clone, and the words of
   * the two jobs can be identical.
   */
  hasRepo: boolean;
  description: string;
  learnedAt: number;
  runs: number;
  /** Consecutive failures. Reset by a clean run; two in a row retire the tool. */
  failures: number;
  /** Set once retired, so it is visible why rather than merely gone. */
  retiredReason?: string;
  /**
   * The compiling job, while it is still being reviewed. A generated tool is
   * executable instruction, so it goes through the same review as any other
   * output rather than installing itself: the scripts sit in that job's sandbox
   * until it is promoted.
   */
  pendingJobId?: string;
}

/** Two strikes. One is noise; three is a habit the user paid for twice. */
export const STRIKES_ALLOWED = 2;
/** A compiled tool should be quick. Anything slower is not doing what it claims. */
export const TOOL_TIMEOUT_MS = 60_000;
/** Both are plain node, so nothing here depends on a shell or a platform. */
export const RUN_SCRIPT = 'run.mjs';
export const VERIFY_SCRIPT = 'verify.mjs';

export function toolsDir(levelDir: string): string {
  return path.join(levelDir, 'tools');
}

export function toolDir(levelDir: string, name: string): string {
  return path.join(toolsDir(levelDir), name);
}

export function readTools(levelDir: string): ToolManifest[] {
  const root = toolsDir(levelDir);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => {
      const file = path.join(root, e.name, 'tool.json');
      if (!existsSync(file)) return [];
      try {
        return [JSON.parse(readFileSync(file, 'utf8')) as ToolManifest];
      } catch {
        return [];
      }
    });
}

export function writeTool(levelDir: string, manifest: ToolManifest): void {
  const dir = toolDir(levelDir, manifest.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'tool.json'), JSON.stringify(manifest, null, 2));
}

/** A tool is only usable once it has both halves: something to run, and a way to check it. */
export function isComplete(levelDir: string, manifest: ToolManifest): boolean {
  const dir = toolDir(levelDir, manifest.name);
  return existsSync(path.join(dir, RUN_SCRIPT)) && existsSync(path.join(dir, VERIFY_SCRIPT));
}

/**
 * The tool for this job, if one has earned it.
 *
 * Deliberately stricter than recipe matching, and only ever the strong bar. A
 * weak recipe match costs a paragraph of prompt the session can ignore; a weak
 * tool match runs somebody's generated script over the job instead of doing
 * it. There is no cheap version of that mistake.
 */
export function findTool(
  tools: ToolManifest[],
  prompt: string,
  hasRepo: boolean,
): ToolManifest | null {
  const key = normalise(prompt);
  const usable = tools.filter((t) => !t.retiredReason && t.hasRepo === hasRepo);
  const exact = usable.find((t) => t.recipeKey === key);
  if (exact) return exact;

  const wanted = terms(prompt);
  const corpus = usable.map((t) => t.terms);
  let best: ToolManifest | null = null;
  let bestScore = 0;
  for (const tool of usable) {
    const score = similarity(wanted, tool.terms, corpus);
    if (score > bestScore) {
      best = tool;
      bestScore = score;
    }
  }
  return best && bestScore >= SIMILAR_ENOUGH ? best : null;
}

/** A short, stable directory name for the job a tool was compiled from. */
export function toolNameFor(recipeKey: string): string {
  const slug = terms(recipeKey).slice(0, 4).join('-').replace(/[^a-z0-9-]/g, '');
  return slug || 'tool';
}

/**
 * What the promotion session is asked to write.
 *
 * It gets the method the crew already proved and is told to turn that into a
 * script — the point of compiling is that the thinking was done on the earlier
 * runs and does not have to happen again. The check matters more than the
 * script: without a way to prove the output, the tier is just a faster way to
 * be wrong, so a tool with no verify never runs.
 */
export function promotionPrompt(recipe: { key: string; approach: string; role: string }): string {
  return [
    `The crew has done this job enough times to stop paying for it: "${recipe.key}".`,
    '',
    'This is the method that worked:',
    recipe.approach,
    '',
    'Write two plain-node ES module scripts in your working directory, and change nothing else:',
    `- ${RUN_SCRIPT} — does the job, exactly as the method describes. It runs with the sandbox as its working directory, the same place a session would work. A repository, when there is one, is at ./repo.`,
    `- ${VERIFY_SCRIPT} — checks that ${RUN_SCRIPT} did the job. Exit 0 when the work is right and non-zero when it is not.`,
    '',
    'Rules that matter:',
    '- No dependencies, no shell commands, no network. Node built-ins only.',
    `- ${VERIFY_SCRIPT} must actually test the output, not merely check a file exists. It is the only thing standing between a free answer and a wrong one.`,
    '- Handle the job going wrong by exiting non-zero. Falling back to a session is fine; pretending to have succeeded is not.',
    '- Finish by writing RESULT.md describing what you built, as usual.',
  ].join('\n');
}

/**
 * Records how a run went. A tool that fails twice running is retired rather
 * than left to keep costing the user a fallback session every time.
 */
export function recordToolRun(
  levelDir: string,
  manifest: ToolManifest,
  worked: boolean,
): ToolManifest {
  const failures = worked ? 0 : manifest.failures + 1;
  const updated: ToolManifest = {
    ...manifest,
    runs: manifest.runs + 1,
    failures,
    ...(failures >= STRIKES_ALLOWED
      ? { retiredReason: `failed ${failures} runs in a row` }
      : {}),
  };
  writeTool(levelDir, updated);
  return updated;
}

/**
 * Installs a reviewed tool: the two scripts move from the sandbox the
 * compiling session wrote them in, into the tool's own directory.
 *
 * Returns false when either script is missing, which leaves the tool
 * incomplete and therefore unusable — a compiling run that produced only half
 * a tool must not leave something the router will reach for.
 */
export function installTool(
  levelDir: string,
  manifest: ToolManifest,
  sandboxDir: string,
): boolean {
  const scripts = [RUN_SCRIPT, VERIFY_SCRIPT];
  if (!scripts.every((s) => existsSync(path.join(sandboxDir, s)))) return false;

  const dir = toolDir(levelDir, manifest.name);
  mkdirSync(dir, { recursive: true });
  for (const script of scripts) {
    copyFileSync(path.join(sandboxDir, script), path.join(dir, script));
  }
  const { pendingJobId: _installed, ...ready } = manifest;
  writeTool(levelDir, ready);
  return true;
}

/**
 * Tools the router may actually claim work with: complete and not retired.
 *
 * A manifest is written before the promotion session runs, so between the two
 * a tool exists with nothing to execute. Filtering here rather than in the
 * executor means a half-written tool never wins a job away from the recipe
 * hint that would otherwise have helped it.
 */
export function usableTools(levelDir: string): ToolManifest[] {
  return readTools(levelDir).filter((t) => !t.retiredReason && isComplete(levelDir, t));
}
