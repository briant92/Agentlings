import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The wrapper exists for exactly one promise: a server that dies leaves its
 * stderr and its exit code in `.agentlings/server.log`. Three deaths have now
 * gone unobserved because nothing kept the terminal's contents (D-118 twice,
 * 2026-08-08 once), so this is tested end to end with a real spawn — a
 * synthetic entry that prints to stderr and exits 7 — not by unit-testing
 * the plumbing apart.
 */
const SERVER = fileURLToPath(new URL('..', import.meta.url));

describe('dev-logged', () => {
  it("keeps a dying server's stderr and exit code in the log", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'devlog-'));
    const fixture = path.join(tmp, 'dies.mjs');
    writeFileSync(fixture, "console.error('synthetic-death'); process.exit(7);\n");
    const run = spawnSync(
      process.execPath,
      [path.join(SERVER, 'scripts', 'dev-logged.mjs')],
      {
        env: { ...process.env, AGENTLINGS_DEV_ENTRY: fixture, AGENTLINGS_LOG_DIR: tmp },
        timeout: 60_000,
        encoding: 'utf8',
      },
    );
    // The wrapper repeats the child's own exit code, so concurrently and a
    // watching human both see the truth.
    expect(run.status).toBe(7);
    const log = readFileSync(path.join(tmp, 'server.log'), 'utf8');
    expect(log).toContain('synthetic-death');
    expect(log).toMatch(/exited code=7/);
  });
});
