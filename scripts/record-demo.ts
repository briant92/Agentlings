/**
 * Records a demo of the app doing one real job, end to end.
 *
 * Not the crew's browser connection: this is our own script driving our own
 * app, so it holds the acting tools a session is never given (D-034 stands —
 * nothing here is offered to a model). It exists because a third party asking
 * "what can it do?" is answered by a recording, not by hosting (D-169).
 *
 *   npm run demo:record
 *   npm run demo:record -- home-chores "Write a one-page PDF called …"
 *
 * Needs the app up (`npm run serve`). Writes a .webm and a Playwright trace
 * into .agentlings/demo/, which is gitignored — a demo is an artefact, not a
 * source file. The trace is the same receipt shape the fourth door would use.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';

const WEB = 'http://localhost:5173';
const API = 'http://127.0.0.1:4600';
const OUT = path.resolve('.agentlings/demo');

const level = process.argv[2] ?? 'home-chores';
const sentence =
  process.argv[3] ??
  'Write a one-page PDF called kitchen-basics.pdf explaining three rules for keeping a kitchen tidy';

/** A beat long enough for a viewer to read what just changed. */
const beat = (page: { waitForTimeout(ms: number): Promise<void> }, ms = 1400) =>
  page.waitForTimeout(ms);

async function main(): Promise<void> {
  // Any answer means a server is up — Wave 0's 401 included, which `.ok`
  // would have read as a dead server.
  const health = await fetch(`${API}/api/levels`).catch(() => null);
  if (!health) throw new Error(`no server at ${API} — run "npm run serve" first`);
  // But a gated server cannot be recorded: this drives the real UI in a real
  // browser, and the first thing that browser would meet is the login screen.
  // Said plainly rather than worked around — a demo recorder that typed a
  // password would be putting one in a video.
  if (health.status === 401) {
    throw new Error(
      'the server is gated (AGENTLINGS_PASSWORD is set) — comment it out and restart to record a demo',
    );
  }

  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  });
  // Snapshots without the screencast: with screenshots on, a multi-minute
  // session traced to 183 MB, which is not an artefact anyone can send. The
  // .webm already carries the picture; the trace carries the DOM and network.
  // A fresh browser profile has never seen the first-run tour, so it renders
  // over the work bar and swallows the clicks. Marked seen before any page
  // script runs — a demo should open on the app, not on its onboarding.
  await context.addInitScript(() => localStorage.setItem('agentlings:tour', 'done'));

  await context.tracing.start({ screenshots: false, snapshots: true, sources: false });

  const page = await context.newPage();

  try {
    await page.goto(WEB, { waitUntil: 'domcontentloaded' });
    await beat(page, 2200); // the title screen is the establishing shot

    await page.locator('.ts-item.on').click();
    await page.locator('.lvl-card').first().waitFor();
    await beat(page);

    // The level whose crew will do the work.
    await page
      .locator('.lvl-card')
      .filter({ has: page.locator('.lvl-name') })
      .nth(levelIndex(await page.locator('.lvl-name').allTextContents()))
      .click();

    const input = page.locator('.work-input');
    await input.waitFor({ timeout: 20_000 });
    await beat(page);

    // Typed rather than filled, so the quote is seen arriving as it is written.
    await input.click();
    await input.pressSequentially(sentence, { delay: 28 });
    await beat(page, 2600); // the quote lands before anything runs — the point

    const before = await newestJobId();
    await page.locator('form.work-bar button[type="submit"]').click();

    // Which job this press created. Clicking the first REVIEW on screen is
    // what the first take did, and it approved an unrelated finished job while
    // this one was still running — the feed is a log, not a queue.
    const job = await settle(before);

    // The walk, the work, the delivery. A session is minutes, not seconds.
    await beat(page, 2000);

    // The last card in the feed. Safe because settle() has already confirmed
    // *this* job is the one that just finished, and the feed appends — it
    // scrolls to scrollHeight, and a done event renders its line and its card
    // as siblings in document order. Matching on the summary does not work:
    // a done job's card is rendered without one (Terminal.tsx:239).
    await page.locator('.t-feed .t-card').last().locator('.t-review').click();
    await beat(page, 3200); // the result, the files, what it cost

    const approve = page.getByRole('button', { name: /^Approve/ }).first();
    if (await approve.isVisible().catch(() => false)) {
      await approve.click();
      await beat(page, 2400);
    }
  } finally {
    await context.tracing.stop({ path: path.join(OUT, 'demo-trace.zip') });
    await context.close(); // the video is only written on close
    await browser.close();

    // In the finally so a failed take still leaves a named file rather than a
    // hash — the recording of a failure is the thing you want to watch.
    const raw = readdirSync(OUT).find((f) => f.endsWith('.webm') && f !== 'demo.webm');
    if (raw) renameSync(path.join(OUT, raw), path.join(OUT, 'demo.webm'));
    console.log(`video  ${path.join(OUT, 'demo.webm')}`);
    console.log(`trace  ${path.join(OUT, 'demo-trace.zip')}  (npx playwright show-trace …)`);
  }
}

type JobRow = { id: string; status: string; summary?: string; createdAt?: number };

async function jobs(): Promise<JobRow[]> {
  const res = await fetch(`${API}/api/levels/${level}/state`);
  const body = (await res.json()) as { jobs?: JobRow[] };
  return (body.jobs ?? []).slice().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

async function newestJobId(): Promise<string | undefined> {
  return (await jobs())[0]?.id;
}

/** Waits for the job this press created to stop moving, and returns it. */
async function settle(before: string | undefined): Promise<JobRow> {
  const RUNNING = ['queued', 'working', 'walking', 'delivering', 'running', 'closing'];
  const deadline = Date.now() + 15 * 60_000;
  let mine: JobRow | undefined;
  while (Date.now() < deadline) {
    const rows = await jobs();
    mine ??= rows.find((j) => j.id !== before);
    const now = mine && rows.find((j) => j.id === mine!.id);
    if (now && !RUNNING.includes(now.status)) return now;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('the job did not finish inside 15 minutes');
}

/** Prefer the level named on the command line; otherwise the first card. */
function levelIndex(names: string[]): number {
  const want = level.replace(/-/g, ' ').toLowerCase();
  const hit = names.findIndex((n) => n.toLowerCase() === want);
  return hit >= 0 ? hit : 0;
}

await main();
