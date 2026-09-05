import { createRequire } from 'node:module';
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

/**
 * The dev server, with its own last words kept.
 *
 * The server has died mid-session three times (twice in D-118, once on
 * 2026-08-08) and the cause was unobservable every time: tsx prints the
 * crash to a terminal nobody was recording, and the terminal scrolls or
 * closes. This wrapper changes nothing about how the server runs — same
 * tsx watch, same console output — it only tees stdout and stderr into
 * `.agentlings/server.log` and stamps starts and exits, so the next death
 * leaves a body to examine.
 *
 * The log's first catch closed the case (D-140): the "deaths" were tsx
 * watch RESTARTS on source-file events — live edits, and OneDrive echoing
 * an edit minutes later — each one killing whatever paid session was
 * running. `--no-watch` is the answer for driving the app rather than
 * developing it: same server, same log, no file watching, so a session
 * outlives everything except Ctrl+C. `npm run serve` uses it.
 *
 * The log's second catch (D-284) is why `--no-watch` now also RESTARTS: the
 * server exited thirteen times in ten days on one shape — a fetch to Telegram
 * timing out inside an unattended sweep — and every death waited for a person
 * to notice, two days the last time. Under `serve` a server that lived past
 * RESTART_AFTER_MS and exited non-zero is started again after a delay that
 * doubles from RESTART_DELAY_MS to RESTART_DELAY_MAX_MS and resets once a
 * life reaches HEALTHY_MS; one that died inside the threshold is a boot
 * failure — the listen policy refusing, a broken `.env` — and stops with its
 * reason exactly as before, because restarting that would loop on one line
 * forever. No cap: a cap turns a flaky night back into a dead server. `dev`
 * keeps tsx watch's own restarts and gets none of this.
 *
 * Test seam: AGENTLINGS_DEV_ENTRY replaces the entry with a plain script
 * (no watch, so exits propagate), AGENTLINGS_LOG_DIR moves the log out of
 * the real store, and AGENTLINGS_RESTART_AFTER_MS / AGENTLINGS_RESTART_DELAY_MS
 * shrink the policy's clocks so a restart can be spawned in a test. None is
 * set in ordinary use.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..');
// The log belongs in the install's data directory, which `AGENTLINGS_HOME`
// moves. This is plain node — it *launches* tsx, so it cannot import
// `installpaths.ts` — so it reads the variable the same way, and the test
// beside it spawns this file with a home set and requires the log to land
// where `installPaths` says it should. That is what keeps the two agreeing.
const home = (process.env.AGENTLINGS_HOME ?? '').trim();
const dataDir = path.join(home === '' ? path.resolve(serverDir, '..') : path.resolve(home), '.agentlings');
const logDir = process.env.AGENTLINGS_LOG_DIR ?? dataDir;
const logFile = path.join(logDir, 'server.log');
mkdirSync(logDir, { recursive: true });

// One rotation, size-checked at start only: the log grows by dev-session,
// and a cap checked per-write would put a stat on every chunk.
try {
  if (statSync(logFile).size > 5 * 1024 * 1024) renameSync(logFile, `${logFile}.1`);
} catch {
  // No log yet — nothing to rotate.
}

const log = (text) => {
  try {
    appendFileSync(logFile, text);
  } catch {
    // A full disk must not take the console down with it.
  }
};

const require = createRequire(import.meta.url);
const tsx = require.resolve('tsx/cli');
const serve = process.argv.includes('--no-watch');
const entry = process.env.AGENTLINGS_DEV_ENTRY
  ? [process.env.AGENTLINGS_DEV_ENTRY]
  : serve
    ? ['src/index.ts']
    : ['watch', 'src/index.ts'];

// The restart policy (D-284). Milliseconds; the two the test shrinks read
// their names from the environment, the other two are fixed.
const RESTART_AFTER_MS = Number(process.env.AGENTLINGS_RESTART_AFTER_MS ?? 60_000);
const RESTART_DELAY_MS = Number(process.env.AGENTLINGS_RESTART_DELAY_MS ?? 5_000);
const RESTART_DELAY_MAX_MS = 300_000;
const HEALTHY_MS = 3_600_000;

let stopping = false;
let restarts = 0;
let delay = RESTART_DELAY_MS;
let child;
/** The restart timer while a death is waited out — the only thing keeping the launcher alive then. */
let pending;

function launch() {
  // Forgotten here rather than in the timer, so a Ctrl+C on this life reaches the child.
  pending = undefined;
  const startedAt = Date.now();
  const again = restarts > 0 ? ` restart=${restarts}` : '';
  log(`\n[dev-logged] start ${new Date().toISOString()} entry=${entry.join(' ')}${again}\n`);
  child = spawn(process.execPath, [tsx, ...entry], {
    cwd: serverDir,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    log(chunk.toString());
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    log(chunk.toString());
  });

  child.on('exit', (code, signal) => {
    // The line this file exists for: a death now has a time and a code, and
    // the stderr that preceded it is in the same file.
    log(`[dev-logged] tsx exited code=${code} signal=${signal} ${new Date().toISOString()}\n`);
    const lived = Date.now() - startedAt;
    // Not a death to survive: `dev`, our own Ctrl+C, a clean exit, or a
    // process that never got past boot.
    if (!serve || stopping || code === 0 || lived < RESTART_AFTER_MS) process.exit(code ?? 1);
    if (lived >= HEALTHY_MS) delay = RESTART_DELAY_MS;
    restarts += 1;
    log(
      `[dev-logged] restart ${restarts} in ${delay / 1000} s — lived ${Math.round(lived / 1000)} s ${new Date().toISOString()}\n`,
    );
    const wait = delay;
    delay = Math.min(delay * 2, RESTART_DELAY_MAX_MS);
    pending = setTimeout(launch, wait);
  });
  child.on('error', (err) => {
    log(`[dev-logged] spawn failed: ${String(err)} ${new Date().toISOString()}\n`);
    process.exit(1);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log(`[dev-logged] ${signal} ${new Date().toISOString()}\n`);
    stopping = true;
    // A stop while a restart is being waited out: the child is already dead,
    // and the timer would start a server the person just stopped.
    if (pending) {
      clearTimeout(pending);
      process.exit(1);
    }
    child.kill(signal);
  });
}

launch();
