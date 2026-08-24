// A real stdio MCP server, for `mcpprobe.test.ts`.
//
// It lives in the repo rather than being written into a temp directory at test
// time, and that is not tidiness: a file outside the tree cannot resolve
// `@modelcontextprotocol/sdk`, because Node walks *up* from the file for
// node_modules. The first version of this test wrote it to tmpdir and the
// probe failed with a module-not-found the assertion could not show.
//
// It exits 3 without FIXTURE_TOKEN, so the test proves the probe really passes
// a declared secret through rather than that a happy path happens to work.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

if (!process.env.FIXTURE_TOKEN) process.exit(3);

const mcp = new McpServer({ name: 'fixture', version: '1.0.0' });
mcp.registerTool(
  'fixture_echo',
  { title: 'Echo', description: 'echo', inputSchema: { text: z.string() } },
  async ({ text }) => ({ content: [{ type: 'text', text }] }),
);
mcp.registerTool(
  'fixture_ping',
  { title: 'Ping', description: 'ping', inputSchema: {} },
  async () => ({ content: [{ type: 'text', text: 'pong' }] }),
);
await mcp.connect(new StdioServerTransport());
