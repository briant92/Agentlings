// The SII purchases and sales register, read-only — the stdio MCP adapter
// (#19, D-252).
//
//   npx tsx scripts/sii-mcp.mts --rut <rut>
//
// The SII publishes no API for the register, so this is the piece that makes
// it a connection: MCP on one side, the portal's own JSON facade on the other.
// It is deliberately thin — every decision about what may be asked, how an
// argument is checked, what a refusal reads like and how big a reply may be
// lives in `server/src/sii.ts`, where tests can reach it. This file is the
// mouth.
//
// **The RUT is configuration, the certificate is the credential** (D-078,
// D-252). The company's RUT is an argument, visible on the connection's own
// row in Settings; the certificate's path and password arrive as
// `SII_CERT_PATH` and `SII_CERT_PASSWORD` in the environment, are never
// written anywhere by this process, and never appear in anything it says. No
// portal password, no clave tributaria, no browser profile — nothing else
// about the login is held.
//
// **Nothing here can write to the SII**, and accept and claim are excluded by
// name: this file holds no address and no request, it only hands a tool name
// and its arguments to a door whose whole address book is three reads.
//
// stdout belongs to the protocol. Everything this process has to say to a
// person goes to stderr, which the probe reads back (`mcpprobe.ts`).
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SII_READS, certProblem, rutProblem, siiDoor, siiToolSchema } from '../server/src/sii.ts';

function argValue(flag: string): string {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? (process.argv[at + 1] ?? '') : '';
}

function refuseToStart(reason: string): never {
  // The probe surfaces this line to whoever is filling in the form, so it is
  // written for them rather than for a log.
  process.stderr.write(`sii: ${reason}\n`);
  process.exit(1);
}

const rut = argValue('--rut').trim();
const badRut = rutProblem(rut);
if (badRut) refuseToStart(badRut);

const certPath = (process.env.SII_CERT_PATH ?? '').trim();
const certPassword = process.env.SII_CERT_PASSWORD ?? '';
// Refused at startup rather than at the first read, so that a connection
// cannot be *stored* without a certificate that opens: the add flow probes
// before it writes (D-244), and a probe that succeeds is the app's claim that
// this works.
const badCert = certProblem(certPath, certPassword);
if (badCert) refuseToStart(badCert);

const door = siiDoor({ rut, certPath, certPassword });

const server = new Server(
  { name: 'sii-register-read-only', version: '1.0.0' },
  {
    capabilities: { tools: {} },
    instructions:
      `Reads the SII purchases and sales register (Registro de Compras y Ventas) for ${rut}, one tax month at a time. Every tool here reads; none of them can accept, claim, reject or issue a document. Start with register_summary to see which document types a month holds, then read the detail. The SII publishes no API for this register — these are the portal's own addresses, so an answer that is not the register means they may have moved.`,
  },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: SII_READS.map((read) => ({
    name: read.name,
    description: read.summary,
    inputSchema: siiToolSchema(read),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await door.read(name, (args ?? {}) as Record<string, unknown>);
  // A refusal comes back as an error *result* rather than a thrown protocol
  // error: the caller is a model, and a tool result it can read is a corrected
  // next call, where a protocol error is a dead end.
  return { content: [{ type: 'text' as const, text: result.text }], isError: !result.ok };
});

// SII limits concurrent sessions per RUT, so the session is given back when
// this process is told to stop — a door that walked away holding one would
// lock the company out of its own register.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void door.close().finally(() => process.exit(0));
  });
}

await server.connect(new StdioServerTransport());
