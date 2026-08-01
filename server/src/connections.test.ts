import { describe, expect, it } from 'vitest';
import {
  describe as describeConnections,
  expandArgs,
  mcpToolNames,
  missingSecrets,
  resolveForJob,
  toMcpServers,
  type Connection,
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

describe('toMcpServers', () => {
  it('passes only the declared secrets through to the server', () => {
    const servers = toMcpServers([TRACKER], { TRACKER_TOKEN: 'abc', UNRELATED: 'leak-me' });
    expect(servers.tracker).toMatchObject({
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'some-mcp-server'],
      env: { TRACKER_TOKEN: 'abc' },
    });
    expect(servers.tracker.env).not.toHaveProperty('UNRELATED');
  });

  it('does not try to spawn the builtin', () => {
    expect(toMcpServers([WEB], {})).toEqual({});
  });
});
