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
 * Test seam: AGENTLINGS_DEV_ENTRY replaces `watch src/index.ts` with a
 * plain entry (no watch, so exits propagate), and AGENTLINGS_LOG_DIR moves
 * the log out of the real store. Neither is set in ordinary use.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..');
const logDir = process.env.AGENTLINGS_LOG_DIR ?? path.resolve(serverDir, '..', '.agentlings');
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
const entry = process.env.AGENTLINGS_DEV_ENTRY
  ? [process.env.AGENTLINGS_DEV_ENTRY]
  : ['watch', 'src/index.ts'];

log(`\n[dev-logged] start ${new Date().toISOString()} entry=${entry.join(' ')}\n`);
const child = spawn(process.execPath, [tsx, ...entry], {
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

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log(`[dev-logged] ${signal} ${new Date().toISOString()}\n`);
    child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  // The line this file exists for: a death now has a time and a code, and
  // the stderr that preceded it is in the same file.
  log(`[dev-logged] tsx exited code=${code} signal=${signal} ${new Date().toISOString()}\n`);
  process.exit(code ?? 1);
});
child.on('error', (err) => {
  log(`[dev-logged] spawn failed: ${String(err)} ${new Date().toISOString()}\n`);
  process.exit(1);
});
