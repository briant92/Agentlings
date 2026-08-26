// The live proof #22 owes: the desk says what it refuses.
//
//   node scripts/prove-refusal-ui.mjs      (needs `npm run serve`, msedge)
//
// What the unit tests cannot reach: whether the line is actually on the bar.
// `refusalRows` is unit-tested and `refusalDesk` is unit-tested, but neither
// knows if the route carries the rows or the component paints them — the
// D-177/D-178 gap, and the shape #16 and #17 were each caught by. So this
// types the sentences into the real box on the real server and reads the
// rendered DOM back.
//
// What it proves:
//   money      — "pay the deposit …" puts one amber line under the plan, in
//                the job board's own words, with the tail under it
//   verbatim   — that line's reason is byte-for-byte the string
//                `BOUNDARIES.why` holds in server/src/coverage.ts, read off
//                disk here rather than retyped, so a drift between the desk
//                and the board fails this check
//   does       — and the line says what the crew WILL do, which the board's
//                sentence never names
//   two rows   — "pay … then deploy …" is two lines and still ONE tail
//   Start      — enabled throughout, and the tail says so (D-259: the desk
//                warns, it does not block)
//   ordinary   — a sentence that claims nothing gets no line and no tail
//   whatsapp   — a never-channel gets its ask card and NO refusal line: the
//                card has said it since D-079 and says it better
//   not counted — refusals.jsonl is byte-identical before and after all of
//                the above (D-259: the plan re-runs on every keystroke and is
//                never the count). This is the acceptance box that matters
//                most, because every sentence here is a refusing one.
//
// Costs nothing and queues nothing: Start is never pressed. Nothing is
// created, so nothing is cleaned up.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = 'http://localhost:5173';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const METER = path.join(ROOT, '.agentlings', 'refusals.jsonl');

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

// The board's own sentences, read off the source rather than retyped — the
// whole point of the verbatim check is that no second copy exists here either.
const coverage = readFileSync(path.join(ROOT, 'server/src/coverage.ts'), 'utf8');
const whyOf = (id) => {
  const block = coverage.slice(coverage.indexOf(`id: '${id}'`));
  const m = /why:\s*'((?:[^'\\]|\\.)*)'/.exec(block.slice(0, block.indexOf('},')));
  return m ? m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\') : null;
};
const WHY_MONEY = whyOf('money');
const WHY_ACT = whyOf('act');
check('the board’s money reason was read off coverage.ts', !!WHY_MONEY, WHY_MONEY ?? 'NOT FOUND');
check('the board’s act reason was read off coverage.ts', !!WHY_ACT, WHY_ACT ?? 'NOT FOUND');
if (!WHY_MONEY || !WHY_ACT) {
  console.log('');
  console.log('cannot proceed — the board’s table did not parse');
  process.exit(1);
}

// The meter as it stands. Every sentence typed below is a refusing one, so
// this file is the control: it must not move.
const meterBefore = existsSync(METER) ? readFileSync(METER, 'utf8') : '';

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

// The route has to carry the rows, or the rest is theatre — and this also
// tells a stale server apart from a broken component.
const probe = await page.evaluate(async () => {
  const levels = await (await fetch('/api/levels')).json();
  const lid = (levels.levels ?? levels ?? [])[0]?.id;
  if (!lid) return { lid: null };
  const r = await fetch(`/api/levels/${lid}/work/plan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'pay the deposit to the landlord on Friday' }),
  });
  return { lid, status: r.status, body: await r.json().catch(() => ({})) };
});
if (!probe.lid) {
  console.error('no level to plan against');
  await done(1);
}
if (probe.status === 200 && probe.body.refuses === undefined) {
  console.error('the running server predates #22 — restart it first');
  await done(1);
}
check(
  'the plan route names the row, its keys, the desk’s lead-in and the board’s reason',
  probe.body.refuses?.length === 1 &&
    probe.body.refuses[0].row === 'money' &&
    JSON.stringify(probe.body.refuses[0].keys) === '["money"]' &&
    probe.body.refuses[0].lead === 'this asks for a payment' &&
    probe.body.refuses[0].why === WHY_MONEY,
  JSON.stringify(probe.body.refuses),
);

// Into Training Ground.
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.ts-item')];
  (items.find((i) => i.textContent?.includes('CONTINUE')) ?? items[0])?.click();
});
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.lvl-card')];
  (cards.find((c) => c.textContent?.toLowerCase().includes('training')) ?? cards[0])?.click();
});
await page.waitForTimeout(3000);

// A fresh profile gets the first-run tour, which sits over the work bar.
// Dismissed the way a person would — its own Skip (D-248's lesson).
if (await page.locator('.tour').count()) {
  await page.evaluate(() => {
    [...document.querySelectorAll('.tour-foot button')]
      .find((b) => b.textContent?.trim() === 'Skip')
      ?.click();
  });
  await page.waitForTimeout(500);
}
check('the first-run tour is out of the way', (await page.locator('.tour').count()) === 0);

const box = page.locator('.work-input').first();
check('the work bar is there', (await box.count()) === 1);

/** What the bar says right now: the refusal lines, the tail, and Start's state. */
const desk = async () =>
  page.evaluate(() => ({
    lines: [...document.querySelectorAll('.work-refuses')].map((p) => ({
      text: p.innerText.trim(),
      why: p.querySelector('.work-refuses-why')?.textContent ?? null,
      does: p.querySelector('.work-refuses-does')?.textContent?.trim() ?? null,
    })),
    tails: [...document.querySelectorAll('.work-refuses-tail')].map((p) => p.innerText.trim()),
    startDisabled: document.querySelector('.work-bar button[type=submit]')?.disabled ?? null,
    ask: document.querySelector('.work-channel')?.innerText?.trim() ?? null,
  }));

// ── one row: the money line, in the board's own words ──────────────────────
await box.fill('pay the deposit to the landlord on Friday');
await page.waitForTimeout(2500);
let d = await desk();
check('one amber line under the plan', d.lines.length === 1, JSON.stringify(d.lines));
check(
  'the desk’s lead-in names what was asked for',
  d.lines[0]?.text.startsWith('this asks for a payment —'),
  d.lines[0]?.text,
);
check(
  'and the reason is the job board’s own sentence, byte for byte',
  d.lines[0]?.why === WHY_MONEY,
  `desk: ${d.lines[0]?.why}\n      board: ${WHY_MONEY}`,
);
// The ticket's own second half: the board's sentence says only what will not
// happen, and a desk that stops there says less than the product does.
check(
  'and the line says what the crew WILL do — words the board does not have',
  d.lines[0]?.does === 'It will draft the instruction for you to send.' &&
    !WHY_MONEY.includes(d.lines[0].does),
  d.lines[0]?.does,
);
check('the tail is there, once', d.tails.length === 1, JSON.stringify(d.tails));
check(
  'and it says Start still works',
  /Start still works/.test(d.tails[0] ?? ''),
  d.tails[0],
);
check('Start is NOT disabled — the desk warns, it does not block', d.startDisabled === false);

// ── two rows, one tail ─────────────────────────────────────────────────────
await box.fill('pay the supplier, then deploy the fix to production');
await page.waitForTimeout(2500);
d = await desk();
check(
  'two rows claimed, two lines, in the board’s order',
  d.lines.length === 2 &&
    d.lines[0].why === WHY_MONEY &&
    d.lines[1].why === WHY_ACT,
  JSON.stringify(d.lines.map((l) => l.text.slice(0, 42))),
);
check('and still exactly ONE tail', d.tails.length === 1, JSON.stringify(d.tails));
check('Start still not disabled with two rows showing', d.startDisabled === false);

// ── ordinary work says nothing ─────────────────────────────────────────────
await box.fill('Reconcile the two statements and chart the difference');
await page.waitForTimeout(2500);
d = await desk();
check('ordinary work: no line', d.lines.length === 0, JSON.stringify(d.lines));
check('ordinary work: no tail', d.tails.length === 0, JSON.stringify(d.tails));

// ── a never-channel is the ask card's, not the line's ──────────────────────
await box.fill('Send the invoice to Ana on WhatsApp');
await page.waitForTimeout(2500);
d = await desk();
check('a never-channel raises the ask card', !!d.ask && /WhatsApp/i.test(d.ask), d.ask?.slice(0, 60));
check(
  'and gets NO refusal line — the card already says it, and offers the channels that can',
  d.lines.length === 0 && d.tails.length === 0,
  JSON.stringify(d.lines),
);

// ── the meter never moved ──────────────────────────────────────────────────
// Three refusing sentences were typed above (money; money+act; whatsapp),
// each re-planned on every keystroke of `fill`, plus the probe's own plan.
// D-259: the count lives at Start, at a rule armed and at a reply sent —
// never here.
const meterAfter = existsSync(METER) ? readFileSync(METER, 'utf8') : '';
check(
  'nothing was counted: refusals.jsonl is byte-identical to before the run',
  meterAfter === meterBefore,
  `${meterBefore.length} → ${meterAfter.length} bytes`,
);

console.log('');
console.log(bad === 0 ? 'all PASS' : `${bad} FAILED`);
await done(bad === 0 ? 0 : 1);
