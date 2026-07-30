import { serve } from '@hono/node-server';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerMessage } from '@agentlings/shared';
import { TICK_MS } from '@agentlings/shared';
import { EventLog } from './events';
import { SimulatedExecutor } from './executors/simulated';
import { JobQueue } from './queue';
import { Sim } from './sim';

const PORT = 4600;
const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // repo root
const SANDBOX_ROOT = path.join(ROOT, '.agentlings');

const queue = new JobQueue(SANDBOX_ROOT);
const eventLog = new EventLog((event) => sendToAll({ type: 'events', events: [event] }));
const sim = new Sim(queue, new SimulatedExecutor(), (event) => eventLog.emit(event));

const app = new Hono();

app.get('/api/state', (c) => c.json(sim.state()));

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
    .filter((entry) => entry.isFile())
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
  try {
    const job = queue.resolve(c.req.param('id'), body.action);
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
