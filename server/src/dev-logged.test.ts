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
   * The second catch (D-284): under `serve` a server that lived past the
   * threshold and died is started again; one that died inside it is a boot
   * failure and stops with its code. Spawned for real, like the first promise,
   * because the policy lives in the launcher and nowhere a unit test reaches.
   * The fixture dies once and lives the second time, so the run ends — status
   * 0 is the second life's, and the log holds both plus the restart line.
   */
  const spawnServe = (env: NodeJS.ProcessEnv, args: string[]) => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'devlog-flaky-'));
    const fixture = path.join(tmp, 'flaky.mjs');
    // Dies with 1 the first time it runs, lives the second: the marker is the memory.
    writeFileSync(
      fixture,
      [
        "import { existsSync, writeFileSync } from 'node:fs';",
        "const marker = process.argv[1] + '.once';",
        "if (existsSync(marker)) { console.log('second-life'); process.exit(0); }",
        "writeFileSync(marker, '');",
        "console.error('first-death'); process.exit(1);",
        '',
      ].join('\n'),
    );
    const run = spawnSync(process.execPath, [path.join(SERVER, 'scripts', 'dev-logged.mjs'), ...args], {
      env: { ...process.env, AGENTLINGS_DEV_ENTRY: fixture, AGENTLINGS_LOG_DIR: tmp, ...env },
      timeout: 60_000,
      encoding: 'utf8',
    });
    return { run, log: readFileSync(path.join(tmp, 'server.log'), 'utf8') };
  };
  const SHRUNK = { AGENTLINGS_RESTART_AFTER_MS: '0', AGENTLINGS_RESTART_DELAY_MS: '10' };

  it('under serve, restarts a server that lived past the threshold and died', () => {
    const { run, log } = spawnServe(SHRUNK, ['--no-watch']);
    expect(run.status).toBe(0);
    expect(log).toContain('first-death');
    expect(log).toMatch(/restart 1 in 0\.01 s/);
    expect(log).toMatch(/start .* restart=1/);
    expect(log).toContain('second-life');
  });

  it('a death inside the threshold is a boot failure: no restart, the code propagates', () => {
    // Mutation-checked: dropping `lived < RESTART_AFTER_MS` from the exit
    // branch restarts this one and fails the status.
    const { run, log } = spawnServe({ AGENTLINGS_RESTART_DELAY_MS: '10' }, ['--no-watch']);
    expect(run.status).toBe(1);
    expect(log).not.toContain('[dev-logged] restart');
    expect(log).not.toContain('second-life');
  });

  it('dev gets none of it: without --no-watch the first death propagates', () => {
    // Mutation-checked: dropping `!serve ||` restarts this one.
    const { run, log } = spawnServe(SHRUNK, []);
    expect(run.status).toBe(1);
    expect(log).not.toContain('[dev-logged] restart');
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
