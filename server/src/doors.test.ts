import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_SECRETS } from './google';
import { HOME_VAR, installPaths } from './installpaths';

/**
 * What each `/internal/*` door answers once the caller check has let a call
 * in: the refusals before the call, and the one trail line after it. Every
 * case here stays off the network — each library refuses an incomplete call
 * before it fetches anything, and `fetch` is pointed at loopback, which the
 * private-address guard refuses.
 *
 * The catalog is the repo's own, read fresh per call; `hidden` empties it so
 * the not-configured answer can be seen at all.
 */
const hidden = vi.hoisted(() => ({ on: false }));
vi.mock('./connections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./connections')>();
  return {
    ...actual,
    readConnections: (file: string) => (hidden.on ? [] : actual.readConnections(file)),
  };
});

const SECRETS = [...Object.values(GOOGLE_SECRETS), 'BRAVE_API_KEY', 'GITHUB_TOKEN', 'BLS_REGISTRATION_KEY'];
const home = mkdtempSync(path.join(os.tmpdir(), 'agentlings-doors-'));
const saved = Object.fromEntries([HOME_VAR, ...SECRETS].map((name) => [name, process.env[name]]));
process.env[HOME_VAR] = home;
for (const name of SECRETS) delete process.env[name];
const { app } = await import('./app');

afterAll(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(home, { recursive: true, force: true });
});

const trail = path.join(installPaths().dataDir, 'doors.log');
beforeEach(() => {
  mkdirSync(installPaths().dataDir, { recursive: true });
  writeFileSync(trail, '');
});
afterEach(() => {
  hidden.on = false;
});

const loopback = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
const post = (door: string, body: unknown) =>
  app.request(
    `/internal/${door}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    loopback,
  );
const lines = () =>
  readFileSync(trail, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const { at: _at, ...rest } = JSON.parse(line) as Record<string, unknown>;
      return rest;
    });

/** The six tool-shaped doors: door, connection label, a granted tool, and what that tool says to `args`. */
const TOOL_DOORS = [
  ['github', 'the code host connection', 'get_issue', { repo: 'nope' }, 'repo must look like owner/name'],
  ['search', 'the search connection', 'search_web', {}, 'query is required'],
  ['bls', 'the BLS connection', 'bls_series', {}, 'seriesIds is required'],
  [
    'calendar',
    'the calendar connection',
    'calendar_events',
    {},
    'Google is not connected, so the crew cannot read the calendar — open Settings and press Connect on the Google connection. Reading rides the same sign-in as sending.',
  ],
  [
    'mail',
    'the mail connection',
    'mail_search',
    {},
    'Google is not connected, so the crew cannot read mail — open Settings and press Connect on the Google connection. Reading rides the same sign-in as sending.',
  ],
  ['render', 'the render connection', 'render_pdf', {}, 'html is required — the whole document, not a path'],
] as const;

describe('the tool-shaped /internal doors', () => {
  it.each(TOOL_DOORS)('/internal/%s wants a tool', async (door) => {
    const res = await post(door, { args: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'tool is required' });
    expect(lines()).toEqual([]);
  });

  it.each(TOOL_DOORS)('/internal/%s says when its connection is not configured', async (door, label) => {
    hidden.on = true;
    const res = await post(door, { tool: 'anything' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `${label} is not configured` });
    expect(lines()).toEqual([]);
  });

  it.each(TOOL_DOORS)('/internal/%s refuses a tool its connection does not grant', async (door) => {
    const res = await post(door, { tool: 'constructor' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'constructor is not granted on this connection' });
    expect(lines()).toEqual([]);
  });

  it.each(TOOL_DOORS)(
    '/internal/%s answers a granted tool and leaves one line on the trail',
    async (door, _label, tool, args, error) => {
      const res = await post(door, { tool, args });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ error });
      const head = error.length > 160 ? `${error.slice(0, 160)}…` : error;
      expect(lines()).toEqual([{ door, tool, args: JSON.stringify(args), ok: false, head }]);
    },
  );

  it('logs missing args as an empty object', async () => {
    const res = await post('search', { tool: 'search_web' });
    expect(await res.json()).toEqual({ error: 'query is required' });
    expect(lines()).toMatchObject([{ door: 'search', tool: 'search_web', args: '{}' }]);
  });

  it('fails a body that is not JSON before any door logic', async () => {
    const res = await post('github', 'not json');
    expect(res.status).toBe(500);
    expect(lines()).toEqual([]);
  });
});

describe('/internal/fetch', () => {
  it('wants a url, and a blank one is no url', async () => {
    for (const body of [{}, { url: '   ' }]) {
      const res = await post('fetch', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'url is required' });
    }
    expect(lines()).toEqual([]);
  });

  it('says when web access is not configured', async () => {
    hidden.on = true;
    const res = await post('fetch', { url: 'http://127.0.0.1/' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'web access is not configured' });
    expect(lines()).toEqual([]);
  });

  it('fetches the trimmed url and logs it as web/fetch_page', async () => {
    const res = await post('fetch', { url: '  http://127.0.0.1/  ' });
    expect(res.status).toBe(200);
    const error = 'that is a private address, inside this machine or its network';
    expect(await res.json()).toEqual({ url: 'http://127.0.0.1/', text: '', truncated: false, error });
    expect(lines()).toEqual([
      { door: 'web', tool: 'fetch_page', args: JSON.stringify({ url: 'http://127.0.0.1/' }), ok: false, head: error },
    ]);
  });
});
