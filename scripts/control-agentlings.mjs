#!/usr/bin/env node
/**
 * control-agentlings.mjs — agent-friendly control CLI skeleton for Agentlings.
 * JSON stdout. Loopback first; never invents a green result.
 *
 * Usage:
 *   node scripts/control-agentlings.mjs --help
 *   node scripts/control-agentlings.mjs doctor [--dry-run]
 *   node scripts/control-agentlings.mjs screenshot --out <file.png> [--dry-run]
 *   node scripts/control-agentlings.mjs open-desk [--dry-run]
 *   node scripts/control-agentlings.mjs open-inbox [--dry-run]
 *   node scripts/control-agentlings.mjs cleanup [--dry-run]
 *
 * Env:
 *   AGENTLINGS_BASE_URL         probe this origin first (e.g. a Nest-owned install)
 *   AGENTLINGS_PORT / PORT      API port, same precedence as the server (D-271); default 4600
 *   AGENTLINGS_BROWSER_CHANNEL  Playwright channel for screenshot; default msedge (what the
 *                               repo's prove-*-ui scripts use)
 *   PLAYWRIGHT_CHROMIUM_PATH    executable path instead of a channel
 *
 * This tool never reads `.env` and never prints AGENTLINGS_PASSWORD or any key.
 */

import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROBE_TIMEOUT_MS = 3000;

// Same precedence as listenPort() in server/src/session.ts: AGENTLINGS_PORT
// beats PORT, and unset is 4600.
const apiPort = Number(process.env.AGENTLINGS_PORT || process.env.PORT || 4600);

/** Origins to try, in order. The first that answers /api/session wins. */
const CANDIDATES = [
  ...(process.env.AGENTLINGS_BASE_URL ? [{ label: 'AGENTLINGS_BASE_URL', base: process.env.AGENTLINGS_BASE_URL }] : []),
  { label: 'api (one origin after npm run build)', base: `http://127.0.0.1:${apiPort}` },
  { label: 'web dev server (npm run dev / serve)', base: 'http://127.0.0.1:5173' },
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const flags = new Map();
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry-run' || a === '--help' || a === '-h') continue;
  if (a.startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
    flags.set(a.slice(2), args[++i]);
  }
}
const command = args.find((a) => !a.startsWith('-')) || 'help';

function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function fail(message, extra = {}) {
  out({ ok: false, command, error: message, ...extra });
  process.exitCode = 1;
}

function help() {
  out({
    ok: true,
    command: 'help',
    name: 'control-agentlings',
    candidates: CANDIDATES.map((c) => c.base),
    subcommands: {
      doctor: 'GET /api/session on each candidate origin; report which answered. Unreachable → inconclusive, never green.',
      screenshot: '--out <file.png>  Capture the app as it opens (login or title screen). Needs playwright-core + a browser; otherwise inconclusive.',
      'open-desk': 'Where the desk is: URL plus the click path (the SPA has no deep links).',
      'open-inbox': 'Where the inbox is: URL plus the click path.',
      cleanup: 'Best-effort; each command closes its own browser.',
    },
    flags: ['--dry-run', '--help', '--out'],
    notes: [
      'Loopback first (127.0.0.1). A hosted install refuses supervised live acting without a desktop (README: what an install cannot do hosted).',
      'Off loopback the API is behind AGENTLINGS_PASSWORD. This tool never reads or prints it — stop at the login screen and mark inconclusive.',
    ],
  });
}

/**
 * The one ungated route: /api/session answers { required, authed } before any
 * password is met, so it is the liveness probe. Booleans only — nothing here
 * is a secret.
 */
async function probeSession(base) {
  const url = new URL('/api/session', base).href;
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = { raw: (await res.text().catch(() => '')).slice(0, 200) };
    }
    const shaped = res.status === 200 && typeof body?.required === 'boolean' && typeof body?.authed === 'boolean';
    return { ok: shaped, url, status: res.status, body };
  } catch (err) {
    return { ok: false, url, error: err?.cause?.code || err?.name || String(err) };
  }
}

/** First candidate that answers like an Agentlings server, or null. */
async function findServer() {
  const probes = [];
  for (const c of CANDIDATES) {
    const session = await probeSession(c.base);
    probes.push({ ...c, session });
    if (session.ok) return { hit: probes.at(-1), probes };
  }
  return { hit: null, probes };
}

async function cmdDoctor() {
  if (dryRun) {
    out({
      ok: true,
      command: 'doctor',
      dryRun: true,
      planned: CANDIDATES.map((c) => ({ ...c, method: 'GET', url: new URL('/api/session', c.base).href })),
    });
    return;
  }
  const { hit, probes } = await findServer();
  if (!hit) {
    out({
      ok: false,
      command: 'doctor',
      probes,
      inconclusive: `no Agentlings server answered /api/session on ${CANDIDATES.map((c) => c.base).join(', ')}`,
      next: 'Start one on loopback (npm run serve, or npm run build + the server alone), or set AGENTLINGS_BASE_URL. Do not report green.',
    });
    process.exitCode = 1;
    return;
  }
  const { required, authed } = hit.session.body;
  out({
    ok: true,
    command: 'doctor',
    baseUrl: hit.base,
    via: hit.label,
    session: { required, authed },
    probes,
    next: required && !authed
      ? 'Gate is on and this client has no session: UI drive stops at the login screen (inconclusive past it).'
      : 'Server up and ungated for this client. Screenshot or drive from the title screen.',
  });
}

/**
 * The web app is one origin and one URL for every screen (D-272; App.tsx keeps
 * the screen in React state). So "open X" is a URL plus a click path, not a
 * route.
 */
const PLACES = {
  desk: {
    surface: 'the work bar under the world — where a sentence is handed to the horde; the parcel desk (pile of deliveries) opens from the parcel pile in the world',
    clickPath: [
      'title screen → START (or CONTINUE)',
      'level picker → a level card',
      'in the level: the work bar sits under the world canvas',
      'parcel desk: click the parcel pile in the world',
    ],
    selectors: { workBar: '.work-bar', parcelDesk: '.modal.parcels', world: '.world' },
  },
  inbox: {
    surface: 'finished work, under the terminal feed in the right-hand side panel of a level',
    clickPath: [
      'title screen → START (or CONTINUE)',
      'level picker → a level card',
      'in the level: right-hand aside → terminal → inbox beneath it',
    ],
    selectors: { aside: '.side', inbox: '.inbox' },
  },
};

async function cmdOpen(place) {
  const label = `open-${place}`;
  const where = PLACES[place];
  if (dryRun) {
    out({ ok: true, command: label, dryRun: true, planned: { probe: CANDIDATES.map((c) => c.base), ...where } });
    return;
  }
  const { hit, probes } = await findServer();
  out({
    ok: Boolean(hit),
    command: label,
    url: hit ? new URL('/', hit.base).href : null,
    ...where,
    session: hit ? { required: hit.session.body.required, authed: hit.session.body.authed } : null,
    probes: hit ? undefined : probes,
    inconclusive: hit
      ? hit.session.body.required && !hit.session.body.authed
        ? 'gate is on — the click path starts after the login screen, which this tool cannot pass'
        : null
      : 'no server reachable; the click path is documented but nothing was opened',
    note: 'No deep links: every screen is the same URL. Follow clickPath, or read features/*.md.',
  });
  if (!hit) process.exitCode = 1;
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return require(require.resolve(name, { paths: [process.cwd(), ROOT, path.join(ROOT, 'server')] }));
    } catch {
      /* try next */
    }
  }
  return null;
}

function launchOptions() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (executablePath) return { headless: true, executablePath };
  return { headless: true, channel: process.env.AGENTLINGS_BROWSER_CHANNEL || 'msedge' };
}

async function cmdScreenshot() {
  const outPath = path.resolve(flags.get('out') || path.join(ROOT, '.agentlings', 'evidence', 'agentlings.png'));
  if (dryRun) {
    out({ ok: true, command: 'screenshot', dryRun: true, planned: { probe: CANDIDATES.map((c) => c.base), out: outPath, launch: launchOptions() } });
    return;
  }
  const { hit, probes } = await findServer();
  if (!hit) {
    out({ ok: false, command: 'screenshot', probes, inconclusive: 'no server reachable — nothing to capture' });
    process.exitCode = 1;
    return;
  }
  const pw = loadPlaywright();
  if (!pw) {
    out({
      ok: false,
      command: 'screenshot',
      baseUrl: hit.base,
      inconclusive: 'playwright-core not resolvable — run npm install at the repo root (server/package.json carries it)',
    });
    process.exitCode = 1;
    return;
  }
  let browser;
  try {
    browser = await pw.chromium.launch(launchOptions());
  } catch (err) {
    out({
      ok: false,
      command: 'screenshot',
      baseUrl: hit.base,
      launch: launchOptions(),
      inconclusive: `needs a browser: ${String(err?.message || err).split('\n')[0]}`,
      next: 'Set AGENTLINGS_BROWSER_CHANNEL (chrome, msedge, chromium) or PLAYWRIGHT_CHROMIUM_PATH.',
    });
    process.exitCode = 1;
    return;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const target = new URL('/', hit.base).href;
    await page.goto(target, { waitUntil: 'networkidle', timeout: 30_000 });
    // App.tsx renders nothing until /api/session answers, then one of these.
    const first = await page
      .locator('.login-screen, .title-screen')
      .first()
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    const loginGate = (await page.locator('.login-screen').count()) > 0;
    await mkdir(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, fullPage: true });
    out({
      ok: first,
      command: 'screenshot',
      baseUrl: hit.base,
      finalUrl: page.url(),
      title: await page.title(),
      screen: loginGate ? 'login' : first ? 'title' : 'unknown',
      out: outPath,
      inconclusive: loginGate
        ? 'screenshot is the sign-in gate, not the world — this tool does not hold the password'
        : first
          ? null
          : 'neither the login nor the title screen rendered within 10 s',
    });
    if (!first) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

async function cmdCleanup() {
  out({
    ok: true,
    command: 'cleanup',
    dryRun,
    message: 'Skeleton: each command closes the browser it opened. No persistent control browser and no server is touched.',
  });
}

async function main() {
  if (args.includes('--help') || args.includes('-h') || command === 'help') {
    help();
    return;
  }
  switch (command) {
    case 'doctor':
      await cmdDoctor();
      break;
    case 'screenshot':
      await cmdScreenshot();
      break;
    case 'open-desk':
      await cmdOpen('desk');
      break;
    case 'open-inbox':
      await cmdOpen('inbox');
      break;
    case 'cleanup':
      await cmdCleanup();
      break;
    default:
      fail(`unknown command: ${command}`, { hint: 'pass --help' });
  }
}

main().catch((err) => {
  fail(err?.message || String(err), { stack: err?.stack });
});
