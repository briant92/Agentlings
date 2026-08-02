import { type ChildProcess, spawn } from 'node:child_process';
import {
  cpSync,
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { Agentling, Job, JobAttachment, JobMeter } from '@agentlings/shared';
import { SERVER_PORT } from '@agentlings/shared';
import { mcpToolNames, resolveForJob, toMcpServers, type Connection } from '../connections';
import { applyPatch, cloneRepo, patchFile, repoDir, writeDiff } from '../gitwork';
import { rateFor, type LedgerEntry } from '../ledger';
import type { MemoryStore } from '../memory';
import { outputNames } from '../outputs';
import type { LoadedRole, RoleRegistry } from '../roles';
import { relevantLines } from '../router';
import { GITHUB_TOOLS } from '../github';
import { extractUrls, fetchPage } from '../web';
import type { Executor, ExecutorResult, RunHint } from './executor';

const SESSION_TIMEOUT_MS = 10 * 60_000;
/**
 * A runaway agent that keeps "investigating" is the classic cost failure
 * mode, and turns are the multiplier. Roles that genuinely need to explore
 * raise this themselves with `maxTurns:` in their frontmatter; the default is
 * deliberately tight. Was 60, which was an accident rather than a decision.
 *
 * Then 8, which was right while the session also had to write its own notes
 * and is one turn short now that it does not: of the repo jobs measured after
 * the close-out moved out, the substantial one used 7 of 8. A wasted turn
 * costs about 7c. A run that hits the cap costs a `partial`, and a partial
 * never counts toward the successes a tool is promoted on — so the cap
 * stalling is not a slower loop, it is a loop that never reaches its last
 * stage. Cheap to be generous, expensive to be tight.
 */
const DEFAULT_MAX_TURNS = 10;
const TURN_CEILING = 40;
/**
 * What a job runs on when the crew has a recipe for it. Was 1, which sounds
 * like the ideal saving and cannot work: a single turn ends before the model
 * sees any tool result, so anything that must read before it writes — every
 * repo job — is impossible. Measured, it failed on max_turns having produced
 * no files at all, and cost more than the full session it replaced, since it
 * paid for the system prompt with no cache to read from.
 *
 * A recipe means explore less, not work blind.
 *
 * Then 3, and every one of the thirteen recipe runs on record ran out — not
 * occasionally, all of them. That is worse than it sounds, because `successes`
 * only counts runs that finish and a tool is promoted on three of them: a
 * recipe on a leash it always breaks can be used forever and never become
 * compilable, which makes the fourth tier unreachable by the ordinary path.
 * At 5 it still explores less than a cold run — those finished at 4 and 7
 * turns with no method handed to them — and it can now actually land.
 */
export const RECIPE_TURNS = 5;
/**
 * What compiling a recipe into a tool runs on, which is not what an ordinary
 * job runs on. A compile has to write two programs that agree with each other
 * — `run.mjs` and the `verify.mjs` that refuses its output — and the halves
 * disagreeing is precisely what running out of turns produces. Attempt one
 * failed exactly there: it listed a multi-line `export async function`
 * correctly and its own checker rejected it, one line in 124.
 *
 * The number is 10 — the same as the default, and stated rather than inherited
 * so that a role raising its own `maxTurns:` does not silently change what a
 * compile gets. The compile's needs are the compile's.
 *
 * It was briefly 15, on the reasoning that all three compiles on record had
 * run out of turns. Measured, that was the wrong inference. Attempt 3 at 15
 * ran out *as well* (16 reported of 15) and cost $1.32, against attempt 2's
 * $0.94 at a cap of 10 — 40% more money for the same outcome, and comparing
 * the two generated `verify.mjs` files afterwards, attempt 2's was if anything
 * the more thorough. What actually fixed the compile was telling it how the
 * previous one failed, not lengthening the leash.
 *
 * The real error was reading "ran out of turns" as "needed more turns".
 * Running out is a compile's *ordinary* ending, exactly as it is the
 * close-out's: it writes both programs and dies reporting that it did. The
 * status now says so, so the next person reads delivery off the label instead
 * of inferring a shortage from it.
 */
export const COMPILE_TURNS = 10;
/**
 * The write-up runs on its own, after the work, on the cheapest model going.
 *
 * It used to be part of the session, which meant it competed with the work for
 * turns — so it lost, every time, and the crew learned nothing from the tier
 * built to be cheap. Off the session it needs no repository, no exploring and
 * one turn: it is handed what the run left behind and asked to describe it.
 */
const CLOSEOUT_MODEL = 'claude-haiku-4-5-20251001';
/**
 * Two, not one, and measured rather than assumed. At one turn the pass read
 * the file it had just been told about and died on max_turns having written
 * nothing — the same orientation turn that repo runs used to waste, and the
 * same reason a one-shot cannot work at a single turn: a turn ends before the
 * model sees any tool result. The prompt now tells it not to go looking, and
 * the second turn is there for when it does anyway.
 */
const CLOSEOUT_TURNS = 2;
export const RUNNER = fileURLToPath(new URL('./agent-runner.mjs', import.meta.url));

/**
 * When the server itself runs inside a Claude Code terminal, inherited session
 * vars (an ANTHROPIC_BASE_URL proxy, CLAUDE_CODE_*) would point a spawned
 * runner's CLI at the host session's endpoint and break auth. Launder them so
 * the child authenticates like a fresh terminal would.
 */
export function launderedEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        key === 'CLAUDE_CODE_OAUTH_TOKEN' || // long-lived token from `claude setup-token`
        (!key.startsWith('CLAUDE') &&
          key !== 'ANTHROPIC_BASE_URL' &&
          key !== 'ANTHROPIC_AUTH_TOKEN'),
    ),
  );
}

/** Role tool names (lowercase, role files) → Agent SDK tool names. */
const TOOL_MAP: Record<string, string[]> = {
  read: ['Read'],
  write: ['Write'],
  edit: ['Edit'],
  bash: ['Bash'],
  grep: ['Grep', 'Glob'],
  glob: ['Glob'],
  web_fetch: ['WebFetch'],
  web_search: ['WebSearch'],
};

const DEFAULT_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'];

/**
 * SDK tools that leave the sandbox, and the connection that authorises them.
 *
 * The registry is meant to be the only door outside. It was not: `allowedTools`
 * is built from the role alone, so a role naming `web_fetch` got the SDK's own
 * `WebFetch` whatever the user had switched off in Settings — the app's own
 * fetch tool and the pre-fetch of typed URLs were gated, and this second door
 * was not. Anything added to this map is a tool that must be asked for.
 */
const OUTSIDE_TOOLS: Record<string, string> = {
  WebFetch: 'web',
  WebSearch: 'web',
};

/**
 * Drops the tools whose connection this job was not granted.
 *
 * Applied after the role's list and after the default, because the question is
 * not what the role would like — it is what the user has allowed. A role left
 * with nothing but outside tools correctly ends up with none: it cannot reach
 * anything, which is the answer, not a fault.
 */
export function gateOutside(tools: string[], grantedNames: string[]): string[] {
  return tools.filter((tool) => {
    const needs = OUTSIDE_TOOLS[tool];
    return needs === undefined || grantedNames.includes(needs);
  });
}

/**
 * The document libraries, and how to call them.
 *
 * A sandbox sits inside the project, so Node walks up and resolves the root's
 * `node_modules` — nothing is installed per job and nothing is fetched. But a
 * library nobody is told about is not a capability: watched live, an agentling
 * asked for a PDF hand-assembled the bytes over several turns because it had
 * no idea `pdf-lib` was there. It worked, which is the part that makes it
 * expensive rather than obviously wrong.
 *
 * The call shapes are here because guessing them costs a turn. `pdf-parse` in
 * particular reads like its old function form and is now a class, so an agent
 * that reaches for the obvious `pdfParse(buffer)` fails and retries.
 */
const DOCUMENT_LIBRARIES = [
  '## Document libraries (already installed — never npm install)',
  'Import them directly; they resolve from the project root.',
  '- .docx write: `const {Document,Packer,Paragraph}=await import("docx")` → `writeFileSync(f, await Packer.toBuffer(doc))`',
  '- .docx read: `(await import("mammoth")).default.extractRawText({path})` → `.value`',
  '- .xlsx read/write/edit: `new (await import("exceljs")).default.Workbook()`, `await wb.xlsx.writeFile(f)` / `readFile(f)`',
  '- .pptx write: `new (await import("pptxgenjs")).default()`, `await pres.writeFile({fileName})`',
  '- .pdf write/edit: `const {PDFDocument,StandardFonts}=await import("pdf-lib")`; `PDFDocument.load(bytes)` opens an existing one',
  '- .pdf text: `const {PDFParse}=await import("pdf-parse")`; `await new PDFParse({data}).getText()` → `.text`',
  'Use these rather than assembling a file format by hand.',
].join('\n');

/**
 * A session that failed after spending money, and possibly after doing the
 * work. Carries what the run produced so the caller can still bank the cost,
 * the lesson and the diff — a job that dies on its last turn should not throw
 * away everything the turns before it earned.
 */
/**
 * What a run killed on purpose fails with. Shared rather than written out at
 * each end: a thrower saying one word and a reader watching for another is a
 * check that silently never fires.
 */
export const CANCELLED = 'cancelled';

export class SessionFailure extends Error {
  constructor(
    message: string,
    readonly meter: JobMeter = {},
    readonly lesson?: string,
    readonly approach?: string,
  ) {
    super(message);
    this.name = 'SessionFailure';
  }
}

/** A role's own turn budget, clamped so a typo can't uncap the loop. */
export function turnsFor(role: { maxTurns?: number } | undefined): number {
  const wanted = role?.maxTurns;
  if (typeof wanted !== 'number' || !Number.isFinite(wanted) || wanted < 1) {
    return DEFAULT_MAX_TURNS;
  }
  return Math.min(Math.floor(wanted), TURN_CEILING);
}

/**
 * The most turns this run may take before the quote is applied: a recipe
 * buys a short leash, a job that states its own need gets that, and anything
 * else gets the role's own budget.
 *
 * A job's own cap wins over the role's because the work, not the worker,
 * is what makes a compile long — it is handed to whichever role owns the
 * recipe, and none of them should have to raise their everyday budget to
 * accommodate it. The leash still wins over both: a job the crew has a recipe
 * for is one it has done before, whatever it claims to need.
 */
export function turnCapFor(
  role: { maxTurns?: number } | undefined,
  hint?: { oneShot?: boolean },
  jobTurns?: number,
): number {
  if (hint?.oneShot) return RECIPE_TURNS;
  if (typeof jobTurns === 'number' && Number.isFinite(jobTurns) && jobTurns >= 1) {
    return Math.min(Math.floor(jobTurns), TURN_CEILING);
  }
  return turnsFor(role);
}

/**
 * A money ceiling the SDK can actually enforce.
 *
 * The session stream carries no running cost — measured, not assumed: the
 * only total_cost_usd in a 35-message session arrives on the final message,
 * and per-message usage is partial (52 output tokens reported against a true
 * 568). So a mid-flight dollar check cannot stop an overspend, it can only
 * notice one after the money is gone.
 *
 * Turns are the lever that exists *before* the spending, so the ceiling is
 * converted into turns at what a turn of this work has really cost. It only
 * ever tightens: a generous ceiling must not let a job run longer than its
 * role allows, and with no history the role's budget simply stands.
 */
export function turnsForBudget(
  ceilingUsd: number | undefined,
  perTurn: { samples: number; usd: number },
  roleTurns: number,
): number {
  if (!ceilingUsd || ceilingUsd <= 0 || perTurn.samples === 0 || perTurn.usd <= 0) {
    return roleTurns;
  }
  // At least one turn: a budget too small for a single turn should fail on
  // its own terms, not be silently turned into a session that cannot think.
  return Math.max(1, Math.min(roleTurns, Math.floor(ceilingUsd / perTurn.usd)));
}

export function mapTools(roleTools: string[]): string[] {
  const mapped = roleTools.flatMap(
    (t) => TOOL_MAP[t.toLowerCase()] ?? [t.charAt(0).toUpperCase() + t.slice(1)],
  );
  return [...new Set(mapped)];
}

/**
 * What is in the clone, so the first turn is not spent finding out.
 *
 * Watched live, every repo run opened with `ls` or `Get-ChildItem` before it
 * could do anything — on a short leash that orientation turn was the
 * difference between landing the edit and running out. A directory listing
 * costs nothing here and buys back a turn there.
 */
export function repoListing(root: string, limit = 40): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    if (out.length >= limit) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${rel}/`);
      else out.push(rel);
    }
  };
  walk(root, '');
  return out.sort();
}

/**
 * What the session is actually asked to do.
 *
 * Answers the user gave up front ride here rather than in `job.prompt`,
 * because a recipe is keyed on the prompt: folding them in would give a
 * clarified job a different key from the same job asked plainly, and the crew
 * would stop recognising work it had already done.
 */
/**
 * Marks a failed run's spend unknown when nothing measured it.
 *
 * The SDK reports cost on a result message, so any death before that one
 * arrives leaves real money with no number against it. Recording that as zero
 * is worse than recording nothing: the ledger reads as though the run were
 * free, and the runs that die this way are the *expensive* ones — a session
 * killed by the ten-minute timeout is by definition the longest there is.
 *
 * Measured on job a7b277d3: ten full minutes filed as `costUsd: 0`. The cancel
 * path had always done this correctly; the timeout path rejected with a plain
 * Error and skipped it. Applied here, where every failure meter is assembled,
 * rather than in the branch that happened to be noticed — a spawn failure or
 * anything else that dies early has exactly the same hole.
 *
 * `closeOutUsd` alone is not a cost: the write-up runs after the session and
 * knowing what it spent says nothing about what the session did.
 */
export function withCostKnown(meter: JobMeter): JobMeter {
  if (meter.costUsd !== undefined) return meter;
  return { ...meter, costUnknown: true };
}

/**
 * True when the title says something the prompt does not.
 *
 * `titleFrom` shortens a long prompt and marks the cut with an ellipsis, which
 * is right for a card and wrong for a prompt: a model handed
 * "Job: look up Buydepa and summarise…" above that same sentence reads the
 * ellipsis as a truncated message and asks the user to say it again. Measured
 * on job ca5db1b4 — one turn, 1.4c, no work done, and a question the UI had no
 * way to answer. A title earns its line only when someone wrote it separately
 * from the prompt, as the `/jobs` route allows.
 */
/**
 * Start a follow-up where the run it answers stopped.
 *
 * A reply is a new job — a session is a one-shot child process and pausing one
 * mid-run was refused for good reasons (D-030) — so the continuity has to be
 * put back by hand: the earlier patch is applied to the fresh clone and
 * anything that run produced is copied across. Without this, answering a
 * question would re-do and re-bill work already paid for.
 *
 * Its own paperwork is deliberately left behind. The new run writes its own
 * RESULT.md, and inheriting the old one would make "did this deliver" true
 * before the session had done anything.
 */
export async function carryForward(
  previousId: string,
  sandboxDir: string,
  hasRepo: boolean,
  onProgress?: (detail: string) => void,
): Promise<void> {
  const previous = path.join(path.dirname(sandboxDir), previousId);
  if (!existsSync(previous)) return;
  const patch = patchFile(previous);
  if (hasRepo && existsSync(patch)) {
    onProgress?.('carrying forward the earlier changes');
    await applyPatch(repoDir(sandboxDir), patch);
  }
  for (const name of outputNames(previous)) {
    if (PAPERWORK_FORWARD.has(name)) continue;
    cpSync(path.join(previous, name), path.join(sandboxDir, name));
  }
}

const PAPERWORK_FORWARD = new Set(['RESULT.md', 'DIFF.patch', 'LESSON.md', 'APPROACH.md']);

export function titleAddsSomething(job: Job): boolean {
  const title = job.title.replace(/…+$/, '').trim();
  if (!title) return false;
  return !job.prompt.trim().toLowerCase().startsWith(title.toLowerCase());
}

export function sessionPrompt(job: Job): string {
  const base = titleAddsSomething(job) ? `Job: ${job.title}\n\n${job.prompt}` : job.prompt;
  if (!job.clarifications?.length) return base;
  return `${base}\n\nThe user has already settled these:\n${job.clarifications
    .map((line) => `- ${line}`)
    .join('\n')}`;
}

export function buildAppend(
  role: LoadedRole | undefined,
  lessons: string[],
  knowledge: string[],
  hasRepo: boolean,
  sources: string[] = [],
  approach?: string,
  repoFiles: string[] = [],
  attachments: JobAttachment[] = [],
): string {
  const parts: string[] = [];
  parts.push(role?.prompt ?? 'You are a general-purpose worker agentling.');
  parts.push(
    [
      '## Job rules',
      '- Work only inside the sandbox (your working directory). Never read or write paths outside it.',
      hasRepo
        ? '- The target repository is cloned at ./repo — make all code changes there.'
        : '- There is no target repository; produce your output as files in the working directory.',
      '- When finished, write RESULT.md in the working directory: outcome first, evidence second.',
      // Nothing here asks for LESSON.md or APPROACH.md any more. They used to
      // compete with the work for turns, so they were cut first and the crew
      // learned nothing: 13 of 13 recipe runs died before writing either.
      // A separate close-out pass writes them afterwards, off a cheap model,
      // from what the run actually left behind rather than what it predicted.
    ].join('\n'),
  );
  if (attachments.length > 0) {
    parts.push(
      [
        '## Files the user attached',
        'They are already in ./input — read them from there, and do not go looking elsewhere.',
        ...attachments.map((a) => `- input/${a.name} (${Math.max(1, Math.round(a.bytes / 1024))} KB)`),
        'Use the document libraries below to read them rather than opening them as plain text.',
      ].join('\n'),
    );
  }
  parts.push(DOCUMENT_LIBRARIES);
  if (repoFiles.length > 0) {
    parts.push(
      [
        `## What is in ./repo (${repoFiles.length} file${repoFiles.length === 1 ? '' : 's'})`,
        ...repoFiles.map((f) => `- repo/${f}`),
        'This is the whole listing. Open what you need; do not list the directory.',
      ].join('\n'),
    );
  }
  if (approach) {
    parts.push(
      [
        '## How this kind of job was done before',
        approach,
        'Follow this directly. Do not re-explore unless it turns out to be wrong.',
      ].join('\n'),
    );
  }
  if (sources.length > 0) {
    parts.push(
      [
        '## Pages already fetched for you',
        'These were read before this session started and trimmed to the important text.',
        'Read them from disk; do not fetch them again.',
        ...sources.map((s) => `- ${s}`),
      ].join('\n'),
    );
  }
  if (knowledge.length > 0) {
    parts.push(
      // "knows", not "has learned": since D-047 these lines are the crew's own
      // notes *and* your indexed material, and a store passage was not learned
      // by anybody here. Each one names its own source, so the session can tell
      // them apart without the heading pretending they are the same thing.
      `## What this level knows\n${knowledge.map((k) => `- ${k}`).join('\n')}`,
    );
  }
  if (lessons.length > 0) {
    parts.push(`## Lessons from your own past jobs\n${lessons.map((l) => `- ${l}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * What the run left behind, small enough to hand to a one-turn model: its own
 * write-up and the names of the files it changed. Never the diff itself — the
 * point is a write-up that costs about a cent, and a patch is what makes a
 * turn expensive. Null when the run left nothing worth describing.
 */
export function closeOutEvidence(sandboxDir: string): string | null {
  const parts: string[] = [];

  const resultPath = path.join(sandboxDir, 'RESULT.md');
  if (existsSync(resultPath)) {
    const text = readFileSync(resultPath, 'utf8').trim();
    if (text) parts.push(`What the run reported:\n${text.slice(0, 1500)}`);
  }

  const patchPath = path.join(sandboxDir, 'DIFF.patch');
  if (existsSync(patchPath)) {
    const patch = readFileSync(patchPath, 'utf8');
    const files = [...patch.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1]);
    if (files.length > 0) {
      parts.push(`Files it changed:\n${files.map((f) => `- ${f}`).join('\n')}`);
    }
  }

  // What it made, for work that changes no repository. Without this the crew
  // learned nothing from a job with no clone: evidence was a write-up or a
  // diff, and a run that spends its last turn producing the deliverable has
  // neither. Measured on job 2ff16bf2 — a valid PDF written from scratch, no
  // lesson, no recipe, nothing banked. Names only, never contents: the brief
  // is to describe the method, and a file's contents are the answer.
  const produced = outputNames(sandboxDir).filter(
    (name) => name !== 'RESULT.md' && name !== 'DIFF.patch',
  );
  if (produced.length > 0) {
    parts.push(`Files it produced:\n${produced.map((f) => `- ${f}`).join('\n')}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

/** First "- " line of LESSON.md, if the agent wrote one. */
export function parseLesson(text: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && trimmed.length > 2) return trimmed.slice(2).trim();
  }
  const fallback = text.trim().split(/\r?\n/)[0]?.trim();
  return fallback || undefined;
}

/** Short human line for a tool_use block, e.g. "Bash npm test". */
export function toolLine(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const detail = [i.file_path, i.command, i.pattern, i.url, i.query, i.path].find(
    (v) => typeof v === 'string' && v.length > 0,
  ) as string | undefined;
  const text = detail ? `${name} ${detail}` : name;
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function firstLine(text: string): string {
  const line = text.trim().split(/\r?\n/)[0] ?? '';
  return line.length > 200 ? `${line.slice(0, 197)}…` : line;
}

interface RunnerMessage {
  type: 'progress' | 'result' | 'error';
  name?: string;
  input?: unknown;
  summary?: string;
  message?: string;
  meter?: unknown;
}

/**
 * M1: the real executor. Each job runs one Claude Agent SDK session in a
 * child process (see agent-runner.mjs), shaped by the agentling's role
 * (system prompt, tool allowlist, model, mounted skills) and its memory.
 */
export class ClaudeAgentExecutor implements Executor {
  constructor(
    private registry: RoleRegistry,
    private memory: MemoryStore,
    private skillsDir: string,
    /** Returns the level's shared knowledge lines for this session. */
    private knowledge: () => string[] = () => [],
    /** The connection registry, read fresh so edits don't need a restart. */
    private connections: () => Connection[] = () => [],
    /** History, for turning a money ceiling into a turn budget. */
    private ledger: () => LedgerEntry[] = () => [],
  ) {}

  /** Live sessions by job id, so one can be stopped on request. */
  private running = new Map<string, ChildProcess>();
  /** Jobs killed deliberately, so the death can be reported as intent. */
  private cancelled = new Set<string>();

  async run(
    job: Job,
    sandboxDir: string,
    onProgress?: (detail: string) => void,
    agentling?: Agentling,
    hint?: RunHint,
  ): Promise<ExecutorResult> {
    const role = agentling ? this.registry.get(agentling.role) : undefined;
    const lessons = agentling ? this.memory.lessons(agentling.name).slice(-5) : [];

    let hasRepo = false;
    if (job.repoPath) {
      onProgress?.(`cloning ${job.repoPath}`);
      await cloneRepo(job.repoPath, sandboxDir);
      hasRepo = true;
    }
    if (job.continues) await carryForward(job.continues, sandboxDir, hasRepo, onProgress);

    const { granted, refused } = resolveForJob(job.tools, this.connections(), process.env);
    for (const { name, reason } of refused) onProgress?.(`connection "${name}" unavailable: ${reason}`);
    const web = granted.find((c) => c.name === 'web');
    const codeHost = granted.find((c) => c.name === 'github');

    // Lever 1 and 5 together: addresses the user wrote are fetched here, by
    // plain code, at no token cost — and land as trimmed text the session
    // reads normally. Far cheaper than the agent deciding to go and look.
    const sources: string[] = [];
    if (web) {
      for (const url of extractUrls(job.prompt)) {
        onProgress?.(`reading ${url}`);
        const page = await fetchPage(url, { allow: web.allow, maxChars: web.maxChars });
        const file = path.join(sandboxDir, 'sources', `${sources.length + 1}.md`);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(
          file,
          page.error
            ? `# ${url}\n\nCould not read this: ${page.error}\n`
            : `# ${page.title ?? url}\n\nSource: ${url}\n\n${page.text}\n`,
        );
        sources.push(path.relative(sandboxDir, file));
      }
    }

    const skills = (role?.skills ?? []).filter((s) =>
      existsSync(path.join(this.skillsDir, s, 'SKILL.md')),
    );
    for (const skill of skills) {
      cpSync(path.join(this.skillsDir, skill), path.join(sandboxDir, '.claude', 'skills', skill), {
        recursive: true,
      });
    }

    const mapped = mapTools(role?.tools ?? []);
    const allowedTools = gateOutside(
      mapped.length > 0 ? mapped : [...DEFAULT_TOOLS],
      granted.map((c) => c.name),
    );
    if (skills.length > 0) allowedTools.push('Skill');
    // Said out loud: a scout with no way to reach a page will otherwise spend
    // turns discovering that, and its report should say why rather than guess.
    if (mapped.includes('WebFetch') && !allowedTools.includes('WebFetch')) {
      onProgress?.('web access is off in settings — working from what is here');
    }

    // A job the crew has done before gets a short leash rather than the full
    // budget; either way the quote can tighten it further, since turns are
    // the only budget that binds before the money is spent.
    const turnBudget = turnsForBudget(
      job.quotedUsd,
      // Priced on the role about to run it, which is the role whose prompt,
      // tools and turn cap decide what a turn costs — not the one the matcher
      // named, who may not be on the crew at all. And on the tier it will run
      // as, since a leashed turn costs appreciably less than a session's; this
      // has to match what the quote assumed or the two disagree about how many
      // turns the same money buys.
      rateFor(
        this.ledger(),
        agentling?.role ?? job.preferredRole ?? '',
        hint?.oneShot ? 'oneshot' : 'session',
        hasRepo,
      ),
      turnCapFor(role, hint, job.maxTurns),
    );

    const configPath = path.join(sandboxDir, '.session.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        cwd: sandboxDir,
        prompt: sessionPrompt(job),
        append: buildAppend(
          role,
          lessons,
          // What this level knows *about this job*, not what it did most
          // recently. Same selection the recall tier uses.
          relevantLines(this.knowledge(), job.prompt, 8),
          hasRepo,
          sources,
          hint?.approach,
          hasRepo ? repoListing(path.join(sandboxDir, 'repo')) : [],
          job.attachments ?? [],
        ),
        allowedTools,
        // Named here rather than assembled in the runner, so what a connection
        // may do is decided from the catalog in one place.
        mcpTools: mcpToolNames(granted),
        maxTurns: turnBudget,
        skills,
        model: role?.model ?? process.env.AGENTLINGS_MODEL,
        mcpServers: toMcpServers(granted, process.env),
        ...(web
          ? { web: { endpoint: `http://127.0.0.1:${SERVER_PORT}/internal/fetch` } }
          : {}),
        // Builtin like `web`, and for the same reason: the server owns the
        // call so it owns the size of the reply. Only the tools the catalog
        // actually granted are described to the session — every visible tool
        // is definition overhead in each of its requests.
        ...(codeHost
          ? {
              github: {
                endpoint: `http://127.0.0.1:${SERVER_PORT}/internal/github`,
                tools: GITHUB_TOOLS.filter((t) => (codeHost.tools ?? []).includes(t.name)),
              },
            }
          : {}),
        sources,
      }),
    );

    let summary: string;
    let meter: JobMeter;
    try {
      ({ summary, meter } = await this.runSession(configPath, job.id, onProgress));
    } catch (err) {
      // The session died, but the turns before it may have finished the work.
      // Harvest first, then rethrow carrying everything the run did earn.
      const salvage = await this.harvestAndCloseOut(sandboxDir, hasRepo, job, onProgress);
      // The same shape the success path records. A failed run that is still
      // filed as a full session pollutes the very history the quote reads.
      const failedMeter: JobMeter = {
        turnsAllowed: turnBudget,
        model: role?.model ?? process.env.AGENTLINGS_MODEL,
        ...(hint?.oneShot ? { oneShot: true } : {}),
        ...(hint?.oneShot && hint.recipeKey ? { recipeKey: hint.recipeKey } : {}),
        ...(salvage.closeOutUsd ? { closeOutUsd: salvage.closeOutUsd } : {}),
      };
      const spent = err instanceof SessionFailure ? { ...err.meter, ...failedMeter } : failedMeter;
      throw new SessionFailure(
        err instanceof Error ? err.message : String(err),
        withCostKnown(spent),
        salvage.lesson,
        salvage.approach,
      );
    }

    const { lesson, approach, closeOutUsd } = await this.harvestAndCloseOut(
      sandboxDir,
      hasRepo,
      job,
      onProgress,
    );

    return {
      summary,
      lesson,
      approach,
      meter: {
        ...meter,
        // The write-up is spending too. Recording it separately keeps the
        // per-turn rate honest — it prices the session, not the session plus
        // an errand — while the total still counts every cent.
        ...(closeOutUsd
          ? { costUsd: (meter.costUsd ?? 0) + closeOutUsd, closeOutUsd }
          : {}),
        turnsAllowed: turnBudget,
        model: role?.model ?? process.env.AGENTLINGS_MODEL,
        ...(hint?.oneShot ? { oneShot: true } : {}),
        ...(hint?.oneShot && hint.recipeKey ? { recipeKey: hint.recipeKey } : {}),
      },
    };
  }

  /**
   * Everything the run earned, plus the write-up it did not have turns for.
   * The close-out only runs when the first harvest came back missing one, so a
   * session that did write its own notes costs nothing extra.
   */
  private async harvestAndCloseOut(
    sandboxDir: string,
    hasRepo: boolean,
    job: Job,
    onProgress?: (detail: string) => void,
  ): Promise<{ lesson?: string; approach?: string; closeOutUsd?: number }> {
    const first = await this.harvest(sandboxDir, hasRepo, onProgress);
    if (first.lesson && first.approach) return first;

    const meter = await this.closeOut(sandboxDir, job, job.id, onProgress);
    if (!meter) return first;

    const after = await this.harvest(sandboxDir, hasRepo);
    return {
      lesson: after.lesson ?? first.lesson,
      approach: after.approach ?? first.approach,
      ...(meter.costUsd ? { closeOutUsd: meter.costUsd } : {}),
    };
  }

  /**
   * Everything a run leaves on disk: the diff against the clone, the lesson
   * and the approach. Runs however the session ended, so a failure is still
   * reviewable and still teaches the crew something.
   */
  private async harvest(
    sandboxDir: string,
    hasRepo: boolean,
    onProgress?: (detail: string) => void,
  ): Promise<{ lesson?: string; approach?: string }> {
    if (hasRepo) {
      const changed = await writeDiff(sandboxDir);
      onProgress?.(changed ? 'DIFF.patch written for review' : 'no repository changes');
    }

    const lessonPath = path.join(sandboxDir, 'LESSON.md');
    const lesson = existsSync(lessonPath)
      ? parseLesson(readFileSync(lessonPath, 'utf8'))
      : undefined;

    const approachPath = path.join(sandboxDir, 'APPROACH.md');
    const approach = existsSync(approachPath)
      ? readFileSync(approachPath, 'utf8').trim().slice(0, 1200) || undefined
      : undefined;

    return { lesson, approach };
  }

  /**
   * Asks a cheap model to write down what the run did, from what it left on
   * disk. Runs after every job that produced anything at all — including the
   * ones that died, which are most of them on a short leash.
   *
   * Its own failure is never the job's: a missing write-up costs the crew a
   * lesson, and throwing here would cost the user their work.
   */
  private async closeOut(
    sandboxDir: string,
    job: Job,
    jobId: string,
    onProgress?: (detail: string) => void,
  ): Promise<JobMeter | undefined> {
    const evidence = closeOutEvidence(sandboxDir);
    if (!evidence) return undefined;

    const configPath = path.join(sandboxDir, '.closeout.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        cwd: sandboxDir,
        prompt: `A job has just finished. Write down what it teaches.\n\nThe job was: ${job.prompt}\n\n${evidence}`,
        append: [
          'You are writing the crew notes for a job that has already run. Do not do the job.',
          // Measured: without this it opened the file it had just been told
          // about and ran out of turns having written nothing.
          'Do not read, open or search any files. Everything you need is in this message.',
          'Write exactly two files in the working directory, then stop:',
          '- LESSON.md: one line starting with "- ", holding one thing a future agentling should remember about this KIND of job.',
          '- APPROACH.md: a few lines telling whoever does this KIND of job next how to do it directly, without exploring. Describe the method, never the answer.',
          'If the run failed, say what to do differently — a run that died still teaches something.',
        ].join('\n'),
        allowedTools: ['Write'],
        maxTurns: CLOSEOUT_TURNS,
        model: process.env.AGENTLINGS_CLOSEOUT_MODEL || CLOSEOUT_MODEL,
      }),
    );

    try {
      const { meter } = await this.runSession(configPath, jobId, undefined);
      onProgress?.('wrote up what this job teaches');
      return meter;
    } catch (err) {
      // It writes two files and then has to say so, which is a third turn it
      // does not have — so running out is its *ordinary* ending, with both
      // files already on disk. Measured: a run whose notes were written and
      // then thrown away, because this returned nothing and the caller took
      // that as "no notes". The files are the work; the exit code is not.
      // Its cost is real either way and comes back on the failure.
      return err instanceof SessionFailure ? err.meter : {};
    }
  }

  /**
   * Kills the session running this job, if one is. The child is the whole
   * session — stopping it is what makes cancel mean anything, since an
   * abandoned session keeps thinking and keeps spending.
   */
  cancel(jobId: string): boolean {
    const child = this.running.get(jobId);
    if (!child) return false;
    this.cancelled.add(jobId);
    child.kill();
    return true;
  }

  private runSession(
    configPath: string,
    jobId: string,
    onProgress?: (detail: string) => void,
  ): Promise<{ summary: string; meter: JobMeter }> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [RUNNER, configPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: launderedEnv(),
      });
      this.running.set(jobId, child);
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`session timed out after ${SESSION_TIMEOUT_MS / 60_000} minutes`));
      }, SESSION_TIMEOUT_MS);

      let summary = '';
      let meter: JobMeter = {};
      let errorMsg = '';
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += String(chunk);
      });
      const lines = createInterface({ input: child.stdout });
      lines.on('line', (line) => {
        let msg: RunnerMessage;
        try {
          msg = JSON.parse(line) as RunnerMessage;
        } catch {
          return;
        }
        if (msg.type === 'progress' && msg.name) {
          onProgress?.(toolLine(msg.name, msg.input));
        } else if (msg.type === 'result') {
          summary = firstLine(String(msg.summary ?? ''));
          if (msg.meter && typeof msg.meter === 'object') meter = msg.meter as JobMeter;
        } else if (msg.type === 'error') {
          errorMsg = firstLine(String(msg.message ?? 'agent session failed'));
          if (msg.meter && typeof msg.meter === 'object') meter = msg.meter as JobMeter;
        }
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        this.running.delete(jobId);
        this.cancelled.delete(jobId);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        this.running.delete(jobId);
        if (this.cancelled.delete(jobId)) {
          // Killed on purpose: say so, rather than reporting whatever the
          // dying process happened to leave on stderr. It spent money on the
          // way, and the SDK only reports cost on a result message that will
          // now never arrive — so the spend is marked unknown, not zero.
          return reject(
            new SessionFailure(CANCELLED, {
              ...meter,
              ...(meter.costUsd === undefined ? { costUnknown: true } : {}),
            }),
          );
        }
        if (errorMsg) return reject(new SessionFailure(errorMsg, meter));
        if (code !== 0) {
          return reject(
            new SessionFailure(firstLine(stderr) || `agent runner exited with code ${code}`, meter),
          );
        }
        resolve({ summary: summary || 'Session ended without a final result.', meter });
      });
    });
  }
}
