// The live proof Wave 2's http transport owes (D-243).
//
//   node scripts/prove-http-mcp.mjs
//
// Self-contained and costs one cheap model turn. It stands up a REAL MCP
// server over streamable HTTP, writes a real `.session.json` through the real
// `toMcpServers`, spawns the REAL runner, and then asks the three questions
// only a live run can answer:
//
//   1. does the SDK reach an `http` MCP server at all, and call its tool;
//   2. does the credential survive the placeholder round trip — `${NAME}` on
//      disk, value over stdin — and arrive at the far end intact;
//   3. is the value absent from `.session.json`, which is the file the
//      agentling reads all job long (D-242).
//
// The server checks `Authorization` itself rather than trusting us to check
// it, so a broken round trip fails as a 401 from a third party instead of as
// an assertion we wrote to pass.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { mcpSecretValues, toMcpServers } from '../server/src/connections.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = path.join(ROOT, 'server/src/executors/agent-runner.mjs');
const PORT = 4711;
const TOKEN = 'desk-secret-abc';
const EXPECTED = `Bearer ${TOKEN}`;

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

// ── a real MCP server, which authenticates for itself ───────────────────────
//
// A FRESH McpServer and transport per request. Stateless streamable HTTP
// requires it, and one shared instance is the trap that cost this script two
// runs: it answers `initialize` with a clean 200 and then 500s on every
// request after, which the agent SDK reports only as `status: "failed"` with
// no reason. The server's own request log is what found it.
function freshServer() {
  const mcp = new McpServer({ name: 'desk', version: '1.0.0' });
  mcp.registerTool(
    'desk_echo',
    {
      title: 'Echo',
      description: 'Return the text you were given, to prove the transport carried it.',
      inputSchema: { text: z.string() },
    },
    async ({ text }) => ({ content: [{ type: 'text', text: `desk saw: ${text}` }] }),
  );
  return mcp;
}

const seen = { authorized: 0, unauthorized: 0, lastAuth: null };
const http = createServer(async (req, res) => {
  const auth = req.headers.authorization ?? null;
  if (auth !== null) seen.lastAuth = auth;
  if (auth !== EXPECTED) {
    seen.unauthorized += 1;
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad or missing Authorization' }));
    return;
  }
  seen.authorized += 1;
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => transport.close());
  try {
    await freshServer().connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error('the fixture server threw:', err?.message ?? err);
    if (!res.headersSent) res.writeHead(500).end();
  }
});
await new Promise((r) => http.listen(PORT, '127.0.0.1', r));

// ── the config, built by the SHIPPED function rather than by hand ───────────
const DESK = {
  name: 'desk',
  label: 'Business desk',
  transport: 'http',
  url: `http://127.0.0.1:${PORT}/`,
  headers: { Authorization: `Bearer \${DESK_TOKEN}` },
  secrets: { DESK_TOKEN: 'API token for the desk' },
  tools: ['desk_echo'],
};
const env = { DESK_TOKEN: TOKEN };
const mcpServers = toMcpServers([DESK], env);
const secrets = mcpSecretValues([DESK], env);

const sandbox = mkdtempSync(path.join(tmpdir(), 'httpmcp-'));
const configPath = path.join(sandbox, '.session.json');
writeFileSync(
  configPath,
  JSON.stringify({
    cwd: sandbox,
    prompt: 'Call the desk_echo tool with the text "wave 2" and then reply with exactly what it returned.',
    append: '',
    allowedTools: ['mcp__desk__desk_echo'],
    mcpTools: ['mcp__desk__desk_echo'],
    maxTurns: 4,
    mcpServers,
  }),
);

// Question 3 first, because it needs no run and it is the one that would be
// embarrassing to discover afterwards.
const onDisk = readFileSync(configPath, 'utf8');
check('the token is NOT in .session.json', !onDisk.includes(TOKEN));
check('the header is a ${NAME} placeholder there', onDisk.includes('${DESK_TOKEN}'));

// ── the real runner ─────────────────────────────────────────────────────────
const out = await new Promise((resolve) => {
  const child = spawn(process.execPath, [RUNNER, configPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(`${JSON.stringify(secrets)}\n`);
  let text = '';
  child.stdout.on('data', (d) => (text += d));
  child.stderr.on('data', (d) => (text += d));
  const kill = setTimeout(() => child.kill(), 90_000);
  child.on('exit', () => {
    clearTimeout(kill);
    resolve(text);
  });
});

const lines = out
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);
const called = lines.some((l) => l.type === 'progress' && String(l.name).includes('desk_echo'));
const result = lines.find((l) => l.type === 'result');

check('the SDK reached the http MCP server and called its tool', called);
check('the far end authorized the call', seen.authorized > 0, `${seen.authorized} authorized`);
check(
  'the credential arrived intact through the placeholder round trip',
  seen.lastAuth === EXPECTED,
  seen.lastAuth === EXPECTED ? 'exact match' : `saw ${JSON.stringify(seen.lastAuth)}`,
);
check(
  "the tool's answer came back to the session",
  Boolean(result?.summary?.includes('desk saw')),
  JSON.stringify(result?.summary ?? out.slice(0, 160)),
);
if (result?.meter?.costUsd !== undefined) console.log(`\n(cost $${result.meter.costUsd.toFixed(4)})`);

http.close();
console.log(bad === 0 ? '\nHTTP MCP PROVEN' : `\nNOT PROVEN — ${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
