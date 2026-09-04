// Buk, read-only — the live proof (#18, D-252).
//
//   npx tsx scripts/prove-buk-door.mts        (from the repo root)
//
// **No server, no Buk account and no key needed**, and nothing is written
// anywhere: no connection, no `.env` line. What it proves:
//
//   §1  the adapter is a connection the app can add — the real probe spawns
//       the real `scripts/buk-mcp.mts` and reads its five tools off it
//   §2  it refuses to start when it is not configured, and says why in a
//       sentence the form now shows (mcpprobe's stderr, #18)
//   §3  the five paths it holds are still GET in Buk's OWN published contract
//   §4  against the REAL Buk, a call with a key Buk does not know comes back
//       as a sentence about the key, and never as a success
//
// The one thing it cannot prove is the ticket's last box: a real HQ job
// reading a real payroll through it. That needs a tenant and a read key in
// `.env`, and it is owed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BUK_COUNTRY, BUK_KEY_SCOPE, BUK_READS } from '../server/src/buk.ts';
import { probeConnection } from '../server/src/mcpprobe.ts';
import { connectionFromDraft, draftProblem, type ConnectionDraft } from '../server/src/userconnections.ts';
import type { Connection } from '../server/src/connections.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER = path.join(ROOT, 'scripts', 'buk-mcp.mts');
/** Buk's own demo tenant — it serves the contract to anyone and refuses every read. */
const TENANT = 'demo';
const CONTRACT = `https://${TENANT}.buk.cl/api/${BUK_COUNTRY}/es/api_docs`;

let bad = 0;
let ran = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};
const section = (title: string) => console.log(`\n${title}`);

/** Exactly what a person types into the add form, and what this proof runs. */
function draft(tenant: string, extra?: { noTenant?: boolean }): ConnectionDraft {
  return {
    name: 'buk',
    label: 'Buk (read-only)',
    description:
      'Reads the Buk HR and payroll system: employees, who is active, an employee’s plans and vacation balance, and their pay stubs. It cannot change anything in Buk.',
    transport: 'stdio',
    command: 'npx',
    args: extra?.noTenant ? ['tsx', ADAPTER] : ['tsx', ADAPTER, '--tenant', tenant],
    secrets: { BUK_API_KEY: BUK_KEY_SCOPE },
  };
}

const asConnection = (d: ConnectionDraft): Connection => connectionFromDraft(d, []);

// ── §1 the adapter is a connection the app can add ───────────────────────────
section('§1  the adapter, as the app reads it');

const good = draft(TENANT);
check('the form’s own validator accepts the draft', draftProblem(good, []) === null, draftProblem(good, []));

const probe = await probeConnection(asConnection(good), { BUK_API_KEY: 'not-a-real-key' });
check('the real probe spawned the real adapter and it answered', probe.ok, probe.error);
check('it calls itself buk-read-only', probe.serverName === 'buk-read-only', probe.serverName);
check(
  'its tool list is exactly the five reads the ticket names',
  JSON.stringify(probe.tools) ===
    JSON.stringify(['employees', 'active_employees', 'employee_plans', 'vacations_available', 'pay_stubs']),
  probe.tools.join(', '),
);
// Read off the adapter, not off our table — the tool list a connection carries
// is whatever the server said (D-044), so this is the list a job would hold.
const WRITE_WORDS = /create|update|delete|remove|post|patch|put|new|add|terminate|clone|sign|assign/i;
check(
  'not one tool it offers is named for a write',
  probe.tools.every((t) => !WRITE_WORDS.test(t)),
  probe.tools.filter((t) => WRITE_WORDS.test(t)).join(', ') || 'none',
);

// The shelf's two stamps, asserted by value rather than by presence — a
// `Boolean(...)` here would pass on the default this very call supplies, which
// is the unfalsifiable-check shape #16 and #17 were both caught by.
const answeredAt = new Date().toISOString();
const stored = connectionFromDraft(good, probe.tools, answeredAt);
check('the shelf carries the moment this install’s probe answered', stored.verifiedAt === answeredAt, stored.verifiedAt);
check(
  'and where the shape came from — this form was filled by hand, and the shelf says exactly that',
  stored.source === 'typed by hand',
  stored.source,
);
check('it is off until Settings says otherwise', stored.defaultOn === false);
check('it declares one secret, and it is the key', JSON.stringify(Object.keys(stored.secrets ?? {})) === '["BUK_API_KEY"]');
check(
  'the tenant is on the row in plain sight, not in a secret',
  (stored.args ?? []).includes('--tenant') && (stored.args ?? []).includes(TENANT),
  (stored.args ?? []).join(' '),
);

// ── §2 it refuses to start when it is not configured ─────────────────────────
section('§2  misconfigured, it refuses to start and says why');

const noTenant = await probeConnection(asConnection(draft(TENANT, { noTenant: true })), { BUK_API_KEY: 'x' });
check('no tenant: refused', !noTenant.ok);
check('and the adapter’s own sentence reached the form', /--tenant/.test(noTenant.error ?? ''), noTenant.error);

const badTenant = await probeConnection(asConnection(draft('https://acme.buk.cl')), { BUK_API_KEY: 'x' });
check('a whole URL as the tenant: refused', !badTenant.ok);
check('named as not a subdomain', /subdomain/.test(badTenant.error ?? ''), badTenant.error);

const noKey = await probeConnection(asConnection(good), {});
check('no key: refused, so a connection without one cannot be stored', !noKey.ok);
check('and it names BUK_API_KEY', /BUK_API_KEY/.test(noKey.error ?? ''), noKey.error);

// ── §3 the table against Buk's own contract, live ────────────────────────────
section('§3  the five paths, against Buk’s own published contract');

interface Contract {
  paths?: Record<string, Record<string, unknown>>;
}
let contract: Contract | null = null;
try {
  const response = await fetch(CONTRACT, { signal: AbortSignal.timeout(30_000) });
  contract = response.ok ? ((await response.json()) as Contract) : null;
  check(`Buk serves its contract at ${TENANT}.buk.cl`, Boolean(contract?.paths), `${response.status}`);
} catch (err) {
  check(`Buk serves its contract at ${TENANT}.buk.cl`, false, err instanceof Error ? err.message : err);
}

if (contract?.paths) {
  const writesOffered: string[] = [];
  for (const read of BUK_READS) {
    // Buk writes the pay-stub path with `{employee_id}`; every other one with
    // `{id}`. Match on the shape rather than on the spelling.
    const candidates = [read.path, read.path.replace('{id}', '{employee_id}')];
    const found = candidates.find((p) => contract!.paths![p]);
    const methods = found ? Object.keys(contract.paths[found]!) : [];
    check(
      `${read.name} → ${read.path} is a GET in Buk's contract`,
      methods.includes('get'),
      found ? methods.join(',') : 'not in the contract',
    );
    for (const method of methods) {
      if (method !== 'get') writesOffered.push(`${method.toUpperCase()} ${found}`);
    }
  }
  // The reason the read-only claim is worth proving at all: two of the five
  // paths this adapter holds are ALSO writes in Buk, at the very same address.
  // A modify-scoped key would reach them with a one-word change to a `curl`.
  // What stops it here is that no such word exists anywhere in the adapter —
  // measured on the wire in `server/src/buk.test.ts`.
  check(
    'Buk offers writes at these same paths, which is why the claim is not free',
    writesOffered.length > 0,
    writesOffered.join(', ') || 'none — this check has stopped meaning anything, read the contract',
  );
}

// ── §4 against the real Buk, with a key it does not know ─────────────────────
section('§4  through the real adapter, at the real Buk, with no key');

const client = new Client({ name: 'prove-buk-door', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', ADAPTER, '--tenant', TENANT],
  env: { ...process.env, BUK_API_KEY: 'not-a-real-key' } as Record<string, string>,
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

const refused = await call('employees', { page_size: 25 });
check('a real read with a key Buk does not know comes back as an error', refused.isError, refused.text.slice(0, 120));
check('the sentence sends the reader at the key, not at a stack trace', /BUK_API_KEY/.test(refused.text));
check('and keeps Buk’s own words', /no_authorize/.test(refused.text), refused.text.slice(0, 160));

const noSuchTool = await call('create_employee', { name: 'x' });
check('a write the model invents is refused by name', noSuchTool.isError && /reads only/.test(noSuchTool.text), noSuchTool.text);

const wrongDate = await call('vacations_available', { employee: '7', date: '2026-08-26' });
check(
  'the wrong date format is refused before the wire, naming the one it wants',
  wrongDate.isError && /DD-MM-YYYY/.test(wrongDate.text),
  wrongDate.text,
);

// Found in review and reproduced before it was closed: `..` as an employee
// built `/employees/../payroll_detail`, which every URL parser normalises to
// `/payroll_detail` — a path this adapter does not hold, in the company-wide
// liquidaciones family it leaves out by name.
const traversal = await call('pay_stubs', { employee: '..' });
check(
  'an employee that is really a path cannot walk out of the five',
  traversal.isError && /as an employee/.test(traversal.text),
  traversal.text,
);

// Every one of the five, at the real Buk. They all come back 401, which is
// the point: each tool really reaches Buk and is authenticated by it, so the
// list is a door rather than a decoration — and not one of them succeeds
// without a key.
const each = await Promise.all(
  BUK_READS.map(async (read) => ({
    name: read.name,
    result: await call(read.name, read.employeeParam ? { employee: '1' } : {}),
  })),
);
check(
  'all five reach the real Buk and are refused there by name',
  each.every(({ result }) => result.isError && /401/.test(result.text)),
  each.map(({ name, result }) => `${name}:${result.isError ? 'refused' : 'SUCCEEDED'}`).join(' '),
);

await client.close();

// What actually leaves on the wire — every read a GET carrying no body — is
// measured in `server/src/buk.test.ts` ("against a Buk that writes down what
// it was asked"), which runs in the ordinary suite. It is deliberately not
// repeated here: it needs a Buk on loopback, and this adapter takes a tenant
// and never a base address, exactly so that configuration cannot point a
// payroll token somewhere else.

// ── what to type into the form ───────────────────────────────────────────────
section('The add form, for a real tenant — this is the shape §1 just ran');
console.log(`  name        buk`);
console.log(`  label       Buk (read-only)`);
console.log(`  transport   stdio`);
console.log(`  command     npx`);
console.log(`  arguments   tsx`);
console.log(`              ${ADAPTER}`);
console.log(`              --tenant`);
console.log(`              <your subdomain>`);
console.log(`  secret      BUK_API_KEY = <the token>`);
console.log(`              ${BUK_KEY_SCOPE}`);

console.log(
  `\n${bad === 0 ? 'PASS' : 'FAIL'}  ${ran - bad}/${ran} — NOT proven end to end until one real HQ job reads a real Buk through this connection and is promoted.`,
);
process.exit(bad === 0 ? 0 : 1);
