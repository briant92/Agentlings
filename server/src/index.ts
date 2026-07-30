import { serve } from '@hono/node-server';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { WebSocket, WebSocketServer } from 'ws';
import type { AgentlingProfile, LevelInfo, ServerMessage, SettingsInfo } from '@agentlings/shared';
import { TICK_MS } from '@agentlings/shared';
import { EventLog } from './events';
import { ClaudeAgentExecutor } from './executors/claude';
import type { Executor } from './executors/executor';
import { SimulatedExecutor } from './executors/simulated';
import { applyPatch, patchFile } from './gitwork';
import {
  appendKnowledge,
  createLevelFiles,
  levelDir,
  listLevelDirs,
  migrateLegacy,
  newCrewSeed,
  readKnowledge,
  readMeta,
  readRoster,
  THEME_KEYS,
  writeMeta,
  writeRoster,
  type LevelMeta,
} from './levels';
import { MatchIndex, suggestSetup } from './match';
import { MemoryStore } from './memory';
import { JobQueue } from './queue';
import { installSkill, listSkills, RoleRegistry, toRawUrl } from './roles';
import { Sim } from './sim';
import { planWork } from './work';

const PORT = 4600;
const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // repo root
const SANDBOX_ROOT = path.join(ROOT, '.agentlings');
const ROLES_DIR = path.join(ROOT, 'roles');
const SKILLS_DIR = path.join(ROOT, 'skills');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // No .env yet — fine.
}

const registry = new RoleRegistry(ROLES_DIR);
registry.load();

/** Built once and reused; installing a template is the only thing that ages it. */
let matchIndex: MatchIndex | null = null;
function matcher(): MatchIndex {
  matchIndex ??= new MatchIndex(registry.loaded(), listSkills(SKILLS_DIR));
  return matchIndex;
}

/** API key, a Claude Code login, or an explicit AGENTLINGS_EXECUTOR override. */
const forced = process.env.AGENTLINGS_EXECUTOR;
const hasAuth =
  !!process.env.ANTHROPIC_API_KEY ||
  !!process.env.CLAUDE_CODE_OAUTH_TOKEN ||
  existsSync(path.join(os.homedir(), '.claude', '.credentials.json'));
const useClaude = forced ? forced === 'claude' : hasAuth;
const simulated = new SimulatedExecutor();
console.log(
  `[agentlings] executor: ${useClaude ? 'claude-agent-sdk' : 'simulated (set ANTHROPIC_API_KEY in .env or AGENTLINGS_EXECUTOR=claude)'}`,
);

interface LevelRuntime {
  meta: LevelMeta;
  dir: string;
  queue: JobQueue;
  sim: Sim;
  eventLog: EventLog;
  memory: MemoryStore;
}

const levels = new Map<string, LevelRuntime>();

function saveRoster(rt: LevelRuntime): void {
  writeRoster(
    rt.dir,
    rt.sim.agentlings.map(({ id, name, color, role, jobDescription }) => ({
      id,
      name,
      color,
      role,
      jobDescription,
    })),
  );
}

function makeLevel(dir: string): LevelRuntime {
  const meta = readMeta(dir);
  const queue = new JobQueue(dir);
  const memory = new MemoryStore(path.join(dir, 'memory'));
  const eventLog = new EventLog((event) =>
    sendToLevel(meta.id, { type: 'events', events: [event] }),
  );
  const executor: Executor = useClaude
    ? new ClaudeAgentExecutor(registry, memory, SKILLS_DIR, () => readKnowledge(dir))
    : simulated;
  const sim = new Sim(
    readRoster(dir),
    queue,
    executor,
    (event) => eventLog.emit(event),
    (agentling, jobTitle, outcome, detail, lesson) => {
      const date = new Date().toISOString().slice(0, 10);
      const line = lesson
        ? `${date} · ${lesson}`
        : outcome === 'done'
          ? `${date} · delivered "${jobTitle}" as ${agentling.role}`
          : `${date} · failed "${jobTitle}" as ${agentling.role} — ${detail}`;
      memory.append(agentling.name, line);
      appendKnowledge(
        dir,
        `${date} · ${agentling.name} (${agentling.role}) ${outcome === 'done' ? 'delivered' : 'failed'} "${jobTitle}"${lesson ? ` — ${lesson}` : ''}`,
      );
    },
  );
  const rt: LevelRuntime = { meta, dir, queue, sim, eventLog, memory };
  levels.set(meta.id, rt);
  return rt;
}

migrateLegacy(SANDBOX_ROOT);
for (const dir of listLevelDirs(SANDBOX_ROOT)) makeLevel(dir);
if (levels.size === 0) {
  const meta = createLevelFiles(SANDBOX_ROOT, {
    name: 'HQ',
    project: 'Agentlings dev',
    theme: 'cave',
  });
  makeLevel(levelDir(SANDBOX_ROOT, meta.id));
}

function levelInfo(rt: LevelRuntime): LevelInfo {
  const jobs = rt.queue.list();
  return {
    ...rt.meta,
    crew: rt.sim.agentlings.length,
    colors: rt.sim.agentlings.map((a) => a.color),
    jobsDone: rt.sim.agentlings.reduce((sum, a) => sum + a.jobsDone, 0),
    jobsRunning: jobs.filter((j) => j.status === 'queued' || j.status === 'running').length,
  };
}

const app = new Hono();

app.get('/api/settings', (c) =>
  c.json({ executor: useClaude ? 'claude-agent-sdk' : 'simulated' } satisfies SettingsInfo),
);

app.get('/api/levels', (c) =>
  c.json(
    [...levels.values()]
      .sort((a, b) => a.meta.createdAt - b.meta.createdAt)
      .map((rt) => levelInfo(rt)),
  ),
);

app.post('/api/levels', async (c) => {
  const body = await c.req.json<{ name?: string; project?: string; theme?: string }>();
  const theme = THEME_KEYS.find((t) => t === body.theme);
  if (!body.name?.trim() || !theme) {
    return c.json({ error: 'name and a valid theme are required' }, 400);
  }
  const meta = createLevelFiles(SANDBOX_ROOT, {
    name: body.name.trim(),
    project: body.project?.trim() || 'General',
    theme,
  });
  const rt = makeLevel(levelDir(SANDBOX_ROOT, meta.id));
  return c.json(levelInfo(rt), 201);
});

function getLevel(id: string): LevelRuntime | undefined {
  return levels.get(id);
}

app.get('/api/levels/:lid/state', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  return c.json(rt.sim.state());
});

app.post('/api/levels/:lid/jobs', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ title?: string; prompt?: string; repoPath?: string }>();
  if (!body.title?.trim() || !body.prompt?.trim()) {
    return c.json({ error: 'title and prompt are required' }, 400);
  }
  const job = rt.queue.add({
    title: body.title.trim(),
    prompt: body.prompt.trim(),
    repoPath: body.repoPath?.trim() || undefined,
  });
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title });
  return c.json(job, 201);
});

/** What the app would do with a sentence — shown before anything is queued. */
app.post('/api/levels/:lid/work/plan', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ text?: string }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);
  return c.json(
    planWork(matcher(), registry.list(), rt.sim.agentlings, rt.meta.repoPath, text),
  );
});

/**
 * One sentence in, a queued job out. The project folder is asked for once per
 * level and remembered; '' records that the user declined.
 */
app.post('/api/levels/:lid/work', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ text?: string; repoPath?: string }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);

  if (body.repoPath !== undefined) {
    const repoPath = body.repoPath.trim();
    if (repoPath && !existsSync(repoPath)) {
      return c.json({ error: `no folder at "${repoPath}"` }, 400);
    }
    rt.meta = { ...rt.meta, repoPath };
    writeMeta(rt.dir, rt.meta);
  }

  const plan = planWork(matcher(), registry.list(), rt.sim.agentlings, rt.meta.repoPath, text);
  const job = rt.queue.add({
    title: plan.title,
    prompt: text,
    repoPath: rt.meta.repoPath || undefined,
    preferredRole: plan.role ?? undefined,
  });
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title });
  return c.json(job, 201);
});

app.get('/api/levels/:lid/jobs/:id/output', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const job = rt.queue.get(c.req.param('id'));
  if (!job) return c.json({ error: 'unknown job' }, 404);
  const dir = rt.queue.sandboxDir(job.id);
  if (!existsSync(dir)) return c.json({ files: [] });
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => ({
      name: entry.name,
      content: readFileSync(path.join(dir, entry.name), 'utf8'),
    }));
  return c.json({ files });
});

app.post('/api/levels/:lid/jobs/:id/resolve', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ action?: string }>();
  if (body.action !== 'promote' && body.action !== 'discard') {
    return c.json({ error: 'action must be "promote" or "discard"' }, 400);
  }
  const pending = rt.queue.get(c.req.param('id'));
  if (!pending) return c.json({ error: 'unknown job' }, 404);
  // Promote replays the reviewed patch onto the real repository first;
  // the job is only marked promoted if the patch applies cleanly.
  if (body.action === 'promote' && pending.status === 'done' && pending.repoPath) {
    const patch = patchFile(rt.queue.sandboxDir(pending.id));
    if (existsSync(patch)) {
      try {
        await applyPatch(pending.repoPath, patch);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return c.json({ error: `patch did not apply: ${detail}` }, 400);
      }
    }
  }
  try {
    const job = rt.queue.resolve(pending.id, body.action);
    rt.eventLog.emit({
      type: 'resolved',
      jobId: job.id,
      title: job.title,
      detail: body.action === 'promote' ? 'promoted' : 'discarded',
    });
    return c.json(job);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.get('/api/levels/:lid/agentlings/:aid', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const agentling = rt.sim.agentlings.find((a) => a.id === c.req.param('aid'));
  if (!agentling) return c.json({ error: 'unknown agentling' }, 404);
  const loaded = registry.get(agentling.role);
  const profile: AgentlingProfile = {
    agentling,
    role: loaded
      ? {
          name: loaded.name,
          description: loaded.description,
          tools: loaded.tools,
          skills: loaded.skills,
          model: loaded.model,
        }
      : null,
    memory: rt.memory.lessons(agentling.name),
  };
  return c.json(profile);
});

app.post('/api/levels/:lid/agentlings/:aid/role', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const agentling = rt.sim.agentlings.find((a) => a.id === c.req.param('aid'));
  if (!agentling) return c.json({ error: 'unknown agentling' }, 404);
  const body = await c.req.json<{ role?: string; jobDescription?: string }>();
  const role = body.role ? registry.get(body.role) : undefined;
  if (!role) return c.json({ error: `unknown role "${body.role ?? ''}"` }, 400);
  agentling.role = role.name;
  // The hire's own words become their first memory, so the sentence that
  // created them is in front of every session they ever run.
  const job = body.jobDescription?.trim();
  if (job && job !== agentling.jobDescription) {
    agentling.jobDescription = job;
    rt.memory.append(agentling.name, `${new Date().toISOString().slice(0, 10)} · hired to: ${job}`);
  }
  saveRoster(rt);
  return c.json(agentling);
});

/**
 * Concept match: a sentence in, a proposed role and skills out. Local,
 * deterministic and instant — no auth, no network, no LLM.
 */
app.post('/api/match', async (c) => {
  const body = await c.req.json<{ text?: string }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);
  return c.json(suggestSetup(matcher(), registry.list(), text));
});

app.post('/api/levels/:lid/agentlings', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const seed = newCrewSeed(
    rt.sim.agentlings.map(({ id, name, color, role }) => ({ id, name, color, role })),
  );
  const agentling = rt.sim.addAgentling(seed);
  saveRoster(rt);
  return c.json(agentling, 201);
});

app.get('/api/roles', (c) => c.json(registry.list()));

app.get('/api/skills', (c) => c.json(listSkills(SKILLS_DIR)));

app.post('/api/templates/install', async (c) => {
  const body = await c.req.json<{ url?: string; kind?: string }>();
  if (!body.url?.trim() || (body.kind !== 'role' && body.kind !== 'skill')) {
    return c.json({ error: 'url and kind ("role" | "skill") are required' }, 400);
  }
  let text: string;
  try {
    const res = await fetch(toRawUrl(body.url.trim()));
    if (!res.ok) throw new Error(`fetch failed (${res.status})`);
    text = await res.text();
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
  try {
    const installed =
      body.kind === 'role' ? registry.install(text) : installSkill(SKILLS_DIR, text);
    matchIndex = null; // the catalog changed; rebuild on next match
    return c.json({ kind: body.kind, name: installed.name }, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[agentlings] server on http://localhost:${info.port}`);
});

const wss = new WebSocketServer({ server: server as HttpServer, path: '/ws' });
const subscriptions = new Map<WebSocket, string>();

function sendToLevel(levelId: string, msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const [socket, subscribed] of subscriptions) {
    if (subscribed === levelId && socket.readyState === WebSocket.OPEN) socket.send(data);
  }
}

wss.on('connection', (socket, req) => {
  const url = new URL(req.url ?? '/ws', 'http://localhost');
  const levelId = url.searchParams.get('level') ?? '';
  const rt = levels.get(levelId);
  if (!rt) {
    socket.close(4004, 'unknown level');
    return;
  }
  subscriptions.set(socket, levelId);
  socket.on('close', () => subscriptions.delete(socket));
  socket.send(JSON.stringify({ type: 'world', state: rt.sim.state() } satisfies ServerMessage));
  socket.send(
    JSON.stringify({ type: 'events', events: rt.eventLog.history() } satisfies ServerMessage),
  );
});

setInterval(() => {
  for (const rt of levels.values()) {
    rt.sim.step();
    sendToLevel(rt.meta.id, { type: 'world', state: rt.sim.state() });
  }
}, TICK_MS);
