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
  /**
   * The capability surface of the recipe this was compiled from — what the
   * crew could reach when the method was found.
   *
   * **Recorded and deliberately not read**, the same bargain as `compile` on a
   * ledger row and `asked` beside it, and for the same reason: a manifest
   * cannot be given a field it never wrote, and the surface is only knowable
   * at compile time.
   *
   * Not read because gating on it today would cost money for no correctness.
   * A tool is "no dependencies, no shell commands, no network — Node built-ins
   * only", so by contract it uses none of the four axes a surface records: no
   * connection, no library, no SDK tool, no skill. A recipe demotes when the
   * surface moves because a *method* can be beaten by something new (D-036).
   * A compiled tool is already the cheapest tier there is, and its output is
   * proved by `verify.mjs` on every run, so a moved surface makes it possibly
   * dated rather than possibly wrong. Refusing on that would drop a free,
   * proven answer into a paid session to buy nothing.
   *
   * Kept anyway because the contract is a brief, not a jail — nothing stops a
   * generated `run.mjs` importing from the project root — and because the one
   * change that *would* invalidate a tool is giving tools the gated doors a
   * session gets, which the roadmap already says needs "a tool manifest to
   * record which connections it was compiled against". That question cannot be
   * answered retroactively for anything compiled before this field existed.
   */
  capabilities?: string[];
  /**
   * The doors this tool was compiled against, and may be handed at run time.
   *
   * Absent or empty means the original contract — Node built-ins, nothing
   * outside — which is true of every tool compiled before doors existed, so
   * there is nothing to backfill and no reading of an old manifest that is
   * wrong.
   *
   * A separate field from `capabilities` above, though that one's comment
   * predicted this day and expected to be it. It is the wrong shape for the
   * job: a surface records what the method *could* reach, so it carries every
   * ambient connection whether the method touched it or not, plus the tools,
   * skills and libraries axes. Gating a run on that would refuse a tool the
   * day an ambient connection it never called was switched off. What a grant
   * needs is what the method actually *used*, which is what `compileDoors`
   * computes and what this records. `capabilities` keeps its own job — the
   * historical surface — and stays unread.
   *
   * Read, unlike every other provenance field here, and that is the point: the
   * router refuses a tool whose doors are no longer granted to the job. A tool
   * compiled when the code host was on is not merely dated when it is switched
   * off, it is a script that will fail at its first call, and failing twice
   * retires it — so an unread field would spend the user two fallback sessions
   * and then destroy a working tool for a setting they changed on purpose.
   */
  connections?: string[];
  /**
   * Who earned the tool and where: the agentling that compiled it, and the
   * level it was compiled in.
   *
   * **Recorded and deliberately not read**, the same bargain as `capabilities`
   * above. Provenance is only knowable at compile time and a manifest cannot be
   * given a field it never wrote, so it is written now; nothing reads it,
   * because matching or ranking on who wrote a tool would change which answers
   * the router takes without buying any correctness.
   */
  earnedBy?: string;
  /** The level the tool was compiled in. Recorded and deliberately not read,
   * for the same reason as `earnedBy`. */
  earnedIn?: string;
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
/**
 * Where a compiled tool finds its doors: a JSON object of connection → endpoint.
 *
 * One variable rather than one per door, so a tool granted a second door later
 * reads it without the runner and the script having to agree on a new name.
 */
export const DOORS_ENV = 'AGENTLINGS_DOORS';
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
 * Whether a compiling run left a tool behind in its sandbox.
 *
 * One notion of "the compile delivered", used both by `installTool` — which
 * refuses half a tool — and by the queue, which must not call a run that
 * produced both halves a failure merely because a compile leaves no diff.
 */
export function deliveredTool(sandboxDir: string): boolean {
  return [RUN_SCRIPT, VERIFY_SCRIPT].every((s) => existsSync(path.join(sandboxDir, s)));
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
  /**
   * The connections this job has been granted. A tool needing a door the job
   * does not hold is not a match: the same capability-surface rule recipes
   * already carry (D-036, D-037), arriving at the tier that until now could
   * not need it. Defaulting to none is safe rather than strict — a tool with
   * no doors requires none, which is every tool compiled under the old
   * contract.
   */
  granted: string[] = [],
): ToolManifest | null {
  const key = normalise(prompt);
  const usable = tools.filter(
    (t) =>
      !t.retiredReason &&
      t.hasRepo === hasRepo &&
      (t.connections ?? []).every((conn) => granted.includes(conn)),
  );
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
 * A name no tool already holds.
 *
 * `toolNameFor` is deterministic, so compiling a recipe a second time would
 * otherwise write straight over the first attempt — destroying the retired
 * scripts and the reason they were retired at exactly the moment they become
 * worth reading, which is while diagnosing why the second attempt is needed.
 */
export function freeToolName(levelDir: string, base: string): string {
  if (!existsSync(toolDir(levelDir, base))) return base;
  for (let n = 2; n < 100; n++) {
    if (!existsSync(toolDir(levelDir, `${base}-${n}`))) return `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
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
export function promotionPrompt(
  recipe: { key: string; approach: string; role: string },
  /** Why earlier attempts were retired. A second try that is not told how the
   * first failed is an identical first try, and costs the same to find out. */
  retired: string[] = [],
  /**
   * The doors this method reached and the tool is therefore granted, with the
   * literal endpoint of each and the tools the catalog lets it name there.
   *
   * Empty for a method that never went outside, and the prompt then says
   * exactly what it always said. Passed in whole rather than looked up here,
   * because this module knows nothing about ports or the catalog, and the
   * endpoints have to be literal: a script cannot be asked to guess where the
   * server is listening.
   */
  doors: { name: string; endpoint: string; tools?: string[] }[] = [],
): string {
  return [
    `The crew has done this job enough times to stop paying for it: "${recipe.key}".`,
    '',
    'This is the method that worked:',
    recipe.approach,
    '',
    ...(retired.length > 0
      ? [
          'This job has been compiled before and the result was retired. Do not',
          'reproduce these faults:',
          ...retired.map((reason) => `- ${reason}`),
          '',
          `The commonest of them: ${RUN_SCRIPT} and ${VERIFY_SCRIPT} disagreeing about the same input. They must agree exactly, so write them against one shared definition rather than parsing twice from memory.`,
          '',
        ]
      : []),
    'Write two plain-node ES module scripts in your working directory, and change nothing else:',
    `- ${RUN_SCRIPT} — does the job, exactly as the method describes. It runs with the sandbox as its working directory, the same place a session would work. A repository, when there is one, is at ./repo.`,
    `- ${VERIFY_SCRIPT} — checks that ${RUN_SCRIPT} did the job. Exit 0 when the work is right and non-zero when it is not.`,
    '',
    ...(doors.length > 0
      ? [
          'This job reaches outside, so the tool is granted the same doors a session',
          'gets and nothing else. The server makes the call, checks the grant against',
          'its catalog and holds the key; your script gets an endpoint and no secret.',
          '',
          `Read them from \`process.env.${DOORS_ENV}\`, a JSON object keyed by connection:`,
          '',
          JSON.stringify(Object.fromEntries(doors.map((d) => [d.name, d.endpoint])), null, 2),
          '',
          'POST to a door with the built-in `fetch`. Two body shapes:',
          ...(doors.some((d) => d.name === 'web')
            ? ['- `web` takes `{"url": "..."}` and answers with the page text.']
            : []),
          ...(doors
            .filter((d) => d.name !== 'web')
            .map(
              (d) =>
                `- \`${d.name}\` takes \`{"tool": "...", "args": {...}}\`, where tool is one of: ${(d.tools ?? []).join(', ') || '(none granted)'}.`,
            )),
          '',
          `Set ${DOORS_ENV} yourself to that exact JSON when you test the scripts — the`,
          'runner sets it for you on every real run.',
          '',
          'The doors are the whole grant. Anything else outbound — another host, a',
          'package, a shell — is outside the contract and will be read as one at review.',
          '',
        ]
      : []),
    'Rules that matter:',
    doors.length > 0
      ? `- No dependencies, no shell commands. Node built-ins only, and no network except the ${DOORS_ENV} doors above.`
      : '- No dependencies, no shell commands, no network. Node built-ins only.',
    `- ${VERIFY_SCRIPT} must actually test the output, not merely check a file exists. It is the only thing standing between a free answer and a wrong one.`,
    ...(doors.length > 0
      ? [
          `- Fetch what you report, every run. Writing today's figures into ${RUN_SCRIPT} as literals makes it a cache rather than a method, and it will be stale the next time it runs. A ${VERIFY_SCRIPT} that checks those same literals proves only that you typed them twice (D-045).`,
          `- Check what comes back before keeping it. A door can answer with an error, an empty result, or a page that changed shape; ${RUN_SCRIPT} must exit non-zero rather than report a blank as a finding.`,
        ]
      : []),
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
  if (!deliveredTool(sandboxDir)) return false;

  const dir = toolDir(levelDir, manifest.name);
  mkdirSync(dir, { recursive: true });
  for (const script of [RUN_SCRIPT, VERIFY_SCRIPT]) {
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
