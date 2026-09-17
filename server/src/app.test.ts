import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { HOME_VAR, installPaths } from './installpaths';

/**
 * D-288: the application can be imported.
 *
 * Until that entry `index.ts` ran `serve()`, `migrateLegacy`, the level load,
 * the HQ seed, `closeOpenRows` and `harvestInterrupted` at module load, so no
 * test could touch a route without booting a whole install — and a test that
 * forgot `AGENTLINGS_HOME` would have booted it into the developer's real
 * `.agentlings/`. This file is the floor under the split: import the app into
 * an empty home and prove the home is still empty.
 *
 * The home is set **before** the import and the import is dynamic, because a
 * static one is hoisted above the assignment and would bind every path in the
 * app to the checkout instead.
 */
const home = mkdtempSync(path.join(os.tmpdir(), 'agentlings-app-'));
process.env[HOME_VAR] = home;
const { app } = await import('./app');

afterAll(() => rmSync(home, { recursive: true, force: true }));

describe('importing the app writes nothing (D-288)', () => {
  it('bound every install path to the temp home, none to the checkout', () => {
    expect(installPaths().dataDir).toBe(path.join(home, '.agentlings'));
    expect(installPaths().secretsFile).toBe(path.join(home, '.env'));
  });

  it('created nothing under the home — no data dir, no seeded level, no ledger', () => {
    expect(readdirSync(home)).toEqual([]);
  });

  it('answers the session route, which no test could reach before', async () => {
    const res = await app.request('/api/session');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ required: false, authed: true });
  });

  it('has no levels and refuses an unknown one, because nothing was booted', async () => {
    const list = await app.request('/api/levels');
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([]);
    const state = await app.request('/api/levels/nope/state');
    expect(state.status).toBe(404);
    expect(await state.json()).toEqual({ error: 'unknown level' });
  });

  it('still wrote nothing after answering', () => {
    expect(readdirSync(home)).toEqual([]);
  });
});
