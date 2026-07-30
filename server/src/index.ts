import { serve } from '@hono/node-server';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { WebSocket, WebSocketServer } from 'ws';
import type { AgentlingProfile, ServerMessage } from '@agentlings/shared';
import { TICK_MS } from '@agentlings/shared';
import { EventLog } from './events';
import { ClaudeAgentExecutor } from './executors/claude';
import type { Executor } from './executors/executor';
import { SimulatedExecutor } from './executors/simulated';
import { applyPatch, patchFile } from './gitwork';
import { MemoryStore } from './memory';
import { JobQueue } from './queue';
import { installSkill, listSkills, RoleRegistry, toRawUrl } from './roles';
import { Sim } from './sim';

const PORT = 4600;
const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // repo root
const SANDBOX_ROOT = path.join(ROOT, '.agentlings');
const ROLES_DIR = path.join(ROOT, 'roles');
const SKILLS_DIR = path.join(ROOT, 'skills');
const ROSTER_FILE = path.join(SANDBOX_ROOT, 'roster.json');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // No .env yet — fine.
}

const registry = new RoleRegistry(ROLES_DIR);
registry.load();
const memory = new MemoryStore(path.join(SANDBOX_ROOT, 'memory'));

/** API key, a Claude Code login, or an explicit AGENTLINGS_EXECUTOR override. */
function pickExecutor(): { executor: Executor; name: string } {
  const forced = process.env.AGENTLINGS_EXECUTOR;
  const hasAuth =
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.CLAUDE_CODE_OAUTH_TOKEN ||
    existsSync(path.join(os.homedir(), '.claude', '.credentials.json'));
  const useClaude = forced ? forced === 'claude' : hasAuth;
  return useClaude
    ? { executor: new ClaudeAgentExecutor(registry, memory, SKILLS_DIR), name: 'claude-agent-sdk' }
    : {
        executor: new SimulatedExecutor(),
        name: 'simulated (set ANTHROPIC_API_KEY in .env or AGENTLINGS_EXECUTOR=claude)',
      };
}
const picked = pickExecutor();
console.log(`[agentlings] executor: ${picked.name}`);

const queue = new JobQueue(SANDBOX_ROOT);
const eventLog = new EventLog((event) => sendToAll({ type: 'events', events: [event] }));
const sim = new Sim(
  queue,
  picked.executor,
  (event) => eventLog.emit(event),
  (agentling, jobTitle, outcome, detail, lesson) => {
    const date = new Date().toISOString().slice(0, 10);
    const line = lesson
      ? `${date} · ${lesson}`
      : outcome === 'done'
        ? `${date} · delivered "${jobTitle}" as ${agentling.role}`
        : `${date} · failed "${jobTitle}" as ${agentling.role} — ${detail}`;
    memory.append(agentling.name, line);
  },
);

try {
  const roster = JSON.parse(readFileSync(ROSTER_FILE, 'utf8')) as Record<string, string>;
  for (const a of sim.agentlings) {
    if (roster[a.id] && registry.get(roster[a.id])) a.role = roster[a.id];
  }
} catch {
  // No roster saved yet; everyone stays a worker.
}

function saveRoster(): void {
  mkdirSync(SANDBOX_ROOT, { recursive: true });
  writeFileSync(
    ROSTER_FILE,
    JSON.stringify(Object.fromEntries(sim.agentlings.map((a) => [a.id, a.role])), null, 2),
  );
}

const app = new Hono();

app.get('/api/state', (c) => c.json(sim.state()));

app.get('/api/roles', (c) => c.json(registry.list()));

app.get('/api/skills', (c) => c.json(listSkills(SKILLS_DIR)));

app.get('/api/agentlings/:id', (c) => {
  const agentling = sim.agentlings.find((a) => a.id === c.req.param('id'));
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
    memory: memory.lessons(agentling.name),
  };
  return c.json(profile);
});

app.post('/api/agentlings/:id/role', async (c) => {
  const agentling = sim.agentlings.find((a) => a.id === c.req.param('id'));
  if (!agentling) return c.json({ error: 'unknown agentling' }, 404);
  const body = await c.req.json<{ role?: string }>();
  const role = body.role ? registry.get(body.role) : undefined;
  if (!role) return c.json({ error: `unknown role "${body.role ?? ''}"` }, 400);
  agentling.role = role.name;
  saveRoster();
  return c.json(agentling);
});

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
    return c.json({ kind: body.kind, name: installed.name }, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post('/api/jobs', async (c) => {
  const body = await c.req.json<{ title?: string; prompt?: string; repoPath?: string }>();
  if (!body.title?.trim() || !body.prompt?.trim()) {
    return c.json({ error: 'title and prompt are required' }, 400);
  }
  const job = queue.add({
    title: body.title.trim(),
    prompt: body.prompt.trim(),
    repoPath: body.repoPath?.trim() || undefined,
  });
  eventLog.emit({ type: 'queued', jobId: job.id, title: job.title });
  return c.json(job, 201);
});

app.get('/api/jobs/:id/output', (c) => {
  const job = queue.get(c.req.param('id'));
  if (!job) return c.json({ error: 'unknown job' }, 404);
  const dir = queue.sandboxDir(job.id);
  if (!existsSync(dir)) return c.json({ files: [] });
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => ({
      name: entry.name,
      content: readFileSync(path.join(dir, entry.name), 'utf8'),
    }));
  return c.json({ files });
});

app.post('/api/jobs/:id/resolve', async (c) => {
  const body = await c.req.json<{ action?: string }>();
  if (body.action !== 'promote' && body.action !== 'discard') {
    return c.json({ error: 'action must be "promote" or "discard"' }, 400);
  }
  const pending = queue.get(c.req.param('id'));
  if (!pending) return c.json({ error: 'unknown job' }, 404);
  // Promote replays the reviewed patch onto the real repository first;
  // the job is only marked promoted if the patch applies cleanly.
  if (body.action === 'promote' && pending.status === 'done' && pending.repoPath) {
    const patch = patchFile(queue.sandboxDir(pending.id));
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
    const job = queue.resolve(pending.id, body.action);
    eventLog.emit({
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

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[agentlings] server on http://localhost:${info.port}`);
});

const wss = new WebSocketServer({ server: server as HttpServer, path: '/ws' });

function sendToAll(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'world', state: sim.state() } satisfies ServerMessage));
  socket.send(JSON.stringify({ type: 'events', events: eventLog.history() } satisfies ServerMessage));
});

setInterval(() => {
  sim.step();
  sendToAll({ type: 'world', state: sim.state() });
}, TICK_MS);
