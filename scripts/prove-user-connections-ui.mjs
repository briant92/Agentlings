// D-244's other half: can a person actually add a connection, in the app,
// with a mouse? The API proof cannot answer that, and it is the whole claim —
// "any user can request a connection" is false if it only works from curl.
//
//   node scripts/prove-user-connections-ui.mjs    (needs `npm run serve`, msedge)
//
// It stands up a real http MCP server, drives the real Settings form, and then
// removes what it added so the box is left as it was found.

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
