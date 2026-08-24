import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Connection } from './connections';
import { probeConnection } from './mcpprobe';

/**
 * Against **real** MCP servers on both transports, because the whole point of
 * the probe is that it asks a server rather than trusting a form — and a
 * mocked server would only prove that a mock answers.
 *
 * No model is involved, so this stays in the ordinary suite.
 */

const TOKEN = 'probe-secret-abc';
const EXPECTED = `Bearer ${TOKEN}`;
let http: Server;
let port: number;

/**
 * The stdio server is a file in the repo (`mcpprobe.fixture.mjs`), not one
 * written to a temp directory at test time. A file outside the tree cannot
 * resolve `@modelcontextprotocol/sdk`, because Node walks *up* from the file
 * looking for node_modules — the first version of this test did exactly that
 * and the probe failed with a module-not-found no assertion could show.
 */
const stdioServerFile = (): string =>
  fileURLToPath(new URL('./mcpprobe.fixture.mjs', import.meta.url));

beforeAll(async () => {
  // Stateless streamable HTTP wants a fresh server per request; one shared
  // instance answers `initialize` and then 500s on everything after (D-243).
  http = createServer(async (req, res) => {
    if (req.headers.authorization !== EXPECTED) {
      res.writeHead(401).end('no');
      return;
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => transport.close());
    const mcp = new McpServer({ name: 'fixture-http', version: '1.0.0' });
    mcp.registerTool(
      'desk_echo',
      { title: 'Echo', description: 'echo', inputSchema: { text: z.string() } },
      async ({ text }) => ({ content: [{ type: 'text', text }] }),
    );
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
  port = (http.address() as { port: number }).port;
});

afterAll(() => http?.close());

describe('probing an http server', () => {
  const base = (): Connection => ({
    name: 'desk',
    label: 'Desk',
    transport: 'http',
    url: `http://127.0.0.1:${port}/`,
    headers: { Authorization: 'Bearer ${DESK_TOKEN}' },
    secrets: { DESK_TOKEN: 'token' },
  });

  it('asks the server what it offers', async () => {
    const result = await probeConnection(base(), { DESK_TOKEN: TOKEN });
    expect(result.ok).toBe(true);
    expect(result.tools).toEqual(['desk_echo']);
    expect(result.serverName).toBe('fixture-http');
  });

  it('fails with something to read when the credential is wrong', async () => {
    const result = await probeConnection(base(), { DESK_TOKEN: 'wrong' });
    expect(result.ok).toBe(false);
    expect(result.tools).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it('fails rather than hanging when nothing is listening', async () => {
    const dead = { ...base(), url: 'http://127.0.0.1:1/' };
    const result = await probeConnection(dead, { DESK_TOKEN: TOKEN });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('gives up on a server that accepts and never answers', async () => {
    const silent = createServer(() => {
      /* accept, then nothing at all */
    });
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', () => r()));
    const p = (silent.address() as { port: number }).port;
    const result = await probeConnection(
      { ...base(), url: `http://127.0.0.1:${p}/`, headers: {} },
      {},
      1500,
    );
    silent.close();
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  }, 20_000);
});

describe('probing a stdio server', () => {
  const base = (): Connection => ({
    name: 'fixture',
    label: 'Fixture',
    transport: 'stdio',
    command: process.execPath,
    args: [stdioServerFile()],
    secrets: { FIXTURE_TOKEN: 'token' },
  });

  it('spawns it and lists every tool it offers', async () => {
    const result = await probeConnection(base(), { FIXTURE_TOKEN: 'anything' });
    expect(result.ok).toBe(true);
    expect(result.tools.sort()).toEqual(['fixture_echo', 'fixture_ping']);
    expect(result.serverName).toBe('fixture');
  }, 30_000);

  /**
   * The fixture exits 3 without its secret, so this proves the probe actually
   * passes the declared secret through — not that a happy path happens to work.
   */
  it('passes the declared secret through, and fails without it', async () => {
    const result = await probeConnection(base(), {});
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  }, 30_000);

  it('fails with something to read when the command does not exist', async () => {
    const missing = { ...base(), command: 'definitely-not-a-real-command-xyz' };
    const result = await probeConnection(missing, { FIXTURE_TOKEN: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  }, 30_000);
});

describe('what it refuses to probe', () => {
  it('does not probe a builtin — the server makes those calls itself', async () => {
    const result = await probeConnection({ name: 'web', label: 'Web', transport: 'builtin' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('builtin');
  });

  it('says so rather than throwing when the shape is incomplete', async () => {
    expect((await probeConnection({ name: 'x', label: 'X', transport: 'stdio' })).error).toContain(
      'command',
    );
    expect((await probeConnection({ name: 'x', label: 'X', transport: 'http' })).error).toContain(
      'URL',
    );
  });
});
