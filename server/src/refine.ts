import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { Refinement, RoleInfo, SkillInfo } from '@agentlings/shared';
import { launderedEnv, RUNNER } from './executors/claude';

/**
 * Tier 2 of the concept matcher: one short Claude call that refines what the
 * local matcher already decided. It is an upgrade, never a dependency — the
 * app has to answer with no auth, no network and no LLM, so every failure
 * here returns null and the local answer stands.
 *
 * Runs through the same child-process runner as a job session, so the Agent
 * SDK's import graph never enters the server process.
 */

/**
 * Generous on purpose: loading the SDK dominates, so a tight budget would
 * mean the tier never lands. Nothing waits on it — the local answer is
 * already on screen.
 */
const TIMEOUT_MS = 20_000;
const MODEL = 'claude-haiku-4-5-20251001';
const CACHE_MAX = 200;

/** Only names and one-liners go over: the prompt stays small and cheap. */
export function buildPrompt(text: string, roles: RoleInfo[], skills: SkillInfo[]): string {
  const list = (items: { name: string; description: string }[]) =>
    items.map((i) => `- ${i.name}: ${i.description}`).join('\n') || '- (none installed)';
  return [
    'Pick the best job and abilities for a new worker from the catalogue below.',
    '',
    'JOBS:',
    list(roles),
    '',
    'ABILITIES:',
    list(skills),
    '',
    `WHAT THE USER SAID: "${text}"`,
    '',
    'Reply with JSON only, no prose and no code fence:',
    '{"role": "<a job name from the list, or null if none fit>",',
    ' "skills": ["<ability names from the list>"],',
    ' "summary": "<one short sentence: what this worker will do>",',
    ' "confidence": <0 to 1>}',
    '',
    'Choose only from the lists. Never invent a name. If nothing fits, use null.',
  ].join('\n');
}

/** Pulls the JSON object out of a reply that may be fenced or padded with prose. */
function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Validates a reply against the catalogue actually installed. This is what
 * stops a confident-sounding model inventing a role that does not exist —
 * anything not in the catalogue is dropped rather than trusted.
 */
export function parseRefinement(
  raw: string,
  roles: RoleInfo[],
  skills: SkillInfo[],
): Refinement | null {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const roleNames = new Set(roles.map((r) => r.name));
  const skillNames = new Set(skills.map((s) => s.name));

  const rawRole = typeof obj.role === 'string' ? obj.role.trim().toLowerCase() : null;
  const role = rawRole && roleNames.has(rawRole) ? rawRole : null;
  // A named role that isn't installed means the reply is unusable, not that
  // the answer is "none" — say nothing rather than something wrong.
  if (rawRole && !role) return null;

  const chosen = Array.isArray(obj.skills) ? obj.skills : [];
  const validSkills = [
    ...new Set(
      chosen
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => skillNames.has(s)),
    ),
  ];

  const rawConfidence = typeof obj.confidence === 'number' ? obj.confidence : 0.5;
  const confidence = Math.max(0, Math.min(1, rawConfidence));
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : undefined;

  return { role, skills: validSkills, ...(summary ? { summary } : {}), confidence };
}

/** Cache key: the sentence, plus what was installed when it was answered. */
export function cacheKey(text: string, roles: RoleInfo[], skills: SkillInfo[]): string {
  const catalog = [...roles.map((r) => r.name), '|', ...skills.map((s) => s.name)].join(',');
  return `${text.trim().toLowerCase().replace(/\s+/g, ' ')}::${catalog}`;
}

const cache = new Map<string, Refinement | null>();

function remember(key: string, value: Refinement | null): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/** Runs the single-turn session and returns its raw reply, or null. */
function askClaude(prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'agentlings-match-'));
    const configPath = path.join(dir, 'config.json');
    const cleanup = () => rmSync(dir, { recursive: true, force: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        cwd: dir,
        prompt,
        append: 'Answer with a single JSON object and nothing else.',
        allowedTools: [], // classification only: it has nothing to do but answer
        maxTurns: 1,
        model: MODEL,
      }),
    );

    const child = spawn(process.execPath, [RUNNER, configPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: launderedEnv(),
    });
    let answer: string | null = null;
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, TIMEOUT_MS);

    child.stderr.resume(); // drained so the pipe can't fill and stall the child
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      try {
        const msg = JSON.parse(line) as { type?: string; summary?: unknown };
        if (msg.type === 'result') answer = String(msg.summary ?? '');
      } catch {
        // The runner only ever prints JSONL; anything else is noise.
      }
    });
    child.on('error', () => finish(null));
    child.on('close', () => finish(answer));
  });
}

/**
 * The refined answer, or null when the tier is unavailable, slow, or replied
 * with something that doesn't match the installed catalogue.
 */
export async function refineMatch(
  text: string,
  roles: RoleInfo[],
  skills: SkillInfo[],
): Promise<Refinement | null> {
  const key = cacheKey(text, roles, skills);
  if (cache.has(key)) return cache.get(key) ?? null;

  const raw = await askClaude(buildPrompt(text, roles, skills));
  const refined = raw === null ? null : parseRefinement(raw, roles, skills);
  // A failed call isn't cached: auth may be fixed a minute from now.
  if (raw !== null) remember(key, refined);
  return refined;
}

/** Test seam — the cache is process-wide. */
export function clearRefineCache(): void {
  cache.clear();
}
