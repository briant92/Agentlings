import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Connection } from './connections';
import {
  connectionFromDraft,
  draftProblem,
  mergeConnections,
  readUserConnections,
  userConnectionsFile,
  writeUserConnections,
} from './userconnections';

const SHIPPED: Connection[] = [
  { name: 'github', label: 'Read a code host', transport: 'builtin' },
  { name: 'browser', label: 'Use a web browser', transport: 'stdio', command: 'npx' },
];

const dir = () => mkdtempSync(path.join(tmpdir(), 'userconn-'));

const stdioDraft = {
  name: 'xero',
  label: 'Xero accounting',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@xeroapi/xero-mcp-server@latest'],
  secrets: { XERO_CLIENT_ID: 'client id', XERO_CLIENT_SECRET: 'client secret' },
};

const httpDraft = {
  name: 'desk',
  label: 'Business desk',
  transport: 'http',
  url: 'https://mcp.example.com/v1',
  headers: { Authorization: 'Bearer ${DESK_TOKEN}' },
  secrets: { DESK_TOKEN: 'api token' },
};

describe('the file', () => {
  it('lives under the sandbox root, not in the repo', () => {
    // A `git pull` must never take a user's connections away, and a shipped
    // catalog entry must never arrive as a merge conflict in their file.
    expect(userConnectionsFile('/data/.agentlings')).toBe(
      path.join('/data/.agentlings', 'connections.json'),
    );
  });

  it('round-trips', () => {
    const file = path.join(dir(), 'connections.json');
    const saved = connectionFromDraft(stdioDraft, ['list_contacts']);
    writeUserConnections(file, [saved]);
    expect(readUserConnections(file)).toEqual([saved]);
  });

  it('is empty rather than fatal when absent, unreadable or half-written', () => {
    const d = dir();
    expect(readUserConnections(path.join(d, 'nope.json'))).toEqual([]);
    const broken = path.join(d, 'broken.json');
    writeFileSync(broken, '{not json');
    expect(readUserConnections(broken)).toEqual([]);
    const partial = path.join(d, 'partial.json');
    writeFileSync(partial, JSON.stringify({ connections: [{ label: 'no name' }, null] }));
    expect(readUserConnections(partial)).toEqual([]);
  });

  it('creates the directory it needs', () => {
    const file = path.join(dir(), 'nested', 'deeper', 'connections.json');
    writeUserConnections(file, []);
    expect(readUserConnections(file)).toEqual([]);
  });
});

describe('merging', () => {
  it('puts the shipped catalog first and the user’s own after', () => {
    const mine = connectionFromDraft(httpDraft, ['desk_echo']);
    expect(mergeConnections(SHIPPED, [mine]).map((c) => c.name)).toEqual([
      'github',
      'browser',
      'desk',
    ]);
  });

  /**
   * The one that matters. A user entry called `github` would inherit every
   * grant, recipe and role prompt that already names `github`, and nothing in
   * the app would say so — order alone would decide it, silently.
   */
  it('never lets a user entry take a shipped name, even in a hand-edited file', () => {
    const impostor = { name: 'github', label: 'Not really', transport: 'http' as const, url: 'https://x/' };
    const merged = mergeConnections(SHIPPED, [impostor]);
    expect(merged.filter((c) => c.name === 'github')).toHaveLength(1);
    expect(merged.find((c) => c.name === 'github')?.label).toBe('Read a code host');
  });
});

describe('validating a draft', () => {
  it('accepts a good stdio and a good http one', () => {
    expect(draftProblem(stdioDraft, SHIPPED)).toBeNull();
    expect(draftProblem(httpDraft, SHIPPED)).toBeNull();
  });

  it('needs a name and a label', () => {
    expect(draftProblem({ ...stdioDraft, name: '  ' }, SHIPPED)).toContain('short name');
    expect(draftProblem({ ...stdioDraft, label: '' }, SHIPPED)).toContain('label');
  });

  it('holds the name to what a tool id can carry', () => {
    // It becomes `mcp__<name>__<tool>`, so anything else produces a tool
    // nobody can call — a connection that installs and never works.
    expect(draftProblem({ ...stdioDraft, name: 'Xero' }, SHIPPED)).toContain('lower-case');
    expect(draftProblem({ ...stdioDraft, name: 'my connection' }, SHIPPED)).toContain('lower-case');
    expect(draftProblem({ ...stdioDraft, name: '9lives' }, SHIPPED)).toContain('lower-case');
    expect(draftProblem({ ...stdioDraft, name: 'a' }, SHIPPED)).toContain('lower-case');
    expect(draftProblem({ ...stdioDraft, name: 'x'.repeat(40) }, SHIPPED)).toContain('lower-case');
  });

  it('refuses a name the app already means something by', () => {
    expect(draftProblem({ ...stdioDraft, name: 'github' }, SHIPPED)).toContain('already');
    expect(draftProblem({ ...stdioDraft, name: 'browser' }, SHIPPED)).toContain('already');
    // Reserved even when the catalog handed in does not happen to list them.
    expect(draftProblem({ ...stdioDraft, name: 'web' }, [])).toContain('already');
    expect(draftProblem({ ...stdioDraft, name: 'render' }, [])).toContain('already');
  });

  it('needs a command for stdio and a url for http', () => {
    expect(draftProblem({ ...stdioDraft, command: '' }, SHIPPED)).toContain('command');
    expect(draftProblem({ ...httpDraft, url: '' }, SHIPPED)).toContain('URL');
    expect(draftProblem({ ...httpDraft, url: 'not a url' }, SHIPPED)).toContain('cannot be read');
  });

  it('refuses a transport it does not have', () => {
    expect(draftProblem({ ...stdioDraft, transport: 'builtin' }, SHIPPED)).toContain('stdio');
    expect(draftProblem({ ...stdioDraft, transport: undefined }, SHIPPED)).toContain('stdio');
    expect(draftProblem({ ...stdioDraft, transport: 'sse' }, SHIPPED)).toContain('stdio');
  });

  it('insists on https off this machine, so a credential never rides the wire in clear', () => {
    expect(draftProblem({ ...httpDraft, url: 'http://mcp.example.com/' }, SHIPPED)).toContain('https');
    // Loopback is exempt: that is how a server is tested before it is hosted.
    expect(draftProblem({ ...httpDraft, url: 'http://localhost:4711/' }, SHIPPED)).toBeNull();
    expect(draftProblem({ ...httpDraft, url: 'http://127.0.0.1:4711/' }, SHIPPED)).toBeNull();
  });

  it('holds secret keys to environment-variable names, because that is where they go', () => {
    expect(draftProblem({ ...stdioDraft, secrets: { 'lower case': 'x' } }, SHIPPED)).toContain(
      'environment variable',
    );
    expect(draftProblem({ ...stdioDraft, secrets: { OK_NAME: 'why' } }, SHIPPED)).toBeNull();
  });

  it('refuses shapes rather than trusting a hand-written body', () => {
    expect(draftProblem({ ...stdioDraft, args: 'not a list' }, SHIPPED)).toContain('list');
    expect(draftProblem({ ...httpDraft, headers: ['a'] }, SHIPPED)).toContain('pairs');
    expect(draftProblem({ ...stdioDraft, secrets: 'nope' }, SHIPPED)).toContain('pairs');
  });
});

describe('building the connection', () => {
  it('takes the tools from the SERVER, never from the form', () => {
    // D-044: granting a connection must not grant everything it exposes, and
    // for a server nobody curated the only honest source is the server itself.
    const saved = connectionFromDraft({ ...stdioDraft, tools: ['made-up'] } as never, ['real_tool']);
    expect(saved.tools).toEqual(['real_tool']);
  });

  it('ships OFF, because adding a connection is not granting it', () => {
    expect(connectionFromDraft(stdioDraft, ['t']).defaultOn).toBe(false);
  });

  it('keeps the stdio shape and drops what was not given', () => {
    const saved = connectionFromDraft({ ...stdioDraft, args: [], description: '  ' }, ['t']);
    expect(saved).toMatchObject({ transport: 'stdio', command: 'npx' });
    expect(saved).not.toHaveProperty('args');
    expect(saved).not.toHaveProperty('description');
    expect(saved).not.toHaveProperty('url');
  });

  it('keeps the http shape, headers included', () => {
    const saved = connectionFromDraft(httpDraft, ['desk_echo']);
    expect(saved).toMatchObject({
      transport: 'http',
      url: 'https://mcp.example.com/v1',
      headers: { Authorization: 'Bearer ${DESK_TOKEN}' },
    });
    expect(saved).not.toHaveProperty('command');
  });

  /**
   * `secrets` is name → *why it is needed*, and that description is meant to
   * be stored — Settings shows it. What must never be stored is a VALUE, and
   * the protection is that this function copies only fields it names: a body
   * carrying anything else is dropped rather than merged.
   */
  it('copies only the fields it names, so a value cannot ride along in the body', () => {
    const saved = connectionFromDraft(
      { ...stdioDraft, values: { XERO_CLIENT_SECRET: 'sk-live-must-not-appear' } } as never,
      ['t'],
    );
    expect(JSON.stringify(saved)).not.toContain('sk-live-must-not-appear');
    expect(saved).not.toHaveProperty('values');
    // The declared names and their reasons do survive — that is the point.
    expect(saved.secrets).toEqual({
      XERO_CLIENT_ID: 'client id',
      XERO_CLIENT_SECRET: 'client secret',
    });
  });

  it('trims, so a pasted name does not arrive with a space on it', () => {
    const saved = connectionFromDraft({ ...stdioDraft, name: ' xero ', label: ' Xero ' }, ['t']);
    expect(saved.name).toBe('xero');
    expect(saved.label).toBe('Xero');
  });

  /**
   * The verified-here shelf (D-256): a stored connection is by construction
   * one whose server answered a tool-list read, so what the shelf needs
   * beyond the row is WHEN that happened and WHERE the shape came from —
   * D-245's provenance rule, a source and a date per entry, moved from a
   * shipped file to the thing this install actually connected to.
   */
  it('stamps when the server answered, and where the shape was read', () => {
    const saved = connectionFromDraft(
      { ...stdioDraft, source: 'the MCP registry, entry x/y v1, read 2026-08-25' },
      ['t'],
      '2026-08-25T20:00:00.000Z',
    );
    expect(saved.verifiedAt).toBe('2026-08-25T20:00:00.000Z');
    expect(saved.source).toBe('the MCP registry, entry x/y v1, read 2026-08-25');
  });

  it('a draft with no source was typed by hand, and the row says so', () => {
    expect(connectionFromDraft(stdioDraft, ['t'], '2026-08-25T20:00:00.000Z').source).toBe('typed by hand');
  });

  it('holds the source to a short line of text', () => {
    expect(draftProblem({ ...stdioDraft, source: 42 }, SHIPPED)).toContain('source');
    expect(draftProblem({ ...stdioDraft, source: 'x'.repeat(401) }, SHIPPED)).toContain('source');
    expect(draftProblem({ ...stdioDraft, source: 'the MCP registry' }, SHIPPED)).toBeNull();
  });
});
