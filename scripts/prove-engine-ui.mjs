// The other half of #32's engine line: does a person actually SEE it?
//
//   node scripts/prove-engine-ui.mjs    (needs the web on :5173, and msedge)
//
// `engineIdleNote` is pinned in four states and 5/5 mutants, and none of that
// says the sentence reaches a screen. This ticket exists because a row was
// complete in the catalog, the type, the route, the store and both grant seams
// and rendered on no board at all (D-277) — a fault no unit test could see. A
// line added to fix a reporting gap is exactly the kind that can be added to
// a branch nobody renders.
//
// It switches the engine OFF to reach the state, reads the row, and switches
// it back on — through the app's own toggle, the way a person would, so the
// restore is the same path as the change. The install spends nothing while it
// is off, and the `finally` puts it back on every path.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = 'http://localhost:5173';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENTENCE = 'The crew keeps doing pretend work until you switch this on.';

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
let turnedOff = false;

// Reads the engine's row: whether the switch is on, and the note under it.
const readRow = () =>
  page.evaluate(() => {
    const heads = [...document.querySelectorAll('.sect')];
    const head = heads.find((h) => h.textContent?.trim() === 'engine');
    if (!head) return { found: false };
    const seen = [];
    let el = head.nextElementSibling;
    while (el && !el.classList.contains('sect')) {
      seen.push(el);
      el = el.nextElementSibling;
    }
    const toggle = seen.map((e) => e.querySelector('input[type="checkbox"]')).find(Boolean);
    return {
      found: true,
      on: toggle ? toggle.checked : null,
      idle: seen.some((e) => e.querySelector('.engine-idle') || e.classList.contains('engine-idle')),
      text: seen.map((e) => e.textContent ?? '').join(' · '),
    };
  });

const openSettings = async () => {
  await page.evaluate(() => {
    [...document.querySelectorAll('.ts-item')].find((i) => i.textContent?.includes('SETTINGS'))?.click();
  });
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    [...document.querySelectorAll('.p-tab')].find((t) => t.textContent?.startsWith('app'))?.click();
  });
  await page.waitForTimeout(700);
};

// The engine's own toggle, clicked the way a person clicks it.
const clickToggle = () =>
  page.evaluate(() => {
    const head = [...document.querySelectorAll('.sect')].find((h) => h.textContent?.trim() === 'engine');
    let el = head?.nextElementSibling;
    while (el && !el.classList.contains('sect')) {
      const box = el.querySelector('input[type="checkbox"]');
      if (box) {
        box.click();
        return true;
      }
      el = el.nextElementSibling;
    }
    return false;
  });

try {
  await page.goto(WEB, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  if (await page.locator('.login-screen').count()) {
    await page.fill('.login-field', password ?? '');
    await page.click('.login-go');
    await page.waitForTimeout(2500);
  }
  // A fresh profile opens on the first-run tour, which covers the screen.
  if (await page.locator('.tour').count()) {
    await page.evaluate(() => {
      [...document.querySelectorAll('.tour button')].find((b) => /skip/i.test(b.textContent ?? ''))?.click();
    });
    await page.waitForTimeout(600);
  }
  check('reached the app', (await page.locator('.title-screen').count()) === 1);

  await openSettings();
  check('Settings opened on the app board', (await page.locator('.modal.settings').count()) === 1);

  const on = await readRow();
  check('the engine has a row a person can see', on.found === true);
  check('it starts switched on', on.on === true, `switch ${on.on}`);
  check('and says nothing about pretend work while it is running for real', on.idle === false);

  // ── the state the line exists for ──────────────────────────────────────────
  check('the engine toggle was clickable', await clickToggle());
  turnedOff = true;
  await page.waitForTimeout(1200);
  const off = await readRow();
  check('the switch is now off', off.on === false, `switch ${off.on}`);
  check('the line appears', off.idle === true);
  check('and it says what is happening, not just what to do', off.text.includes(SENTENCE), SENTENCE);

  // Amber, not the dim of an aside nor the pink of an error.
  const colour = await page.evaluate(() => {
    const el = document.querySelector('.engine-idle');
    return el ? getComputedStyle(el).color : null;
  });
  check('rendered in the notice amber, not dim grey or error pink', colour === 'rgb(255, 184, 108)', colour);

  // ── back on, through the same control ─────────────────────────────────────
  await clickToggle();
  turnedOff = false;
  await page.waitForTimeout(1200);
  const back = await readRow();
  check('switching it back on clears the line', back.on === true && back.idle === false, `switch ${back.on}, line ${back.idle}`);
} catch (e) {
  console.error('threw:', e);
  bad++;
} finally {
  if (turnedOff) {
    // The browser is the only thing that turned it off, so the browser turns
    // it back on — and if that fails the operator is told in plain words
    // rather than left with a quietly pretending install.
    try {
      await clickToggle();
      await page.waitForTimeout(1200);
      const end = await readRow();
      if (end.on !== true) console.error('LEFT OFF — switch the engine back on in Settings by hand');
    } catch {
      console.error('LEFT OFF — switch the engine back on in Settings by hand');
    }
  }
  await browser.close();
  console.log(bad === 0 ? '\nALL PASS' : `\n${bad} FAILED`);
  process.exitCode = bad === 0 ? 0 : 1;
}
