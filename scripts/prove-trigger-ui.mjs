// D-248's control: does the fifth chip actually exist in the app?
//
//   node scripts/prove-trigger-ui.mjs      (needs `npm run serve`, msedge)
//
// What this proves, in the real app against the real server: that a sentence
// carrying "when mail from … arrives" turns the mail chip on and quotes the
// words back (D-184's doctrine, for mail); that the query field is typed, not
// filled; that the preview line answers — green, amber, or the Google wall —
// from the same route the poll rides; that the time controls and "schedule
// only" leave while the mail chip is on and Start reads Arm; that "not a
// trigger" turns it off; and that Arm creates a real trigger row on the level
// and says so, after which the row is removed again through the API.
//
// Costs nothing, queues nothing: an armed rule matching nobody fires nothing,
// and it is deleted before the script ends.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = 'http://localhost:5173';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

const password = /^\s*AGENTLINGS_PASSWORD\s*=\s*(.+)$/m
  .exec(readFileSync(path.join(ROOT, '.env'), 'utf8'))?.[1]
  ?.trim();

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const done = async (code) => {
  await browser.close();
  process.exit(code);
};

await page.goto(WEB, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
if (await page.locator('.login-screen').count()) {
  await page.fill('.login-field', password ?? '');
  await page.click('.login-go');
  await page.waitForTimeout(2500);
}

// The route has to be there, or the rest is theatre. Relative path through
// the Vite proxy: an absolute :4600 URL is cross-origin and D-239 refuses it.
const probe = await page.evaluate(async () => {
  const r = await fetch('/api/trigger/preview?q=from%3Aproof-nobody%40example.invalid');
  return { status: r.status, body: await r.json().catch(() => ({})) };
});
if (probe.status === 404) {
  console.error('the running server predates D-248 — restart it first');
  await done(1);
}
check(
  'the preview answers from inside the app — structured, or the Google wall',
  (probe.status === 200 && typeof probe.body.count === 'number') ||
    (probe.status === 502 && /Google/.test(probe.body.error ?? '')),
  `status ${probe.status} ${JSON.stringify(probe.body).slice(0, 80)}`,
);

// Into Training Ground.
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.ts-item')];
  (items.find((i) => i.textContent?.includes('CONTINUE')) ?? items[0])?.click();
});
await page.waitForTimeout(2000);
const levelId = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.lvl-card')];
  const wanted =
    cards.find((c) => c.textContent?.toLowerCase().includes('training')) ?? cards[0];
  wanted?.click();
  return null;
});
void levelId;
await page.waitForTimeout(3000);

const box = page.locator('.work-input').first();
check('the work bar is there', (await box.count()) === 1);

// ── the sentence turns the chip on, and only the chip ───────────────────────
await box.fill('When mail from the bank arrives, summarise input/mail.txt in three lines.');
await page.waitForTimeout(2500);
const chips = await page.evaluate(() =>
  [...document.querySelectorAll('.work-repeat .work-chip')].map((b) => [
    b.textContent?.trim(),
    b.classList.contains('on'),
  ]),
);
check(
  'the repeat row has a fifth chip, and the sentence turned it on',
  chips.some(([t, on]) => t === 'when mail arrives' && on === true),
  JSON.stringify(chips),
);
const readLine = (await page.locator('.work-cadence-read').innerText().catch(() => '')) ?? '';
check(
  'the words it read are quoted back',
  readLine.includes('When mail from the bank arrives') && readLine.includes('mail trigger'),
  readLine,
);
check(
  'the query field is empty — the sentence never fills it',
  (await page.locator('.work-trigger-q').inputValue().catch(() => 'MISSING')) === '',
);
check('no time control while the mail chip is on', (await page.locator('.work-repeat-time').count()) === 0);
check(
  'no "schedule only" link — Arm is the only thing Start can mean',
  !(await page.locator('.work-repeat').innerText()).includes('schedule only'),
);
const startLabel = (await page.locator('.work-bar button[type=submit]').innerText().catch(() => '')) ?? '';
check('Start reads Arm', /Arm/.test(startLabel), startLabel);
check(
  'and is disabled until a query is typed',
  await page.locator('.work-bar button[type=submit]').isDisabled().catch(() => false),
);
check(
  'the cost line is on the card before Arm',
  (await page.locator('.work-repeat').innerText()).includes('at most 10 firings a day'),
);

// ── the preview line, live ──────────────────────────────────────────────────
await page.locator('.work-trigger-q').fill('from:proof-nobody@example.invalid');
await page.waitForTimeout(2500);
const hit = await page.locator('.work-trigger-line.work-standing-hit').count();
const miss = await page.locator('.work-trigger-line.work-standing-miss').count();
const lineText =
  (await page
    .locator('.work-trigger-line.work-standing-hit, .work-trigger-line.work-standing-miss')
    .first()
    .innerText()
    .catch(() => '')) ?? '';
check('a preview line appears for the query', hit + miss === 1, lineText);
check(
  'and for a rule matching nobody it is the amber warning, or the Google wall',
  miss === 1 && (/nothing matched/.test(lineText) || /Google/.test(lineText)),
  lineText,
);
check(
  'Arm enables once a query is typed',
  !(await page.locator('.work-bar button[type=submit]').isDisabled()),
);

// ── "not a trigger" turns it off ────────────────────────────────────────────
await page.evaluate(() => {
  [...document.querySelectorAll('.work-cadence-read button')]
    .find((b) => b.textContent?.includes('not a trigger'))
    ?.click();
});
await page.waitForTimeout(400);
check(
  '"not a trigger" turns the chip off',
  (await page.locator('.work-trigger-q').count()) === 0 &&
    (await page.locator('.work-bar button[type=submit]').innerText()).trim() === 'Start',
);

// ── Arm creates a real row, and says so ─────────────────────────────────────
await page.evaluate(() => {
  [...document.querySelectorAll('.work-repeat .work-chip')]
    .find((b) => b.textContent?.trim() === 'when mail arrives')
    ?.click();
});
await page.waitForTimeout(300);
await page.locator('.work-trigger-q').fill('from:proof-nobody@example.invalid');
await page.waitForTimeout(600);
await page.locator('.work-bar button[type=submit]').click();
await page.waitForTimeout(2000);
const confirm = (await page.locator('.work-scheduled').innerText().catch(() => '')) ?? '';
check(
  'Arm confirms with the rule in words and names no first run',
  confirm.includes('when mail matching') && !confirm.includes('first run'),
  confirm,
);
check('the sentence box is cleared', (await box.inputValue()) === '');

// The row is real: read it through the API, then remove it.
const lid = await page.evaluate(() => location.hash.replace(/^#\/?/, '').split('/').pop() ?? '');
const rows = await page.evaluate(async () => {
  const levels = await (await fetch('/api/levels')).json();
  const list = Array.isArray(levels) ? levels : (levels.levels ?? []);
  for (const l of list) {
    const r = await (await fetch(`/api/levels/${l.id}/schedules`)).json();
    const mine = (r.schedules ?? []).filter((s) => s.trigger?.mail === 'from:proof-nobody@example.invalid');
    if (mine.length) return { lid: l.id, ids: mine.map((s) => s.id) };
  }
  return { lid: null, ids: [] };
});
void lid;
check('the row exists on the level with its trigger', rows.ids.length === 1, JSON.stringify(rows));
if (rows.lid) {
  for (const id of rows.ids) {
    await page.evaluate(
      async ({ lid, id }) => fetch(`/api/levels/${lid}/schedules/${id}`, { method: 'DELETE' }),
      { lid: rows.lid, id },
    );
  }
  const left = await page.evaluate(async (lid) => {
    const r = await (await fetch(`/api/levels/${lid}/schedules`)).json();
    return (r.schedules ?? []).filter((s) => s.trigger?.mail === 'from:proof-nobody@example.invalid').length;
  }, rows.lid);
  check('and is removed again — the level is left as found', left === 0);
}

console.log('');
console.log(bad === 0 ? 'all PASS' : `${bad} FAILED`);
await done(bad === 0 ? 0 : 1);
