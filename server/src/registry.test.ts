import { describe, expect, it } from 'vitest';
import type { Connection } from './connections';
import { draftProblem } from './userconnections';
import { fillFromEntry, searchRegistry, type RegistryServer } from './registry';

/**
 * `suggestions.test.ts` retired with the D-245 chips (D-256, #15). Its rules
 * did not: every fill must pass the form's own validation, none may carry
 * tools, every one names its source and the page to check it against, and an
 * http fill is https-only. They are held here, against the registry's shapes
 * instead of a shipped file — and the fixtures below are real entries, read
 * from `registry.modelcontextprotocol.io/v0.1/servers` on 2026-08-25, because
 * a made-up entry would only prove that the mapping reads what we imagined.
 */

const READ_ON = '2026-08-25';
const opts = (taken: string[] = []) => ({ readOn: READ_ON, taken: new Set(taken) });

const brave: RegistryServer = {
  name: 'io.github.brave/brave-search-mcp-server',
  description: 'Brave Search MCP Server: web results, images, videos, rich results, AI summaries, and more.',
  repository: { url: 'https://github.com/brave/brave-search-mcp-server', source: 'github' },
  version: '2.1.3',
  packages: [
    {
      registryType: 'npm',
      identifier: '@brave/brave-search-mcp-server',
      version: '2.1.3',
      transport: { type: 'stdio' },
      environmentVariables: [
        { description: 'Your API key for the service', isRequired: true, isSecret: true, name: 'BRAVE_API_KEY' },
      ],
    },
  ],
};

const smithery: RegistryServer = {
  name: 'ai.smithery/smithery-notion',
  description: 'Notion through Smithery.',
  version: '1.0.0',
  remotes: [
    {
      type: 'streamable-http',
      url: 'https://server.smithery.ai/@smithery/notion/mcp',
      headers: [
        {
          description: 'Bearer token for Smithery authentication',
          isRequired: true,
          value: 'Bearer {smithery_api_key}',
          isSecret: true,
          name: 'Authorization',
        },
      ],
    },
  ],
};

const github: RegistryServer = {
  name: 'io.github.github/github-mcp-server',
  title: 'GitHub',
  description: 'Connect AI assistants to GitHub.',
  repository: { url: 'https://github.com/github/github-mcp-server', source: 'github' },
  version: '1.11.0',
  packages: [{ registryType: 'oci', identifier: 'ghcr.io/github/github-mcp-server:1.11.0', transport: { type: 'stdio' } }],
  remotes: [
    {
      type: 'streamable-http',
      url: 'https://api.githubcopilot.com/mcp/',
      headers: [{ description: 'Authorization header with authentication token (PAT or App token)', isSecret: true, name: 'Authorization' }],
    },
  ],
};

const alphavantage: RegistryServer = {
  name: 'io.github.alphavantage/alpha_vantage_mcp',
  description: 'Alpha Vantage market data.',
  repository: { url: 'https://github.com/alphavantage/alpha_vantage_mcp', source: 'github' },
  version: '1.0.0',
  remotes: [{ type: 'sse', url: 'https://mcp.alphavantage.co/mcp' }],
};

const nordic: RegistryServer = {
  name: 'eu.nordicmcp/stripe',
  title: 'NordicMCP — Stripe',
  description: 'Hosted Stripe MCP server.',
  version: '1.0.0',
  websiteUrl: 'https://nordicmcp.eu/docs/integrations/stripe',
  remotes: [
    {
      type: 'streamable-http',
      url: 'https://nordicmcp.eu/mcp/stripe/{token}',
      variables: { token: { description: 'Your NordicMCP API token', isRequired: true, isSecret: true } },
    },
  ],
};

const mediumOps: RegistryServer = {
  name: 'io.github.06ketan/medium-ops',
  description: 'Medium.',
  version: '0.1.2',
  packages: [
    {
      registryType: 'pypi',
      identifier: 'medium-ops',
      version: '0.1.2',
      runtimeHint: 'uvx',
      transport: { type: 'stdio' },
      environmentVariables: [{ name: 'MEDIUM_INTEGRATION_TOKEN', isSecret: true }, { name: 'MEDIUM_USERNAME' }],
      packageArguments: [
        { value: 'mcp', type: 'positional' },
        { value: 'serve', type: 'positional' },
      ],
    },
  ],
};

const registry = (...entries: [RegistryServer, { isLatest?: boolean; status?: string }][]) =>
  JSON.stringify({
    servers: entries.map(([server, meta]) => ({
      server,
      _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active', isLatest: true, ...meta } },
    })),
    metadata: { count: entries.length },
  });

const answering = (body: string, status = 200): typeof fetch =>
  (async () => new Response(body, { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;

describe('filling the form from one registry entry', () => {
  it('an npm package becomes a command this machine runs, with the env names it declares', () => {
    const got = fillFromEntry(brave, opts());
    expect(got).toMatchObject({
      fill: {
        name: 'brave-search-mcp-server',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@brave/brave-search-mcp-server@2.1.3'],
        secrets: { BRAVE_API_KEY: 'Your API key for the service' },
        docs: 'https://github.com/brave/brave-search-mcp-server',
      },
    });
  });

  it('a remote with a templated header becomes an https address and a ${NAME} placeholder', () => {
    const got = fillFromEntry(smithery, opts());
    expect(got).toMatchObject({
      fill: {
        transport: 'http',
        url: 'https://server.smithery.ai/@smithery/notion/mcp',
        headers: { Authorization: 'Bearer ${SMITHERY_API_KEY}' },
        secrets: { SMITHERY_API_KEY: 'Bearer token for Smithery authentication' },
      },
    });
  });

  it('a secret Authorization header with no shape is carried as Bearer, and says that was assumed', () => {
    // The whole header value cannot be the secret: a pasted value with a
    // space in it is refused at the door (`secretValueProblem`), and every
    // remote in the registry that does spell its header out spells Bearer.
    const got = fillFromEntry(github, opts());
    if (!('fill' in got)) throw new Error(got.why);
    expect(got.fill.transport).toBe('http');
    expect(got.fill.url).toBe('https://api.githubcopilot.com/mcp/');
    expect(got.fill.headers).toEqual({ Authorization: 'Bearer ${GITHUB_MCP_SERVER_TOKEN}' });
    expect(got.fill.secrets?.GITHUB_MCP_SERVER_TOKEN).toMatch(/Bearer .*assumed/);
    // The docker image was passed over, not turned into a command.
    expect(got.fill).not.toHaveProperty('command');
  });

  it('a name the app already uses gets a suffix rather than a dead end', () => {
    const got = fillFromEntry(github, opts(['github-mcp-server']));
    expect('fill' in got && got.fill.name).toBe('github-mcp-server-2');
    const reserved = fillFromEntry({ ...github, name: 'x/browser' }, opts());
    expect('fill' in reserved && reserved.fill.name).toBe('browser-2');
  });

  it('a python package becomes a uvx command, arguments after the package', () => {
    const got = fillFromEntry(mediumOps, opts());
    expect(got).toMatchObject({
      fill: {
        transport: 'stdio',
        command: 'uvx',
        args: ['medium-ops@0.1.2', 'mcp', 'serve'],
        secrets: { MEDIUM_INTEGRATION_TOKEN: 'needed by this server', MEDIUM_USERNAME: 'needed by this server' },
      },
    });
  });

  it('an SSE-only address is passed over, by name — the form has no such transport (D-243)', () => {
    const got = fillFromEntry(alphavantage, opts());
    expect(got).toEqual({ why: expect.stringMatching(/SSE/) });
  });

  it('a key inside the address is passed over, by name — it would sit in the job’s own folder (D-262)', () => {
    const got = fillFromEntry(nordic, opts());
    expect(got).toEqual({ why: expect.stringMatching(/inside its address/) });
  });

  it('every fill passes the add form’s own validation — a fill that cannot be submitted is a dead end', () => {
    for (const entry of [brave, smithery, github, mediumOps]) {
      const got = fillFromEntry(entry, opts());
      if (!('fill' in got)) throw new Error(got.why);
      expect([entry.name, draftProblem(got.fill, [])]).toEqual([entry.name, null]);
    }
  });

  it('never carries tools — those come from the server (D-244) — and always says where it was read', () => {
    for (const entry of [brave, smithery, github, mediumOps]) {
      const got = fillFromEntry(entry, opts());
      if (!('fill' in got)) throw new Error(got.why);
      expect(got.fill).not.toHaveProperty('tools');
      expect(got.fill.source).toContain(entry.name);
      expect(got.fill.source).toContain(entry.version ?? '');
      expect(got.fill.source).toContain(READ_ON);
    }
  });

  it('takes the title as the label when the registry gives one, else a readable form of the name', () => {
    const titled = fillFromEntry(github, opts());
    expect('fill' in titled && titled.fill.label).toBe('GitHub');
    const untitled = fillFromEntry(brave, opts());
    expect('fill' in untitled && untitled.fill.label).toBe('brave search mcp server');
  });
});

describe('searching the registry', () => {
  it('lists one fill per matching entry, latest and active only, and names what it passed over', async () => {
    const fetchImpl = answering(
      registry(
        [brave, {}],
        [{ ...brave, version: '2.0.0' }, { isLatest: false }],
        [smithery, { status: 'deprecated' }],
        [alphavantage, {}],
      ),
    );
    const got = await searchRegistry('brave', { fetchImpl, ...opts() });
    expect(got).toMatchObject({
      ok: true,
      hits: [{ id: 'io.github.brave/brave-search-mcp-server', version: '2.1.3' }],
      omitted: [{ id: 'io.github.alphavantage/alpha_vantage_mcp' }],
    });
  });

  it('asks the registry for the words typed, and no more than it will answer', async () => {
    let asked = '';
    const fetchImpl = (async (input: RequestInfo | URL) => {
      asked = String(input);
      return new Response(registry(), { status: 200 });
    }) as typeof fetch;
    await searchRegistry('alpha vantage', { fetchImpl, ...opts() });
    expect(asked).toContain('search=alpha%20vantage');
    expect(asked).toMatch(/limit=(\d+)/);
    expect(Number(/limit=(\d+)/.exec(asked)?.[1])).toBeLessThanOrEqual(100);
  });

  it('nothing matching is an empty, ok answer — not an error', async () => {
    const got = await searchRegistry('zzz', { fetchImpl: answering(registry()), ...opts() });
    expect(got).toEqual({ ok: true, query: 'zzz', hits: [], omitted: [], truncated: false });
  });

  it('a second page the browse did not read is said, not dropped — the same rule as unreachable', async () => {
    const page = JSON.parse(registry([brave, {}]));
    page.metadata.nextCursor = 'io.github.brave/brave-search-mcp-server:2.1.3';
    const got = await searchRegistry('brave', { fetchImpl: answering(JSON.stringify(page)), ...opts() });
    expect(got.ok && got.truncated).toBe(true);
  });

  it('the registry unreachable is a NAMED state, never an empty list', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const got = await searchRegistry('brave', { fetchImpl: down, ...opts() });
    expect(got).toEqual({ ok: false, error: expect.stringMatching(/could not be reached/) });
  });

  it('the registry answering badly is the same named state, with what it said', async () => {
    const got = await searchRegistry('brave', { fetchImpl: answering('gateway timeout', 504), ...opts() });
    expect(got).toEqual({ ok: false, error: expect.stringMatching(/504/) });
    const garbled = await searchRegistry('brave', { fetchImpl: answering('<html>'), ...opts() });
    expect(garbled.ok).toBe(false);
  });

  it('a taken name in the live list is suffixed in the fill, the same as for one entry', async () => {
    const installed: Connection[] = [{ name: 'brave-search-mcp-server', label: 'x', transport: 'stdio' }];
    const got = await searchRegistry('brave', {
      fetchImpl: answering(registry([brave, {}])),
      readOn: READ_ON,
      taken: new Set(installed.map((c) => c.name)),
    });
    expect(got.ok && got.hits[0]?.fill.name).toBe('brave-search-mcp-server-2');
  });
});
