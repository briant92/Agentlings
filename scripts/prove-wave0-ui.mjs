// W0.7's half, which `prove-wave0.mjs` structurally cannot reach: does the
// real app show the login screen, does logging in through it get you into the
// world, and does losing the session mid-app put you back?
//
//   node scripts/prove-wave0-ui.mjs        (needs `npm run serve`, and msedge)
//
// One note that cost a failing run and is the reason this file exists at all:
// a mid-app 401 has to be triggered by an APP-originated call. A
// `page.evaluate(() => fetch(...))` bypasses `api()`, which is the only place
// that recognises the gate's 401 — so it proves nothing and reads as a defect.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = 'http://localhost:5173';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const password = /^\s*AGENTLINGS_PASSWORD\s*=\s*(.+)$/m
  .exec(readFileSync(path.join(ROOT, '.env'), 'utf8'))[1]
  .trim();

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) bad++;
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();

// 1. cold visit -> the login screen, not the title screen
await page.goto(WEB, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
check('cold visit renders the login screen', (await page.locator('.login-screen').count()) === 1);
check('the title screen is NOT rendered behind it', (await page.locator('.title-screen').count()) === 0);
check('the password field is focused', await page.evaluate(() => document.activeElement?.className === 'login-field'));
check(
  'the field is type=password, so it is not shoulder-readable',
  (await page.locator('.login-field').getAttribute('type')) === 'password',
);

// 2. a wrong password says so and stays put
await page.fill('.login-field', 'not-the-password');
await page.click('.login-go');
await page.waitForTimeout(1200);
const err = (await page.locator('.login-error').textContent())?.trim();
check('a wrong password shows the refusal', Boolean(err), JSON.stringify(err));
check('and stays on the login screen', (await page.locator('.login-screen').count()) === 1);
check('and clears the field', (await page.inputValue('.login-field')) === '');

// 3. the right one gets in
await page.fill('.login-field', password);
await page.click('.login-go');
await page.waitForTimeout(2500);
check('the right password leaves the login screen', (await page.locator('.login-screen').count()) === 0);
check('and the title screen appears', (await page.locator('.title-screen').count()) === 1);

// 4. the cookie is real, HttpOnly, and script cannot read it
const cookies = await page.context().cookies();
const session = cookies.find((c) => c.name === 'agentlings_session');
check('a session cookie was set', Boolean(session));
check('it is HttpOnly', session?.httpOnly === true);
check('it is SameSite=Lax', session?.sameSite === 'Lax');
check('it has no Secure over plain http (R-04)', session?.secure === false);
check(
  'page script cannot read it',
  !(await page.evaluate(() => document.cookie)).includes('agentlings_session'),
  JSON.stringify(await page.evaluate(() => document.cookie)),
);

// 5. a reload stays in — the cookie is doing the work, not React state
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
check('a reload stays signed in', (await page.locator('.login-screen').count()) === 0);

// 6. into a level, and the socket must actually feed it
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.ts-item')];
  (items.find((i) => i.textContent?.includes('START')) ?? items[0]).click();
});
await page.waitForTimeout(2500);
const inPicker = await page.locator('.select-screen, .lv-card, .level-card').count();
check('the level picker loaded behind the gate', inPicker > 0, `${inPicker} node(s)`);

// 7. losing the session mid-app drops you back to the login screen.
// Triggered the way the APP would: enter a level, whose panels call api().
// A raw page.evaluate(fetch(...)) proves nothing here - it bypasses api(),
// which is the only thing that recognises the gate's 401.
await page.context().clearCookies();
await page.evaluate(() => document.querySelector('.lvl-card:not(.new)')?.click());
await page.waitForTimeout(3000);
check('losing the cookie returns to the login screen', (await page.locator('.login-screen').count()) === 1);

await browser.close();
console.log(bad === 0 ? '\nUI PROVEN' : `\nNOT PROVEN — ${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
