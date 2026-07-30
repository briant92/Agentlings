import { spawn } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { Agentling, Job } from '@agentlings/shared';
import { cloneRepo, writeDiff } from '../gitwork';
import type { MemoryStore } from '../memory';
import type { LoadedRole, RoleRegistry } from '../roles';
import type { Executor, ExecutorResult } from './executor';

const SESSION_TIMEOUT_MS = 10 * 60_000;
const MAX_TURNS = 60;
const RUNNER = fileURLToPath(new URL('./agent-runner.mjs', import.meta.url));

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

export function mapTools(roleTools: string[]): string[] {
  const mapped = roleTools.flatMap(
    (t) => TOOL_MAP[t.toLowerCase()] ?? [t.charAt(0).toUpperCase() + t.slice(1)],
  );
  return [...new Set(mapped)];
}

export function buildAppend(
  role: LoadedRole | undefined,
  lessons: string[],
  knowledge: string[],
  hasRepo: boolean,
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
      '- Also write LESSON.md: a single line starting with "- " holding one lesson your future self should remember about this kind of job.',
    ].join('\n'),
  );
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
  ) {}

  async run(
    job: Job,
    sandboxDir: string,
    onProgress?: (detail: string) => void,
    agentling?: Agentling,
  ): Promise<ExecutorResult> {
    const role = agentling ? this.registry.get(agentling.role) : undefined;
    const lessons = agentling ? this.memory.lessons(agentling.name).slice(-5) : [];

    let hasRepo = false;
    if (job.repoPath) {
      onProgress?.(`cloning ${job.repoPath}`);
      await cloneRepo(job.repoPath, sandboxDir);
      hasRepo = true;
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

    const configPath = path.join(sandboxDir, '.session.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        cwd: sandboxDir,
        prompt: `Job: ${job.title}\n\n${job.prompt}`,
        append: buildAppend(role, lessons, this.knowledge(), hasRepo),
        allowedTools,
        maxTurns: MAX_TURNS,
        skills,
        model: role?.model,
      }),
    );

    const summary = await this.runSession(configPath, onProgress);

    if (hasRepo) {
      const changed = await writeDiff(sandboxDir);
      onProgress?.(changed ? 'DIFF.patch written for review' : 'no repository changes');
    }

    const lessonPath = path.join(sandboxDir, 'LESSON.md');
    const lesson = existsSync(lessonPath)
      ? parseLesson(readFileSync(lessonPath, 'utf8'))
      : undefined;

    return { summary, lesson };
  }

  private runSession(configPath: string, onProgress?: (detail: string) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      // When the server itself runs inside a Claude Code terminal, inherited
      // session vars (ANTHROPIC_BASE_URL proxy, CLAUDE_CODE_*) would point the
      // runner's CLI at the host session's endpoint and break auth. Launder
      // them so the session authenticates like a fresh terminal would.
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            key === 'CLAUDE_CODE_OAUTH_TOKEN' || // long-lived token from `claude setup-token`
            (!key.startsWith('CLAUDE') &&
              key !== 'ANTHROPIC_BASE_URL' &&
              key !== 'ANTHROPIC_AUTH_TOKEN'),
        ),
      );
      const child = spawn(process.execPath, [RUNNER, configPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`session timed out after ${SESSION_TIMEOUT_MS / 60_000} minutes`));
      }, SESSION_TIMEOUT_MS);

      let summary = '';
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
        } else if (msg.type === 'error') {
          errorMsg = firstLine(String(msg.message ?? 'agent session failed'));
        }
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (errorMsg) return reject(new Error(errorMsg));
        if (code !== 0) {
          return reject(new Error(firstLine(stderr) || `agent runner exited with code ${code}`));
        }
        resolve(summary || 'Session ended without a final result.');
      });
    });
  }
}
