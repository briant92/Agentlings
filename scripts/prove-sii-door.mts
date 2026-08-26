// The SII purchases and sales register, read-only — the live proof (#19, D-252).
//
//   npx tsx scripts/prove-sii-door.mts        (from the repo root)
//
// **No server, no SII certificate and no account needed**, and nothing is
// written anywhere: no connection, no `.env` line. A throwaway `.p12` is made
// in the system temp folder so the adapter has something to start with — SII
// has never seen it and will not take it, which is exactly what §3 measures.
//
//   §1  the adapter is a connection the app can add — the real probe spawns
//       the real `scripts/sii-mcp.mts` and reads its three tools off it
//   §2  it refuses to start when it is not configured, and says why in a
//       sentence the form shows (mcpprobe's stderr, #18)
//   §3  against the REAL SII: no certificate is refused one way, a certificate
//       SII does not accredit another, and each is said as itself
//   §4  through the real adapter over MCP, every read reaches the certificate
//       login and is refused there, an invented accept is refused as *it reads
//       only*, and a wrong argument is refused before anything leaves
//   §5  what the shelf would carry, by value
//
// The one thing it cannot prove is the ticket's third box: one real HQ job
// listing a period's received DTEs, promoted. That needs Brian's own SII
// certificate and its password in `.env`, and it is owed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  SII_CERT_LOGIN,
  SII_READS,
  SII_REFERENCIA,
  SII_REJECTED,
  certificateLogin,
} from '../server/src/sii.ts';
import { probeConnection } from '../server/src/mcpprobe.ts';
import { THROWAWAY_CERT_PASSWORD, makeThrowawayCertificate } from '../server/src/siicert.fixture.ts';
import { connectionFromDraft, draftProblem, type ConnectionDraft } from '../server/src/userconnections.ts';
import type { Connection } from '../server/src/connections.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER = path.join(ROOT, 'scripts', 'sii-mcp.mts');
/** A real RUT, check digit and all. It is nobody's: SII never sees it here. */
const RUT = '76123456-0';
const CERT_PASSWORD = THROWAWAY_CERT_PASSWORD;

let bad = 0;
let ran = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

const section = (title: string) => console.log(`\n${title}`);

// ── a certificate to start with, which SII has never heard of ────────────────
// The same fixture `sii.test.ts` uses, rather than a second copy of it
// (D-030). Self-signed on purpose: the real SII closes the connection on it,
// which is what §3 measures.
const CERT_PATH = makeThrowawayCertificate(CERT_PASSWORD);

const env = { SII_CERT_PATH: CERT_PATH, SII_CERT_PASSWORD: CERT_PASSWORD };
/** Exactly what a person types into the add form, and what this proof runs. */
function draft(rut: string, extra?: { noRut?: boolean }): ConnectionDraft {
  return {
    name: 'sii',
    label: 'SII register (read-only)',
    // The ticket asks for the portal-endpoint fragility to be named *in the
    // entry*, so it is in the description the shelf row itself carries —
    // where somebody deciding whether to trust this door will actually read
    // it — and not only in D-267. §5 asserts it is still there.
    description:
      'Reads the SII purchases and sales register: a month’s totals by document type, and the documents received (compras) and issued (ventas), each asked of one of the register’s four sections. It cannot accept, claim, reject or issue anything. Fragile by nature: the SII publishes no API for this register, so these are the tax portal’s own internal addresses — versioned by nobody and able to change in any SII release, at which point reads stop and say so rather than answer wrongly.',
    transport: 'stdio',
    command: 'npx',
    args: extra?.noRut ? ['tsx', ADAPTER] : ['tsx', ADAPTER, '--rut', rut],
    secrets: {
      SII_CERT_PATH: 'the path to your SII digital certificate, a .p12 or .pfx file',
      SII_CERT_PASSWORD: 'the password that opens that certificate file',
    },
  };
}

const asConnection = (d: ConnectionDraft): Connection => connectionFromDraft(d, []);

// ── §1 the adapter is a connection the app can add ───────────────────────────

section('§1  the adapter, as the app reads it');

const good = draft(RUT);

check('the form’s own validator accepts the draft', draftProblem(good, []) === null, draftProblem(good, []));

const probe = await probeConnection(asConnection(good), env);

check('the real probe spawned the real adapter and it answered', probe.ok, probe.error);

check('it calls itself sii-register-read-only', probe.serverName === 'sii-register-read-only', probe.serverName);

check(
  'its tool list is exactly the three reads the ticket names',
  JSON.stringify(probe.tools) === JSON.stringify(['register_summary', 'received_documents', 'issued_documents']),
  probe.tools.join(', '),
);

// Read off the adapter, not off our table — the tool list a connection carries
// is whatever the server said (D-044), so this is the list a job would hold.
const ACT_WORDS = /accept|aceptar|claim|reclam|acuse|recibo|send|upload|issue$|emitir|create|update|delete|post|put|patch|sign|folio/i;

check(
  'not one tool it offers is named for an act',
  probe.tools.every((tool) => !ACT_WORDS.test(tool)),
  probe.tools.filter((tool) => ACT_WORDS.test(tool)).join(', ') || 'none',
);

// ── §2 it refuses to start when it is not configured ─────────────────────────

section('§2  misconfigured, it refuses to start and says why');

const noRut = await probeConnection(asConnection(draft(RUT, { noRut: true })), env);

check('no RUT: refused', !noRut.ok);

check('and the adapter’s own sentence reached the form', /--rut/.test(noRut.error ?? ''), noRut.error);

const badRut = await probeConnection(asConnection(draft('76123456-7')), env);

check('a RUT whose check digit is wrong: refused', !badRut.ok);

check('named as the check digit, not as a shape', /check digit/.test(badRut.error ?? ''), badRut.error);

const noCert = await probeConnection(asConnection(good), { SII_CERT_PASSWORD: CERT_PASSWORD });

check('no certificate path: refused, so a connection without one cannot be stored', !noCert.ok);

check('and it names SII_CERT_PATH', /SII_CERT_PATH/.test(noCert.error ?? ''), noCert.error);

const noPassword = await probeConnection(asConnection(good), { SII_CERT_PATH: CERT_PATH });

check('no certificate password: refused', !noPassword.ok);

check('and it names SII_CERT_PASSWORD', /SII_CERT_PASSWORD/.test(noPassword.error ?? ''), noPassword.error);

const wrongPassword = await probeConnection(asConnection(good), {
  SII_CERT_PATH: CERT_PATH,
  SII_CERT_PASSWORD: 'not-the-password',
});

check('the wrong password: refused, at the password rather than at the file', !wrongPassword.ok);

check(
  'and it says the file is a certificate but that is not its password',
  /that is not its password/.test(wrongPassword.error ?? ''),
  wrongPassword.error,
);

// ── §3 against the real SII ──────────────────────────────────────────────────

section('§3  at the REAL SII, with no certificate and with one it does not accredit');

// (a) The login page's own form, posted with no client certificate at all.
//     Measured 2026-08-26: SII answers 302 to its error page.
try {
  const response = await fetch(`${SII_CERT_LOGIN}?${SII_REFERENCIA}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ referencia: SII_REFERENCIA }).toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  });
  const location = response.headers.get('location') ?? '';
  check('SII still answers its certificate login at herculesr.sii.cl', response.status === 302, `${response.status}`);
  check(
    `with no certificate it sends the login to ${SII_REJECTED}`,
    location.includes(SII_REJECTED),
    location || '(no location)',
  );
} catch (err) {
  check('SII still answers its certificate login at herculesr.sii.cl', false, err instanceof Error ? err.message : err);
  check(`with no certificate it sends the login to ${SII_REJECTED}`, false, 'not reached');
}

// (b) The real login function, with a real .p12 SII has never accredited.
//     This is our own code against the real SII, all the way to the handshake.
let loginSaid = '';

try {
  await certificateLogin({ certPath: CERT_PATH, certPassword: CERT_PASSWORD });
  loginSaid = '(it logged in, which cannot be right)';
} catch (err) {
  loginSaid = err instanceof Error ? err.message : String(err);
}

check(
  'a certificate SII does not accredit is refused, and never logs in',
  !loginSaid.startsWith('(it logged in'),
  loginSaid.slice(0, 100),
);

check(
  'and the reader is sent at the certificate authority, not at an OpenSSL string',
  /entidad certificadora/.test(loginSaid),
  loginSaid.slice(0, 200),
);

// ── §4 through the real adapter, over MCP ────────────────────────────────────

section('§4  through the real adapter, over MCP');

const client = new Client({ name: 'prove-sii-door', version: '1.0.0' });

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', ADAPTER, '--rut', RUT],
  env: { ...process.env, ...env } as Record<string, string>,
  stderr: 'pipe',
});

await client.connect(transport);

const call = async (name: string, args: Record<string, unknown>) => {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { text: string }[];
  };
  return { isError: Boolean(result.isError), text: result.content.map((c) => c.text).join('\n') };
};

// The month before this one — always a period that has happened.
const now = new Date();

const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

const PERIOD = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;

// Every one of the three, at the real SII. They all stop at the certificate,
// which is the point: each tool really reaches SII's login and is refused
// there, so the list is a door rather than a decoration — and not one of them
// answers a register without a certificate SII accepts.
const each = await Promise.all(
  SII_READS.map(async (read) => ({
    name: read.name,
    result: await call(read.name, { period: PERIOD, ...(read.side ? {} : { side: 'received' }) }),
  })),
);

check(
  'all three reach the real SII’s certificate login and are refused there by name',
  each.every(({ result }) => result.isError && /entidad certificadora|would not take the certificate/.test(result.text)),
  each.map(({ name, result }) => `${name}:${result.isError ? 'refused' : 'ANSWERED'}`).join(' '),
);

const accept = await call('sendResultadoDte', { period: PERIOD });

check(
  'the accept a model might reach for is refused by name',
  accept.isError && /reads only/.test(accept.text),
  accept.text,
);

const claim = await call('claim_document', { period: PERIOD });

check('and so is a claim', claim.isError && /reads only/.test(claim.text), claim.text);

// Refused before the wire: these never reach SII at all, so they answer at
// once and say what was wanted rather than what went wrong at the far end.
const future = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));

const ahead = await call('received_documents', { period: `${future.getUTCFullYear()}-01` });

check(
  'a month that has not happened is refused before the wire, rather than read as an empty register',
  ahead.isError && /has not happened yet/.test(ahead.text),
  ahead.text,
);

const badPeriod = await call('issued_documents', { period: 'julio de 2026' });

check(
  'a period in prose is refused, naming the one spelling it wants',
  badPeriod.isError && /YYYY-MM/.test(badPeriod.text),
  badPeriod.text,
);

const badType = await call('received_documents', { period: PERIOD, document_type: 'factura' });

check(
  'a document type by name is refused, naming SII’s own codes',
  badType.isError && /33/.test(badType.text),
  badType.text,
);

const badSide = await call('register_summary', { period: PERIOD, side: 'ventas' });

check(
  'a side in Spanish is refused, naming the two words it takes',
  badSide.isError && /received \(compras\) or issued \(ventas\)/.test(badSide.text),
  badSide.text,
);

await client.close();

// ── §5 what the shelf would carry ────────────────────────────────────────────

section('§5  the shelf, by value');

// Asserted by value rather than by presence — a `Boolean(...)` here would pass
// on the default this very call supplies, which is the unfalsifiable-check
// shape #16 and #17 were both caught by.
const answeredAt = new Date().toISOString();

const stored = connectionFromDraft(good, probe.tools, answeredAt);

check('the shelf carries the moment this install’s probe answered', stored.verifiedAt === answeredAt, stored.verifiedAt);

check(
  'and where the shape came from — this form was filled by hand, and the shelf says exactly that',
  stored.source === 'typed by hand',
  stored.source,
);

check('it is off until Settings says otherwise', stored.defaultOn === false);

check(
  'it declares two secrets, and they are the certificate and its password',
  JSON.stringify(Object.keys(stored.secrets ?? {})) === '["SII_CERT_PATH","SII_CERT_PASSWORD"]',
  Object.keys(stored.secrets ?? {}).join(', '),
);

check(
  'the RUT is on the row in plain sight, not in a secret',
  (stored.args ?? []).includes('--rut') && (stored.args ?? []).includes(RUT),
  (stored.args ?? []).join(' '),
);

check(
  'and nothing about a portal login is held anywhere on the row',
  !JSON.stringify(stored).match(/clave|password.*tributaria|usuario/i),
  JSON.stringify(Object.keys(stored)),
);

// The ticket's fourth box in full: *shelf entry with source and date; the
// portal-endpoint fragility is named in the entry*. The stamps are two checks
// up; this is the fragility, on the row a person reads before trusting it.
check(
  'the shelf entry itself names the portal-endpoint fragility',
  /no API/.test(stored.description ?? '') && /versioned by nobody/.test(stored.description ?? ''),
  stored.description,
);

// ── what to type into the form ───────────────────────────────────────────────

section('The add form, for a real certificate — this is the shape §1 just ran');

console.log(`  name        sii`);

console.log(`  label       SII register (read-only)`);

console.log(`  transport   stdio`);

console.log(`  command     npx`);

console.log(`  arguments   tsx`);

console.log(`              ${ADAPTER}`);

console.log(`              --rut`);

console.log(`              <your company's RUT, as 76123456-0>`);

console.log(`  secret      SII_CERT_PATH     = <the path to your .p12>`);

console.log(`  secret      SII_CERT_PASSWORD = <the password that opens it>`);

console.log(
  `\n${bad === 0 ? 'PASS' : 'FAIL'}  ${ran - bad}/${ran} — NOT proven end to end until one real HQ job lists a period's received DTEs through this connection and is promoted.`,
);

process.exit(bad === 0 ? 0 : 1);
