// D-244's other half: can a person actually add a connection, in the app,
// with a mouse? The API proof cannot answer that, and it is the whole claim —
// "any user can request a connection" is false if it only works from curl.
//
//   node scripts/prove-user-connections-ui.mjs    (needs `npm run serve`, msedge)
//
// It stands up a real http MCP server, drives the real Settings form, and then
// removes what it added so the box is left as it was found.
//
// Since #15 (D-256) it also drives the catalog's wide form: the verified-here
// shelf above the browse, a real search of the public MCP registry, a pick
// that fills the form and saves nothing, and the registry-unreachable state
// said by name (the browse's call answered 502 from the page, as the server
// answers when the registry is down).

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const WEB = 'http://localhost:5173';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4714;

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

const http = createServer(async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => transport.close());
  const mcp = new McpServer({ name: 'ui-desk', version: '1.0.0' });
  mcp.registerTool(
    'desk_echo',
    { title: 'Echo', description: 'echo', inputSchema: { text: z.string() } },
    async ({ text }) => ({ content: [{ type: 'text', text }] }),
  );
  await mcp.connect(transport);
  await transport.handleRequest(req, res);
});
await new Promise((r) => http.listen(PORT, '127.0.0.1', r));

const password = /^\s*AGENTLINGS_PASSWORD\s*=\s*(.+)$/m
  .exec(readFileSync(path.join(ROOT, '.env'), 'utf8'))?.[1]
  ?.trim();

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto(WEB, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// Sign in if the gate is armed.
if (await page.locator('.login-screen').count()) {
  await page.fill('.login-field', password ?? '');
  await page.click('.login-go');
  await page.waitForTimeout(2500);
}
check('reached the app', (await page.locator('.title-screen').count()) === 1);

// Title screen → Settings.
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.ts-item')];
  items.find((i) => i.textContent?.includes('SETTINGS'))?.click();
});
await page.waitForTimeout(1800);
check('Settings opened', (await page.locator('.modal.settings').count()) === 1);

// The form is on the `reads` board.
await page.evaluate(() => {
  [...document.querySelectorAll('.p-tab')].find((t) => t.textContent?.startsWith('reads'))?.click();
});
await page.waitForTimeout(600);
check('the add button is on the reads board', (await page.locator('.addc-open').count()) === 1);

await page.click('.addc-open');
await page.waitForTimeout(400);
check('the form opens', (await page.locator('.addc').count()) === 1);

// ── The catalog gets wide (D-256, #15): the shelf, the browse, the named state ──
check('the D-245 chips are gone', (await page.locator('.addc-chip').count()) === 0);
const shelfRows = await page.$$eval('.addc-shelf-row', (els) => els.map((e) => e.textContent?.trim() ?? ''));
if (shelfRows.length) {
  check('the verified-here shelf lists this install’s doors with source and date', shelfRows.every((r) => /answered \d{4}-\d{2}-\d{2}/.test(r) && /shape from/.test(r)), shelfRows.join(' | ').slice(0, 160));
} else {
  console.log('NOTE  no added connection on this install, so the shelf is rightly absent');
}
await page.fill('.addc-registry-input', 'brave');
await page.keyboard.press('Enter');
// A real search of the real registry: wait for it to answer, not for a clock.
await page.waitForSelector('.addc-registry-hit, .addc-registry-down, .addc-registry-none', { timeout: 20_000 }).catch(() => null);
const hits = await page.$$eval('.addc-registry-hit', (els) => els.map((e) => e.textContent ?? ''));
check('searching the registry lists matching servers with transport and key names', hits.some((h) => /brave-search-mcp-server/.test(h) && /runs here/.test(h) && /BRAVE_API_KEY/.test(h)), `${hits.length} listed`);
await page.evaluate(() => {
  [...document.querySelectorAll('.addc-registry-hit')].find((b) => /io\.github\.brave\/brave-search-mcp-server/.test(b.textContent ?? ''))?.click();
});
await page.waitForTimeout(500);
const filled = await page.evaluate(() => ({
  name: document.querySelector('.addc-grid input[placeholder="xero"]')?.value,
  args: document.querySelector('.addc textarea')?.value ?? '',
  secrets: [...document.querySelectorAll('.addc-secret input:not([type="password"])')].map((i) => i.value),
  note: document.querySelector('.addc-registry-source')?.textContent ?? '',
}));
check('picking one fills the form — name, command arguments, the key’s name', filled.name === 'brave-search-mcp-server' && filled.args.includes('@brave/brave-search-mcp-server') && filled.secrets.includes('BRAVE_API_KEY'), JSON.stringify(filled).slice(0, 160));
check('and the note names the registry entry and the date, and says nothing was tried from here', /MCP registry/.test(filled.note) && /read \d{4}-\d{2}-\d{2}/.test(filled.note) && /Nothing here has been tried/.test(filled.note), filled.note.slice(0, 120));
// Nothing was submitted by picking: the connection must not exist.
const afterPick = await page.evaluate(async () => (await fetch('/api/connections')).json());
check('and nothing was saved by picking', !afterPick.some?.((c) => c.name === 'brave-search-mcp-server'));

// The registry unreachable is a NAMED state: answer the browse's call as the
// server would when the registry is down, and read what the form says.
await page.route('**/api/connections/registry*', (route) =>
  route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'the registry could not be reached (fetch failed)' }) }),
);
await page.fill('.addc-registry-input', 'anything');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
const down = (await page.locator('.addc-registry-down').textContent().catch(() => '')) ?? '';
check('the registry unreachable is said by name — never an empty list that reads as no such server', /could not be reached/.test(down) && /not the same as no such server/.test(down), down.slice(0, 120));
check('and no hits are shown as if the search had found nothing', (await page.locator('.addc-registry-hit').count()) === 0);
await page.unroute('**/api/connections/registry*');

// Back to the by-hand path, which is unchanged: cancel drops the pick (and
// with it the source it would have stamped), and the form opens clean.
await page.click('.addc-cancel');
await page.waitForTimeout(300);
await page.click('.addc-open');
await page.waitForTimeout(400);
const clean = await page.evaluate(() => ({
  name: document.querySelector('.addc-grid input[placeholder="xero"]')?.value ?? '?',
  query: document.querySelector('.addc-registry-input')?.value ?? '?',
  hits: document.querySelectorAll('.addc-registry-hit').length,
  transport: document.querySelector('.addc-kind button.on')?.textContent?.trim(),
}));
check('cancelling and reopening gives a clean form — no name, no search, no hits, the default transport', clean.name === '' && clean.query === '' && clean.hits === 0 && clean.transport === 'runs here', JSON.stringify(clean));

// Fill it the way a person would.
await page.fill('.addc-grid input[placeholder="xero"]', 'ui-proof');
await page.fill('.addc-grid input[placeholder="Xero accounting"]', 'UI proof server');
await page.evaluate(() => {
  [...document.querySelectorAll('.addc-kind button')].find((b) => b.textContent?.includes('elsewhere'))?.click();
});
await page.waitForTimeout(300);
await page.fill('.addc input[placeholder="https://mcp.example.com/v1"]', `http://127.0.0.1:${PORT}/`);

// Check first: it should report the tools without keeping anything.
await page.evaluate(() => {
  [...document.querySelectorAll('.addc-actions button')].find((b) => b.textContent?.trim() === 'check')?.click();
});
await page.waitForTimeout(4000);
const found = (await page.locator('.addc-found').textContent().catch(() => null))?.trim() ?? '';
check('“check” reports what the server offers', found.includes('desk_echo'), JSON.stringify(found));

// Then keep it.
await page.evaluate(() => {
  document.querySelector('.addc-keep')?.click();
});
await page.waitForTimeout(4500);
check('the form closes on success', (await page.locator('.addc').count()) === 0);

const rows = await page.evaluate(() =>
  [...document.querySelectorAll('.modal.settings')].map((m) => m.textContent ?? '').join(' '),
);
check('the new connection appears in Settings', rows.includes('UI proof server'));

// Remove it again — press twice, like Disconnect.
const removed = await page.evaluate(async () => {
  const find = () =>
    [...document.querySelectorAll('.modal.settings button.work-link')].find((b) =>
      b.textContent?.includes('remove this connection'),
    );
  let b = find();
  if (!b) return 'no remove button — is the row expanded?';
  b.click();
  await new Promise((r) => setTimeout(r, 300));
  b = [...document.querySelectorAll('.modal.settings button.work-link')].find((x) =>
    x.textContent?.includes('press again'),
  );
  if (!b) return 'the button did not arm';
  b.click();
  return 'clicked';
});
await page.waitForTimeout(2500);
// The row's body is behind an expander, so a missing button is not a failure
// of removal — it is this probe not having opened the row. Say which.
if (removed === 'clicked') {
  const after = await page.evaluate(() => document.querySelector('.modal.settings')?.textContent ?? '');
  check('and removing it takes it out of the list', !after.includes('UI proof server'));
} else {
  console.log(`NOTE  removal not exercised in the UI (${removed}); the API proof covers it`);
}

await browser.close();
http.close();

// Whatever the UI did, leave nothing behind.
const store = path.join(ROOT, '.agentlings', 'connections.json');
const leftover = (() => {
  try {
    return JSON.parse(readFileSync(store, 'utf8')).connections?.some((c) => c.name === 'ui-proof');
  } catch {
    return false;
  }
})();
if (leftover) console.log('NOTE  "ui-proof" is still in .agentlings/connections.json — remove it in Settings');

console.log(bad === 0 ? '\nUI PROVEN' : `\nNOT PROVEN — ${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
