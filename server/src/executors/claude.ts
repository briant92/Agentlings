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
import type { Agentling, Job, JobMeter } from '@agentlings/shared';
import { SERVER_PORT } from '@agentlings/shared';
import { resolveForJob, toMcpServers, type Connection } from '../connections';
import { cloneRepo, writeDiff } from '../gitwork';
import { costPerTurn, type LedgerEntry } from '../ledger';
import type { MemoryStore } from '../memory';
import type { LoadedRole, RoleRegistry } from '../roles';
import { extractUrls, fetchPage } from '../web';
import type { Executor, ExecutorResult, RunHint } from './executor';

const SESSION_TIMEOUT_MS = 10 * 60_000;
/**
 * A runaway agent that keeps "investigating" is the classic cost failure
 * mode, and turns are the multiplier. Roles that genuinely need to explore
 * raise this themselves with `maxTurns:` in their frontmatter; the default is
 * deliberately tight. Was 60, which was an accident rather than a decision.
 */
const DEFAULT_MAX_TURNS = 8;
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
 */
const RECIPE_TURNS = 3;
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
 * A session that failed after spending money, and possibly after doing the
 * work. Carries what the run produced so the caller can still bank the cost,
 * the lesson and the diff — a job that dies on its last turn should not throw
 * away everything the turns before it earned.
 */
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
 * buys a short leash, anything else gets the role's own budget.
 */
export function turnCapFor(
  role: { maxTurns?: number } | undefined,
  hint?: { oneShot?: boolean },
): number {
  return hint?.oneShot ? RECIPE_TURNS : turnsFor(role);
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

export function buildAppend(
  role: LoadedRole | undefined,
  lessons: string[],
  knowledge: string[],
  hasRepo: boolean,
  sources: string[] = [],
  approach?: string,
  repoFiles: string[] = [],
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
      // A run that came from a recipe already has the method it would be
      // writing down, and its short leash is spent on the work rather than
      // on teaching the crew something it just told us.
      ...(approach
        ? []
        : [
            '- Also write LESSON.md: a single line starting with "- " holding one lesson your future self should remember about this kind of job.',
            '- Also write APPROACH.md: a few lines telling whoever does this KIND of job next how to do it directly, without exploring. Describe the method, never the answer.',
          ]),
    ].join('\n'),
  );
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
      `## What this level's crew has learned\n${knowledge.map((k) => `- ${k}`).join('\n')}`,
    );
  }
  if (lessons.length > 0) {
    parts.push(`## Lessons from your own past jobs\n${lessons.map((l) => `- ${l}`).join('\n')}`);
  }
  return parts.join('\n\n');
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

    const { granted, refused } = resolveForJob(job.tools, this.connections(), process.env);
    for (const { name, reason } of refused) onProgress?.(`connection "${name}" unavailable: ${reason}`);
    const web = granted.find((c) => c.name === 'web');

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
    const allowedTools = mapped.length > 0 ? mapped : [...DEFAULT_TOOLS];
    if (skills.length > 0) allowedTools.push('Skill');

    // A job the crew has done before gets a short leash rather than the full
    // budget; either way the quote can tighten it further, since turns are
    // the only budget that binds before the money is spent.
    const turnBudget = turnsForBudget(
      job.quotedUsd,
      // Priced on the role about to run it, which is the role whose prompt,
      // tools and turn cap decide what a turn costs — not the one the matcher
      // named, who may not be on the crew at all.
      costPerTurn(this.ledger(), agentling?.role ?? job.preferredRole ?? '', 'session', hasRepo),
      turnCapFor(role, hint),
    );

    const configPath = path.join(sandboxDir, '.session.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        cwd: sandboxDir,
        prompt: `Job: ${job.title}\n\n${job.prompt}`,
        append: buildAppend(
          role,
          lessons,
          this.knowledge(),
          hasRepo,
          sources,
          hint?.approach,
          hasRepo ? repoListing(path.join(sandboxDir, 'repo')) : [],
        ),
        allowedTools,
        maxTurns: turnBudget,
        skills,
        model: role?.model ?? process.env.AGENTLINGS_MODEL,
        mcpServers: toMcpServers(granted, process.env),
        ...(web
          ? { web: { endpoint: `http://127.0.0.1:${SERVER_PORT}/internal/fetch` } }
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
      const salvage = await this.harvest(sandboxDir, hasRepo, onProgress);
      // The same shape the success path records. A failed run that is still
      // filed as a full session pollutes the very history the quote reads.
      const failedMeter: JobMeter = {
        turnsAllowed: turnBudget,
        model: role?.model ?? process.env.AGENTLINGS_MODEL,
        ...(hint?.oneShot ? { oneShot: true } : {}),
      };
      if (err instanceof SessionFailure) {
        throw new SessionFailure(
          err.message,
          { ...err.meter, ...failedMeter },
          salvage.lesson,
          salvage.approach,
        );
      }
      throw new SessionFailure(
        err instanceof Error ? err.message : String(err),
        failedMeter,
        salvage.lesson,
        salvage.approach,
      );
    }

    const { lesson, approach } = await this.harvest(sandboxDir, hasRepo, onProgress);

    return {
      summary,
      lesson,
      approach,
      meter: {
        ...meter,
        turnsAllowed: turnBudget,
        model: role?.model ?? process.env.AGENTLINGS_MODEL,
        ...(hint?.oneShot ? { oneShot: true } : {}),
      },
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
            new SessionFailure('cancelled', {
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
