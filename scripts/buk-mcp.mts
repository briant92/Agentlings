// Buk, read-only — the stdio MCP adapter (#18, D-252).
//
//   npx tsx scripts/buk-mcp.mts --tenant <subdomain>
//
// Buk publishes a per-tenant REST API and no MCP server, so this is the piece
// that makes it a connection: MCP on one side, Buk's REST on the other. It is
// deliberately thin — every decision about what may be asked, how an argument
// is checked, what a refusal reads like and how big a reply may be lives in
// `server/src/buk.ts`, where tests can reach it. This file is the mouth.
//
// **The tenant is configuration, the key is a secret** (D-078, D-252). The
// subdomain is an argument, visible on the connection's own row in Settings;
// the token arrives as `BUK_API_KEY` in the environment, is never written
// anywhere by this process, and never appears in anything it says.
//
// **Nothing here can write to Buk**, whatever the token's scope: this file
// holds no path, no method and no body — it only hands a tool name and its
// arguments to `callBukRead`, whose one request is a `GET`.
//
// stdout belongs to the protocol. Everything this process has to say to a
// person goes to stderr, which the probe reads back (`mcpprobe.ts`).
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { BUK_KEY_SCOPE, BUK_READS, bukBase, bukToolSchema, callBukRead, tenantProblem } from '../server/src/buk.ts';

function argValue(flag: string): string {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? (process.argv[at + 1] ?? '') : '';
}

function refuseToStart(reason: string): never {
  // The probe surfaces this line to whoever is filling in the form, so it is
  // written for them rather than for a log.
  process.stderr.write(`buk: ${reason}\n`);
  process.exit(1);
}

const tenant = argValue('--tenant').trim().toLowerCase();
const problem = tenantProblem(tenant);
if (problem) refuseToStart(problem);

const token = (process.env.BUK_API_KEY ?? '').trim();
// Refused at startup rather than at the first call, so that a connection
// cannot be *stored* without its key: the add flow probes before it writes
// (D-244), and a probe that succeeds is the app's claim that this works.
if (!token) refuseToStart(`BUK_API_KEY is not set — add it as this connection's secret, ${BUK_KEY_SCOPE}`);

const config = { base: bukBase(tenant), token };

const server = new Server(
  { name: 'buk-read-only', version: '1.0.0' },
  {
    capabilities: { tools: {} },
    instructions:
      `Reads the Buk HR and payroll system for the tenant ${tenant}. Every tool here reads; none of them can create, change or delete anything in Buk, whatever the API key is allowed to do. Dates are not one format: each tool says which it wants.`,
  },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: BUK_READS.map((read) => ({
    name: read.name,
    description: read.summary,
    inputSchema: bukToolSchema(read),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await callBukRead(name, (args ?? {}) as Record<string, unknown>, config);
  // A refusal comes back as an error *result* rather than a thrown protocol
  // error: the caller is a model, and a tool result it can read is a corrected
  // next call, where a protocol error is a dead end.
  return { content: [{ type: 'text' as const, text: result.text }], isError: !result.ok };
});

await server.connect(new StdioServerTransport());
