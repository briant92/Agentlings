// D-246's other half: does the control actually exist in the app?
//
//   node scripts/prove-standing-ui.mjs      (needs `npm run serve`, msedge)
//
// What this can prove: that the "reads each time:" row appears once a repeat
// is set and not before, that the old dead-end copy is gone, and — the point
// of the whole control — that a row reports what its rule matches RIGHT NOW,
// in the app, against a real folder.
//
// What it CANNOT prove, and does not pretend to: the "+ add a folder" button
// opens the native Windows folder dialog, which the server spawns and no
// browser can drive. So the row is seeded through the same route the button
// uses, and the picker itself needs a human click. A test backdoor in the
// production code to fake that would be proving our own stub.

import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

// A books folder for the live match to find something in.
const books = mkdtempSync(path.join(tmpdir(), 'books-ui-'));
const write = (name, body, secondsAgo = 0) => {
  const f = path.join(books, name);
  writeFileSync(f, body, 'utf8');
  const when = new Date(Date.now() - secondsAgo * 1000);
  utimesSync(f, when, when);
};
write('estado-cuenta-2026-07.xlsx', 'july', 6000);
write('estado-cuenta-2026-08.xlsx', 'august', 60);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const done = async (code) => {
  await browser.close();
  rmSync(books, { recursive: true, force: true });
  process.exit(code);
};

await page.goto(WEB, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
if (await page.locator('.login-screen').count()) {
  await page.fill('.login-field', password ?? '');
  await page.click('.login-go');
  await page.waitForTimeout(2500);
}

// The route has to be there, or the rest is theatre.
const probe = await page.evaluate(async (dir) => {
  const r = await fetch(`/api/standing/match?dir=${encodeURIComponent(dir)}&match=estado`);
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, books);
if (probe.status === 404) {
  console.error('the running server predates the live-match route — restart it first');
  await done(1);
}
check(
  'the live match answers from inside the app, cookie and all',
  probe.body.name === 'estado-cuenta-2026-08.xlsx',
  JSON.stringify(probe.body),
);

// Into a level, then type a sentence so the plan (and the repeat row) appear.
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.ts-item')];
  (items.find((i) => i.textContent?.includes('CONTINUE')) ?? items[0])?.click();
});
await page.waitForTimeout(2000);
// STARTing would make a level; CONTINUE lands on the select screen, where the
// levels are .lvl-card. Training Ground is the one with a crew.
const opened = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.lvl-card')];
  const wanted =
    cards.find((c) => c.textContent?.toLowerCase().includes('training')) ?? cards[0];
  wanted?.click();
  return cards.map((c) => c.querySelector('.lvl-name')?.textContent ?? '?');
});
await page.waitForTimeout(3000);

const box = page.locator('.work-input').first();
if ((await box.count()) === 0) {
  console.error(`could not reach a level's work bar — cards seen: ${opened.join(', ') || 'none'}`);
  await done(1);
}
check('opened a level and found the work bar', true);
await box.fill('Reconcile input/statement.xlsx against input/ledger.xlsx');
await page.waitForTimeout(2500);

// `.work-repeat` alone stopped meaning "the repeats row" at #16 (D-264),
// which put a second paragraph in that class — the *watch* tick, shown while
// no cadence is chosen and a supervised door is ready. Measured on this
// install: two matches, `watch:` and `repeats:`.
//
// It broke this check loudly and the next one **silently**, which is the part
// worth keeping: `innerText()` on a two-match locator throws in strict mode,
// the `.catch(() => '')` below turned that into an empty string, and an empty
// string does not include "runs once" — so the attachment check has been
// passing on nothing at all for three tickets. Named by what it is rather
// than by what it is not, so a third row in the class does not silently
// rejoin it.
const repeatRow = page.locator('.work-repeat').filter({ hasText: /repeats:|runs once/ });
check('the repeat row is there once a sentence is typed', (await repeatRow.count()) === 1);
check(
  'the dead-end copy about attachments is gone with no files attached',
  !(await repeatRow.innerText().catch(() => '')).includes('runs once'),
);
check(
  'no standing row before a repeat is chosen',
  (await page.locator('.work-standing').count()) === 0,
);

// Choose a cadence — the control should appear with it.
await page.evaluate(() => {
  [...document.querySelectorAll('.work-repeat .work-chip')]
    .find((b) => b.textContent?.trim() === 'monthly')
    ?.click();
});
await page.waitForTimeout(600);
check('choosing a cadence reveals the standing control', (await page.locator('.work-standing').count()) === 1);
const standingText = (await page.locator('.work-standing').innerText().catch(() => '')) ?? '';
check('it says what it is for', standingText.includes('reads each time'), JSON.stringify(standingText.slice(0, 60)));
check('and offers the picker', standingText.includes('add a folder'));

// The native dialog is the one thing out of reach, so it is mocked at the
// NETWORK boundary — not in the app. /api/pick-folder answers a real folder,
// and everything downstream of it is the real component doing real work
// against the real match route. Nothing in production knows this is a test.
let pickCalls = 0;
await page.route('**/api/pick-folder', async (route) => {
  pickCalls += 1;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ path: books }),
  });
});

await page.evaluate(() => {
  [...document.querySelectorAll('.work-standing button')]
    .find((b) => b.textContent?.includes('add a folder'))
    ?.click();
});
await page.waitForTimeout(1500);
check('the button really asks the server for a folder', pickCalls === 1, `${pickCalls} calls`);
check('a row appears for it', (await page.locator('.work-standing-row').count()) === 1);
check(
  'the row names the folder it was given',
  (await page.locator('.work-standing-dir').innerText().catch(() => '')) === books,
);
check(
  'the landing name is prefilled from the newest file, not left blank',
  (await page.locator('.work-standing-as').inputValue().catch(() => '')) === 'estado-cuenta-2026-08.xlsx',
  await page.locator('.work-standing-as').inputValue().catch(() => ''),
);

// THE point of the control: the row says what it matches, right now.
check(
  'the row reports its live match in green',
  (await page.locator('.work-standing-hit').count()) === 1 &&
    (await page.locator('.work-standing-hit').innerText()).includes('estado-cuenta-2026-08.xlsx'),
  await page.locator('.work-standing-hit').innerText().catch(() => '(none)'),
);

// A filter that finds nothing has to LOOK different, or the control is decoration.
await page.locator('.work-standing-match').fill('nosuchthing');
await page.waitForTimeout(1500);
check(
  'a filter matching nothing turns amber and says so',
  (await page.locator('.work-standing-miss').count()) === 1,
  await page.locator('.work-standing-miss').innerText().catch(() => '(none)'),
);

// And narrowing to a real prefix goes back to green, on the right file.
await page.locator('.work-standing-match').fill('estado');
await page.waitForTimeout(1500);
check(
  'a filter that matches goes green again on the newest match',
  (await page.locator('.work-standing-hit').innerText().catch(() => '')).includes('2026-08'),
  await page.locator('.work-standing-hit').innerText().catch(() => '(none)'),
);

// The row can be removed, or a mistake would be permanent.
await page.evaluate(() => {
  document.querySelector('.work-standing-row button')?.click();
});
await page.waitForTimeout(400);
check('the row can be removed', (await page.locator('.work-standing-row').count()) === 0);

console.log('');
console.log('NOT PROVEN HERE — one thing, and it needs a human:');
console.log('  · that the native Windows folder dialog actually opens and returns a path.');
console.log('    /api/pick-folder is mocked at the network boundary above, so everything');
console.log('    downstream of it is real. pickFolder itself is unchanged since D-102.');

console.log('');
console.log(bad === 0 ? 'all PASS' : `${bad} FAILED`);
await done(bad === 0 ? 0 : 1);
