import { describe, expect, it } from 'vitest';
import {
  DOORS,
  describe as describeConnections,
  doorEndpoints,
  expandArgs,
  mcpSecretValues,
  mcpToolNames,
  missingSecrets,
  NO_SCREEN,
  resolveForJob,
  toMcpServers,
  type Connection,
  type McpServerSpec,
  sharingSecrets,
} from './connections';

const WEB: Connection = {
  name: 'web',
  label: 'Read web pages',
  transport: 'builtin',
  allow: [],
  maxChars: 12000,
};

const TRACKER: Connection = {
  name: 'tracker',
  label: 'Issue tracker',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'some-mcp-server'],
  secrets: { TRACKER_TOKEN: 'API token for the tracker' },
};

/** A supervised door (D-255): headed, watched, and so it needs a desktop. */
const WATCHED: Connection = {
  name: 'browser-act',
  label: 'Act in a browser you can watch',
  transport: 'stdio',
  supervised: true,
  command: 'npx',
  args: ['-y', '@playwright/mcp@latest'],
};

describe('missingSecrets', () => {
  it('finds nothing missing for a connection that needs none', () => {
    expect(missingSecrets(WEB, {})).toEqual([]);
  });

  it('names what is missing rather than failing silently', () => {
    expect(missingSecrets(TRACKER, {})).toEqual(['TRACKER_TOKEN']);
    expect(missingSecrets(TRACKER, { TRACKER_TOKEN: 'abc' })).toEqual([]);
  });

  it('treats an empty value as missing', () => {
    expect(missingSecrets(TRACKER, { TRACKER_TOKEN: '' })).toEqual(['TRACKER_TOKEN']);
  });
});

describe('describe', () => {
  it('reports readiness without ever exposing a value', () => {
    const listed = describeConnections([WEB, TRACKER], { TRACKER_TOKEN: 'super-secret' });
    expect(listed[0]).toMatchObject({ name: 'web', builtin: true, ready: true });
    expect(listed[1]).toMatchObject({ name: 'tracker', builtin: false, ready: true });
    expect(JSON.stringify(listed)).not.toContain('super-secret');
  });

  it('marks a connection whose secret is absent as not ready', () => {
    const listed = describeConnections([TRACKER], {});
    expect(listed[0].ready).toBe(false);
    expect(listed[0].missingSecrets).toEqual(['TRACKER_TOKEN']);
  });

  it('reports what is on now as well as what ships on', () => {
    const web = { ...WEB, defaultOn: true };
    const on = describeConnections([web], {}, new Set(['web']))[0];
    expect(on).toMatchObject({ defaultOn: true, enabled: true });
    const off = describeConnections([web], {})[0];
    expect(off).toMatchObject({ defaultOn: true, enabled: false });
  });

  // D-255: the one flag the chips, the rule route and the sweeps all read,
  // carried to the UI as a fact — so the row can say a rule cannot hold it.
  it('carries the supervised flag, and only where the catalog set it', () => {
    const act = { ...TRACKER, name: 'browser-act', secrets: undefined, supervised: true };
    const listed = describeConnections([WEB, act], {});
    expect(listed[0].supervised).toBeUndefined();
    expect(listed[1].supervised).toBe(true);
  });
});

describe('resolveForJob', () => {
  const all = [WEB, TRACKER];
  const env = { TRACKER_TOKEN: 'abc' };

  it('grants nothing when a job asked for nothing — sandbox is the default', () => {
    expect(resolveForJob(undefined, all, env).granted).toEqual([]);
    expect(resolveForJob([], all, env).granted).toEqual([]);
  });

  it('grants exactly what was asked for and no more', () => {
    const { granted } = resolveForJob(['web'], all, env);
    expect(granted.map((c) => c.name)).toEqual(['web']);
  });

  it('refuses an unknown connection with a reason', () => {
    const { granted, refused } = resolveForJob(['nope'], all, env);
    expect(granted).toEqual([]);
    expect(refused[0]).toMatchObject({ name: 'nope', reason: 'no such connection' });
  });

  it('refuses a connection whose secret is not set, and says which', () => {
    const { granted, refused } = resolveForJob(['tracker'], all, {});
    expect(granted).toEqual([]);
    expect(refused[0].reason).toContain('TRACKER_TOKEN');
  });

  /**
   * A supervised door on an install with no screen (#24).
   *
   * The window is the point of D-255 — the operator watches it, signs into it,
   * and closing it ends the run — so an install with no desktop cannot hold
   * this door at all. Before this it was granted anyway and the run died at
   * the launch, halfway through work the user had already paid for.
   */
  const watched = [WEB, TRACKER, WATCHED];

  it('refuses a supervised door where no window can be shown, and says why', () => {
    const { granted, refused } = resolveForJob(['browser-act'], watched, env, false);
    expect(granted).toEqual([]);
    expect(refused[0]).toMatchObject({ name: 'browser-act' });
    expect(refused[0].reason).toContain('screen');
  });

  it('grants it where there is a screen — this machine, unchanged', () => {
    const { granted, refused } = resolveForJob(['browser-act'], watched, env, true);
    expect(granted.map((c) => c.name)).toEqual(['browser-act']);
    expect(refused).toEqual([]);
  });

  it('refuses only the supervised door, and grants the rest of the same ask', () => {
    // The refusal is per door, not per job: a hosted install still gets its
    // web and its tracker out of an ask that also wanted the watched browser.
    const { granted, refused } = resolveForJob(['web', 'browser-act', 'tracker'], watched, env, false);
    expect(granted.map((c) => c.name)).toEqual(['web', 'tracker']);
    expect(refused.map((r) => r.name)).toEqual(['browser-act']);
  });

  it('leaves an unsupervised door alone on the same screenless install', () => {
    expect(resolveForJob(['web'], watched, env, false).granted.map((c) => c.name)).toEqual(['web']);
  });

  it('asks this install itself when the caller says nothing', () => {
    // The argument every test above passes is the argument production never
    // does — so without this one, replacing the default with a bare `true`
    // leaves the whole suite green while the deployed install grants the door
    // it cannot open. A mutation run found exactly that.
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    const { DISPLAY, WAYLAND_DISPLAY } = process.env;
    try {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      delete process.env.DISPLAY;
      delete process.env.WAYLAND_DISPLAY;
      const { granted, refused } = resolveForJob(['browser-act'], watched, env);
      expect(granted).toEqual([]);
      expect(refused[0]).toMatchObject({ name: 'browser-act', reason: NO_SCREEN });
    } finally {
      if (platform) Object.defineProperty(process, 'platform', platform);
      if (DISPLAY !== undefined) process.env.DISPLAY = DISPLAY;
      if (WAYLAND_DISPLAY !== undefined) process.env.WAYLAND_DISPLAY = WAYLAND_DISPLAY;
    }
  });
});

// allowedTools is a strict allowlist and the only MCP name that ever reached
// it was hardcoded, so an stdio connection could be configured and then have
// every one of its tools refused. Never noticed: none has been installed.
describe('mcpToolNames', () => {
  it('qualifies each named tool with its connection', () => {
    expect(mcpToolNames([{ ...WEB, tools: ['fetch_page'] }])).toEqual(['mcp__web__fetch_page']);
  });

  it('is the grant, so a server can be adopted for part of what it offers', () => {
    const browser: Connection = {
      name: 'browser',
      label: 'Browse',
      transport: 'stdio',
      command: 'npx',
      tools: ['browser_navigate', 'browser_snapshot'],
    };
    expect(mcpToolNames([browser])).toEqual([
      'mcp__browser__browser_navigate',
      'mcp__browser__browser_snapshot',
    ]);
    expect(mcpToolNames([browser])).not.toContain('mcp__browser__browser_click');
  });

  it('contributes nothing for a connection that names no tools', () => {
    expect(mcpToolNames([WEB])).toEqual([]);
  });

  it('covers every granted connection at once', () => {
    const a = { ...WEB, tools: ['fetch_page'] };
    const b = { ...TRACKER, tools: ['search'] };
    expect(mcpToolNames([a, b])).toEqual(['mcp__web__fetch_page', 'mcp__tracker__search']);
  });
});

describe('expandArgs', () => {
  it('fills a variable that is set', () => {
    expect(expandArgs(['--storage-state=${STATE}'], { STATE: '/tmp/s.json' })).toEqual([
      '--storage-state=/tmp/s.json',
    ]);
  });

  // Dropping rather than passing it empty is what makes signing in optional:
  // --storage-state= with no path is an error, absent is a signed-out browser.
  it('drops the whole argument when the variable is unset', () => {
    expect(expandArgs(['--headless', '--storage-state=${STATE}'], {})).toEqual(['--headless']);
    expect(expandArgs(['--storage-state=${STATE}'], { STATE: '' })).toEqual([]);
  });

  it('leaves ordinary arguments alone', () => {
    const plain = ['-y', '@playwright/mcp@latest', '--isolated'];
    expect(expandArgs(plain, {})).toEqual(plain);
  });

  // The value is a Windows path in practice, and a replacement that ate a
  // backslash would break every real one.
  it('keeps a path intact', () => {
    const p = String.raw`C:\Users\MSI\browser-state.json`;
    expect(expandArgs(['--storage-state=${S}'], { S: p })).toEqual([`--storage-state=${p}`]);
  });
});

/** Narrow the union in a test without repeating the assertion at every call. */
const stdio = (s: McpServerSpec): Extract<McpServerSpec, { type: 'stdio' }> => {
  if (s.type !== 'stdio') throw new Error(`expected a stdio server, got ${s.type}`);
  return s;
};
const http = (s: McpServerSpec): Extract<McpServerSpec, { type: 'http' }> => {
  if (s.type !== 'http') throw new Error(`expected an http server, got ${s.type}`);
  return s;
};

/** A remote MCP server: the Wave 2 transport, credentialed by a header. */
const DESK: Connection = {
  name: 'desk',
  label: 'Business desk',
  transport: 'http',
  url: 'https://mcp.example.com/v1',
  headers: { Authorization: 'Bearer ${DESK_TOKEN}', 'X-Api-Version': '2026-01-01' },
  secrets: { DESK_TOKEN: 'API token for the desk' },
};

describe('toMcpServers', () => {
  it('names only the declared secrets, as placeholders', () => {
    const servers = toMcpServers([TRACKER], { TRACKER_TOKEN: 'abc', UNRELATED: 'leak-me' });
    expect(servers.tracker).toMatchObject({
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'some-mcp-server'],
      env: { TRACKER_TOKEN: '${TRACKER_TOKEN}' },
    });
    expect(stdio(servers.tracker).env).not.toHaveProperty('UNRELATED');
  });

  it('omits a secret with no value, rather than naming one the runner cannot resolve', () => {
    expect(stdio(toMcpServers([TRACKER], {}).tracker).env).toEqual({});
  });

  it('does not try to spawn the builtin', () => {
    expect(toMcpServers([WEB], {})).toEqual({});
  });

  /**
   * The seam the security trade found (D-240) and the reason this function
   * stopped filling values in: what it returns is serialized into
   * `.session.json` **inside the sandbox the agentling reads all job long**.
   * It leaked nothing at the time — `browser` is the only stdio connection in
   * the catalog and it declares no secrets — but that was a fact about the
   * catalog, not about the code, and Wave 2 is what changes the catalog.
   *
   * Written against the serialized string rather than the object, because that
   * is what actually lands on disk, and it covers `args` too — so a future
   * connection that puts a token in an argument fails here rather than
   * shipping quiet.
   */
  it('never lets a secret VALUE reach the config that lands in the sandbox', () => {
    const env = {
      TRACKER_TOKEN: 'sk-live-must-not-appear',
      DESK_TOKEN: 'bearer-must-not-appear',
      UNRELATED: 'leak-me',
    };
    // Every transport that can carry a credential, in one string, because the
    // string is what lands on disk. `http` is here from its first day rather
    // than after somebody notices: an Authorization header is a bearer token
    // and would have been the second instance of the seam D-242 closed.
    const onDisk = JSON.stringify(toMcpServers([TRACKER, DESK, WEB], env));
    expect(onDisk).not.toContain('sk-live-must-not-appear');
    expect(onDisk).not.toContain('bearer-must-not-appear');
    expect(onDisk).not.toContain('leak-me');
  });
});

describe('toMcpServers — the http transport (Wave 2)', () => {
  it('emits the SDK shape, with the credential named rather than filled', () => {
    expect(toMcpServers([DESK], { DESK_TOKEN: 'bearer-abc' }).desk).toEqual({
      type: 'http',
      url: 'https://mcp.example.com/v1',
      headers: { Authorization: 'Bearer ${DESK_TOKEN}', 'X-Api-Version': '2026-01-01' },
    });
  });

  it('keeps a constant header, which is not a secret and has nothing to resolve', () => {
    const headers = http(toMcpServers([DESK], {}).desk).headers;
    expect(headers['X-Api-Version']).toBe('2026-01-01');
  });

  it('DROPS a header whose secret is unset rather than sending an empty one', () => {
    // `Authorization: Bearer ` is a request that looks authenticated and is
    // not, and the far end's error would say nothing about the missing key.
    expect(http(toMcpServers([DESK], {}).desk).headers).not.toHaveProperty('Authorization');
  });

  it('ignores an http connection with no url, the way stdio ignores one with no command', () => {
    expect(toMcpServers([{ ...DESK, url: undefined }], { DESK_TOKEN: 'x' })).toEqual({});
  });

  it('carries no `sse`, because nothing asked for it yet', () => {
    // Pinned so the absence reads as a decision rather than an oversight
    // (D-243): the SDK accepts `sse` and adding it is one line the day
    // something we want speaks only that.
    const spec = toMcpServers([DESK], { DESK_TOKEN: 'x' }).desk;
    expect(spec.type).toBe('http');
  });
});

describe('mcpSecretValues — the half that never touches the sandbox', () => {
  it('carries the real values for the granted stdio connections', () => {
    expect(mcpSecretValues([TRACKER], { TRACKER_TOKEN: 'abc', UNRELATED: 'leak-me' })).toEqual({
      TRACKER_TOKEN: 'abc',
    });
  });

  it('is empty for a builtin, and for a job that grants no stdio connection at all', () => {
    expect(mcpSecretValues([WEB], { TRACKER_TOKEN: 'abc' })).toEqual({});
    expect(mcpSecretValues([], { TRACKER_TOKEN: 'abc' })).toEqual({});
  });

  it('carries the credential of an http connection too, over the same channel', () => {
    expect(mcpSecretValues([DESK], { DESK_TOKEN: 'bearer-abc' })).toEqual({
      DESK_TOKEN: 'bearer-abc',
    });
  });

  it('names exactly what an http placeholder asks for, so neither half can drift', () => {
    const env = { DESK_TOKEN: 'bearer-abc' };
    const headers = http(toMcpServers([DESK], env).desk).headers;
    expect(headers.Authorization).toBe('Bearer ${DESK_TOKEN}');
    expect(mcpSecretValues([DESK], env)).toHaveProperty('DESK_TOKEN');
  });

  it('names exactly what the placeholders ask for, so neither half can drift', () => {
    const env = { TRACKER_TOKEN: 'abc' };
    const placeholders = Object.values(stdio(toMcpServers([TRACKER], env).tracker).env);
    const values = mcpSecretValues([TRACKER], env);
    expect(placeholders).toEqual(Object.keys(values).map((n) => `\${${n}}`));
  });
});

import { fileURLToPath } from 'node:url';
import { readConnections } from './connections';

describe('kind (UI.md, step 7)', () => {
  it('reads the sender flag the catalog already declares, so Settings can split reads from sends', () => {
    const [web, telegram] = describeConnections(
      [
        { name: 'web', label: 'Read web pages', transport: 'builtin' },
        { name: 'telegram', label: 'Send Telegram messages', transport: 'builtin', sendsOnly: true },
      ],
      {},
    );
    expect(web.kind).toBe('read');
    expect(telegram.kind).toBe('send');
  });

  it('pins the catalog: exactly the four senders are sends-only', () => {
    const file = fileURLToPath(new URL('../../catalog/connections.json', import.meta.url));
    const connections = readConnections(file);
    expect(connections.length).toBeGreaterThan(0);
    expect(
      connections
        .filter((c) => c.sendsOnly)
        .map((c) => c.name)
        .sort(),
    ).toEqual(['google', 'slack', 'telegram', 'whatsapp-business']);
  });
});

describe('credentialed and shared secrets (D-218)', () => {
  const GOOGLE: Connection = {
    name: 'google',
    label: 'Google',
    transport: 'builtin',
    secrets: { G_ID: 'client', G_REFRESH: 'refresh' },
  };
  const MAIL: Connection = {
    name: 'mail',
    label: 'Mail',
    transport: 'builtin',
    secrets: { G_ID: 'client', G_REFRESH: 'refresh' },
  };

  it('says which connections hold a secret at all', () => {
    const listed = describeConnections([WEB, TRACKER], { TRACKER_TOKEN: 'x' });
    expect(listed.map((c) => c.credentialed)).toEqual([false, true]);
  });

  it('names the connections that share a secret, from one helper the route reuses', () => {
    expect(sharingSecrets(GOOGLE, [WEB, GOOGLE, MAIL, TRACKER])).toEqual(['mail']);
    expect(sharingSecrets(TRACKER, [WEB, GOOGLE, MAIL, TRACKER])).toEqual([]);
    const listed = describeConnections([GOOGLE, MAIL], { G_ID: 'a', G_REFRESH: 'b' });
    expect(listed.map((c) => c.sharesSecretsWith)).toEqual([['mail'], ['google']]);
  });
});

/**
 * D-271, and the reason this test exists at all: when the listener gained the
 * right to move off 4600, the door URLs did not move with it. They were built
 * from `SERVER_PORT = 4600` in `@agentlings/shared` — a second answer to a
 * question that now had a variable one — so a hosted install would have
 * listened on `PORT` while every door dialled a port nothing was on. The kind
 * of change that is complete in the type, the spec and the route and reaches
 * nothing.
 *
 * `listenPort()` reads the live environment, which is why this restores it.
 */
describe('the doors dial the port this install is actually on', () => {
  const withPort = <T>(port: string | undefined, fn: () => T): T => {
    const had = process.env.PORT;
    if (port === undefined) delete process.env.PORT;
    else process.env.PORT = port;
    try {
      return fn();
    } finally {
      if (had === undefined) delete process.env.PORT;
      else process.env.PORT = had;
    }
  };

  it('is 4600 when nothing moved it, which is every install today', () => {
    expect(withPort(undefined, () => doorEndpoints(['web']))).toEqual({
      web: 'http://127.0.0.1:4600/internal/fetch',
    });
  });

  it('follows the port a host injected', () => {
    expect(withPort('8080', () => doorEndpoints(['web']))).toEqual({
      web: 'http://127.0.0.1:8080/internal/fetch',
    });
  });

  it('stays on loopback wherever the listener went', () => {
    // The door is the runner talking to its own server from inside this
    // machine. Moving the bind is not permission to dial anywhere else.
    for (const url of Object.values(withPort('8080', () => doorEndpoints(Object.keys(DOORS))))) {
      expect(url.startsWith('http://127.0.0.1:8080/internal/')).toBe(true);
    }
  });
});
