import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { HOME_VAR } from './installpaths';
import { BIND_VAR, PASSWORD_VAR, RUNNER_HEADER, runnerSecret } from './session';

/**
 * D-289: the `/internal/*` doors on a hosted install.
 *
 * The template binds `0.0.0.0` with a password (D-271), and before this entry
 * the doors were exempt from that password *and* passed the origin check with
 * no `Origin` — so anyone who could reach the port could drive them. The
 * caller is decided from the socket's address and the runner's per-boot
 * secret, never from a header a stranger can choose.
 *
 * Home set before a dynamic import, as in `app.test.ts`, so nothing lands in
 * the checkout.
 */
const home = mkdtempSync(path.join(os.tmpdir(), 'agentlings-internal-'));
const saved = { home: process.env[HOME_VAR], pw: process.env[PASSWORD_VAR], bind: process.env[BIND_VAR] };
process.env[HOME_VAR] = home;
process.env[PASSWORD_VAR] = 'correct horse';
process.env[BIND_VAR] = '0.0.0.0';
const { app } = await import('./app');

afterAll(() => {
  for (const [name, value] of [
    [HOME_VAR, saved.home],
    [PASSWORD_VAR, saved.pw],
    [BIND_VAR, saved.bind],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(home, { recursive: true, force: true });
});

/** What `@hono/node-server` hands a route as `c.env`: the socket is in it. */
const from = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress } } });

const post = (door: string, headers: Record<string, string> = {}, env?: object) =>
  app.request(
    `/internal/${door}`,
    { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' },
    env,
  );

const DOORS = ['github', 'mail', 'render', 'fetch', 'search', 'bls', 'calendar'];

describe('/internal/* on a public bind with a password (D-289)', () => {
  it.each(DOORS)('refuses /internal/%s from a remote caller with no secret', async (door) => {
    const res = await post(door, {}, from('203.0.113.7'));
    expect(res.status).toBe(401);
  });

  it.each(DOORS)('refuses /internal/%s when the caller has no address at all', async (door) => {
    expect((await post(door)).status).toBe(401);
  });

  it('refuses a wrong secret, and a forged forwarding header changes nothing', async () => {
    const wrong = await post('github', { [RUNNER_HEADER]: 'f'.repeat(64) }, from('203.0.113.7'));
    expect(wrong.status).toBe(401);
    const forged = await post('github', { 'x-forwarded-for': '127.0.0.1' }, from('203.0.113.7'));
    expect(forged.status).toBe(401);
  });

  it('lets the runner through with the per-boot secret, from any address', async () => {
    // 400 is the door's own answer to an empty body: the gate let it in.
    const res = await post('github', { [RUNNER_HEADER]: runnerSecret() }, from('203.0.113.7'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'tool is required' });
  });

  it('lets a loopback caller through with no secret — how compiled tools call', async () => {
    const res = await post('fetch', {}, from('127.0.0.1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'url is required' });
    expect((await post('github', {}, from('::ffff:127.0.0.1'))).status).toBe(400);
  });

  it('still gates the API on the cookie, unchanged', async () => {
    expect((await app.request('/api/levels', {}, from('127.0.0.1'))).status).toBe(401);
  });
});
