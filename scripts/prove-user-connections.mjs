// The live proof D-244 owes: a connection added through the running server.
//
//   node scripts/prove-user-connections.mjs
//
// Two real MCP servers, chosen so the whole lifecycle is covered without
// leaving anything behind in `.env`:
//
//   * a **stdio** one that refuses to start without its declared secret —
//     probed only, which proves the secret really reaches the server;
//   * an **http** one needing no credential — probed, saved, listed and
//     removed, which proves the full round trip and writes no secret at all.
//
// It signs in first, because the routes are behind Wave 0's gate.

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE = path.join(ROOT, '.agentlings', 'connections.json');
const FIXTURE = path.join(ROOT, 'server/src/mcpprobe.fixture.mjs');
const PORT = 4713;

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

// ── sign in ─────────────────────────────────────────────────────────────────
let cookie = '';
const password = /^\s*AGENTLINGS_PASSWORD\s*=\s*(.+)$/m
  .exec(readFileSync(path.join(ROOT, '.env'), 'utf8'))?.[1]
  ?.trim();
if (password) {
  const res = await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    console.error(`could not sign in (${res.status}) — is the server on this .env?`);
    process.exit(1);
  }
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
}
const call = async (url, init = {}) => {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const probe = await call('/api/connections/probe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
if (probe.status === 404) {
  console.error('the running server predates D-244 (/api/connections/probe is unknown) — restart it first');
  process.exit(1);
}

// ── a real http MCP server, no credential ───────────────────────────────────
const http = createServer(async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => transport.close());
  const mcp = new McpServer({ name: 'proof-desk', version: '1.0.0' });
  mcp.registerTool(
    'desk_echo',
    { title: 'Echo', description: 'echo', inputSchema: { text: z.string() } },
    async ({ text }) => ({ content: [{ type: 'text', text }] }),
  );
  mcp.registerTool('desk_ping', { title: 'Ping', description: 'ping', inputSchema: {} }, async () => ({
    content: [{ type: 'text', text: 'pong' }],
  }));
  await mcp.connect(transport);
  await transport.handleRequest(req, res);
});
await new Promise((r) => http.listen(PORT, '127.0.0.1', r));

const json = (draft, values) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ draft, values }),
});

// ── 1. the stdio secret really reaches the server ───────────────────────────
const stdioDraft = {
  name: 'proof-local',
  label: 'Proof (local)',
  transport: 'stdio',
  command: process.execPath,
  args: [FIXTURE],
  secrets: { FIXTURE_TOKEN: 'the fixture refuses to start without it' },
};
const withSecret = await call('/api/connections/probe', json(stdioDraft, { FIXTURE_TOKEN: 'anything' }));
check(
  'a stdio server is spawned and lists its tools',
  withSecret.status === 200 && (withSecret.body.tools ?? []).length === 2,
  JSON.stringify(withSecret.body.tools ?? withSecret.body.error),
);
const noSecret = await call('/api/connections/probe', json(stdioDraft, {}));
// The fixture exits 3 without it, so this is the secret proving itself.
check('and fails when the secret is withheld', noSecret.status === 400, `${noSecret.status}`);

// ── 2. refusals happen before anything runs ─────────────────────────────────
const collision = await call('/api/connections/probe', json({ ...stdioDraft, name: 'github' }, {}));
check(
  'a shipped name is refused',
  collision.status === 400 && String(collision.body.error).includes('already'),
  JSON.stringify(collision.body.error),
);
const badName = await call('/api/connections/probe', json({ ...stdioDraft, name: 'Proof Local' }, {}));
check('a name a tool id could not carry is refused', badName.status === 400, JSON.stringify(badName.body.error));
const insecure = await call(
  '/api/connections/probe',
  json({ name: 'proof-remote', label: 'x', transport: 'http', url: 'http://mcp.example.com/' }, {}),
);
check('plain http off this machine is refused', insecure.status === 400, JSON.stringify(insecure.body.error));

// ── 3. the full round trip, with no secret to leave behind ──────────────────
const httpDraft = {
  name: 'proof-remote',
  label: 'Proof (remote)',
  transport: 'http',
  url: `http://127.0.0.1:${PORT}/`,
};
const before = existsSync(STORE) ? readFileSync(STORE, 'utf8') : '';
const saved = await call('/api/connections', json(httpDraft, {}));
check('it saves, and reports what the server offered', saved.status === 201, JSON.stringify(saved.body.tools ?? saved.body.error));

const listed = (saved.body.connections ?? []).find((c) => c.name === 'proof-remote');
check('it appears in the connection list', Boolean(listed), listed ? listed.label : 'missing');
check('marked as one this machine added', listed?.added === true);
check('and OFF, because adding is not granting', listed?.enabled === false);

const onDisk = existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : { connections: [] };
const stored = (onDisk.connections ?? []).find((c) => c.name === 'proof-remote');
check('written to .agentlings/connections.json, not the repo', Boolean(stored));
check(
  'with the tools the SERVER named, not the form',
  JSON.stringify(stored?.tools) === JSON.stringify(['desk_echo', 'desk_ping']),
  JSON.stringify(stored?.tools),
);

const twice = await call('/api/connections', json(httpDraft, {}));
check('adding the same name twice is refused', twice.status === 400, JSON.stringify(twice.body.error));

// ── 4. removal ──────────────────────────────────────────────────────────────
const shipped = await call('/api/connections/github', { method: 'DELETE' });
check('a shipped connection cannot be removed', shipped.status === 400, JSON.stringify(shipped.body.error));
const removed = await call('/api/connections/proof-remote', { method: 'DELETE' });
check('the added one can be', removed.status === 200);
check(
  'and it is gone from the list',
  !(removed.body.connections ?? []).some((c) => c.name === 'proof-remote'),
);
const after = existsSync(STORE) ? readFileSync(STORE, 'utf8') : '';
check('leaving the store as it was found', after.trim() === before.trim() || !after.includes('proof-remote'));

// Nothing was written to .env: the saved connection declared no secret.
check('no secret was written to .env', !readFileSync(path.join(ROOT, '.env'), 'utf8').includes('FIXTURE_TOKEN'));

http.close();
console.log(bad === 0 ? '\nUSER CONNECTIONS PROVEN' : `\nNOT PROVEN — ${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
