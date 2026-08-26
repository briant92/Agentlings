import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { installPaths } from './installpaths';

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

  /**
   * The launcher is plain node and cannot import `installpaths.ts` — it
   * *launches* tsx — so it reads AGENTLINGS_HOME itself. That is a second
   * derivation of the data directory, and the only thing stopping the two
   * drifting apart is this: spawn the launcher for real, with no
   * AGENTLINGS_LOG_DIR to steer it, and require the log to appear where
   * `installPaths` says. Each behaviour the module's own mutation round
   * covers is spawned here too, because a mutation caught in the module and
   * missed in the launcher is exactly the drift this guards.
   */
  const spawnWithHome = (home: string, cwd: string) => {
    const fixture = path.join(cwd, 'dies.mjs');
    writeFileSync(fixture, "console.error('relocated-death'); process.exit(7);\n");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AGENTLINGS_DEV_ENTRY: fixture,
      AGENTLINGS_HOME: home,
    };
    delete env.AGENTLINGS_LOG_DIR;
    const run = spawnSync(process.execPath, [path.join(SERVER, 'scripts', 'dev-logged.mjs')], {
      env,
      cwd,
      timeout: 60_000,
      encoding: 'utf8',
    });
    expect(run.status).toBe(7);
    return env;
  };

  it('writes the log where installPaths says the data directory is', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'devlog-home-'));
    const env = spawnWithHome(home, home);
    const expected = path.join(installPaths(env).dataDir, 'server.log');
    expect(expected.startsWith(home)).toBe(true);
    expect(readFileSync(expected, 'utf8')).toContain('relocated-death');
  });

  it('trims the home before using it, exactly as installPaths does', () => {
    // Mutation-checked: deleting the launcher's `.trim()` fails this.
    //
    // The module's other two parsing rules are not pinned here, and saying so
    // is the point. **A blank home meaning "unset"** cannot be spawned without
    // the log landing in the repository's own store, which is the thing the
    // AGENTLINGS_LOG_DIR seam exists to avoid; it stays pinned in
    // `installpaths.test.ts` alone. **`path.resolve` on a relative home** is
    // an equivalent mutant here — the launcher never changes its own working
    // directory, so resolving and carrying land in the same place. It is kept
    // in the launcher for parity with the module, not because this could tell.
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'devlog-rel-'));
    const env = spawnWithHome('  relocated  ', cwd);
    const expected = path.join(installPaths({ ...env, AGENTLINGS_HOME: path.join(cwd, 'relocated') }).dataDir, 'server.log');
    expect(expected).toBe(path.join(cwd, 'relocated', '.agentlings', 'server.log'));
    expect(readFileSync(expected, 'utf8')).toContain('relocated-death');
  });
});
