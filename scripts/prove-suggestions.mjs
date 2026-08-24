// The live proof D-245 owes.
//
//   node scripts/prove-suggestions.mjs
//
// Two halves. The API half checks what is offered and, more importantly, that
// a suggestion whose name is already taken stops being offered — proven by
// actually taking one, with a local MCP server standing in for the real thing,
// since the name is all the filter looks at.
//
// The UI half is the one that matters: a chip has to FILL THE FORM, and it has
// to say plainly that the shape came from a vendor's page and has not been
// tried from here. A suggestion that quietly looked like a verified connection
// would be the exact claim D-245 exists to avoid making.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const BASE = 'http://127.0.0.1:4600';
const WEB = 'http://localhost:5173';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4715;

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

const password = /^\s*AGENTLINGS_PASSWORD\s*=\s*(.+)$/m
  .exec(readFileSync(path.join(ROOT, '.env'), 'utf8'))?.[1]
  ?.trim();

let cookie = '';
if (password) {
  const res = await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
}
const call = async (url, init = {}) => {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const first = await call('/api/connections/suggestions');
if (first.status === 404) {
  console.error('the running server predates D-245 — restart it first');
  process.exit(1);
}

// ── the API half ────────────────────────────────────────────────────────────
const offered = first.body.suggestions ?? [];
check('the route answers with the shipped list', offered.length >= 4, `${offered.length} offered`);
check(
  'each says where its shape was read and links the page',
  offered.every((s) => s.source && s.docs),
);
check('none carries tools — those come from the server', offered.every((s) => !('tools' in s)));
check(
  'both transports are represented',
  new Set(offered.map((s) => s.transport)).size === 2,
  offered.map((s) => `${s.name}:${s.transport}`).join(' '),
);
check(
  'no shipped connection name is offered',
  !offered.some((s) => ['web', 'github', 'render', 'browser', 'search'].includes(s.name)),
);

// Take one of the names with a stand-in server, and watch it stop being offered.
const target = offered.find((s) => s.transport === 'stdio')?.name;
const http = createServer(async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => transport.close());
  const mcp = new McpServer({ name: 'stand-in', version: '1.0.0' });
  mcp.registerTool('x', { title: 'X', description: 'x', inputSchema: { t: z.string() } }, async () => ({
    content: [{ type: 'text', text: 'ok' }],
  }));
  await mcp.connect(transport);
  await transport.handleRequest(req, res);
});
await new Promise((r) => http.listen(PORT, '127.0.0.1', r));

const taken = await call('/api/connections', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    draft: { name: target, label: 'stand-in', transport: 'http', url: `http://127.0.0.1:${PORT}/` },
  }),
});
check(`took the name "${target}" with a stand-in server`, taken.status === 201, `${taken.status}`);
const after = (await call('/api/connections/suggestions')).body.suggestions ?? [];
check(
  'a taken name stops being offered — no dead ends in the list',
  !after.some((s) => s.name === target),
  `${after.length} now offered`,
);
await call(`/api/connections/${target}`, { method: 'DELETE' });
const restored = (await call('/api/connections/suggestions')).body.suggestions ?? [];
check('and comes back once the name is free', restored.some((s) => s.name === target));

// ── the UI half ─────────────────────────────────────────────────────────────
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto(WEB, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
if (await page.locator('.login-screen').count()) {
  await page.fill('.login-field', password ?? '');
  await page.click('.login-go');
  await page.waitForTimeout(2500);
}
await page.evaluate(() => {
  [...document.querySelectorAll('.ts-item')].find((i) => i.textContent?.includes('SETTINGS'))?.click();
});
await page.waitForTimeout(1800);
await page.evaluate(() => {
  [...document.querySelectorAll('.p-tab')].find((t) => t.textContent?.startsWith('reads'))?.click();
});
await page.waitForTimeout(500);
await page.click('.addc-open');
await page.waitForTimeout(1500);

const chips = await page.$$eval('.addc-chip', (els) => els.map((e) => e.textContent?.trim()));
check('the chips are there', chips.length >= 4, chips.join(' · '));
const beforeNote = (await page.locator('.addc-suggest .addc-note').textContent().catch(() => '')) ?? '';
check(
  'and say up front that nothing was tried from here',
  /never tried from here/i.test(beforeNote),
  JSON.stringify(beforeNote.slice(0, 80)),
);

// Click Xero — a stdio one, so the command and argument fields must fill.
await page.evaluate(() => {
  [...document.querySelectorAll('.addc-chip')].find((b) => /xero/i.test(b.textContent ?? ''))?.click();
});
await page.waitForTimeout(600);
const filled = await page.evaluate(() => ({
  name: document.querySelector('.addc-grid input[placeholder="xero"]')?.value,
  command: [...document.querySelectorAll('.addc input')].map((i) => i.value).join('|'),
  args: document.querySelector('.addc textarea')?.value ?? '',
  secrets: [...document.querySelectorAll('.addc-secret input[type="text"], .addc-secret input:not([type])')].map(
    (i) => i.value,
  ),
  note: document.querySelector('.addc-suggest .addc-note')?.textContent ?? '',
}));
check('choosing one fills the name', filled.name === 'xero', JSON.stringify(filled.name));
check(
  'and the command and arguments',
  filled.args.includes('@xeroapi/xero-mcp-server'),
  JSON.stringify(filled.args),
);
check(
  'and names the keys it will need',
  filled.secrets.includes('XERO_CLIENT_ID') && filled.secrets.includes('XERO_CLIENT_SECRET'),
  JSON.stringify(filled.secrets),
);
check(
  'and the note now names the source and offers their instructions',
  /repository|documentation/i.test(filled.note) && /check it against theirs/i.test(filled.note),
  JSON.stringify(filled.note.slice(0, 90)),
);
// Nothing was submitted by choosing: the connection must not exist.
const still = (await call('/api/connections')).body ?? [];
check('and nothing was saved by choosing one', !still.some?.((c) => c.name === 'xero'));

await browser.close();
http.close();
console.log(bad === 0 ? '\nSUGGESTIONS PROVEN' : `\nNOT PROVEN — ${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
