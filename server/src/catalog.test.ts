import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mcpToolNames, readConnections, resolveForJob } from './connections';
import { grantedTools } from './settings';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FILE = path.join(ROOT, 'catalog', 'connections.json');
const all = readConnections(FILE);
const browser = all.find((c) => c.name === 'browser');

/**
 * The shipped catalog, not a fixture.
 *
 * A connection's tool list *is* its grant, so these assertions are the actual
 * security boundary rather than a description of one. Playwright MCP offers 24
 * tools and twelve of them act on the far end; the app's safety model is a
 * sandbox reviewed before anything is promoted, and a submitted form cannot be
 * reviewed afterwards. Adding one of these names is a decision about that
 * model, which is why breaking this test should be uncomfortable.
 */
describe('the browser connection is read-only', () => {
  const ACTS = [
    'browser_click',
    'browser_type',
    'browser_fill_form',
    'browser_press_key',
    'browser_select_option',
    'browser_drag',
    'browser_drop',
    'browser_file_upload',
    'browser_handle_dialog',
    'browser_evaluate',
    'browser_run_code_unsafe',
    'browser_network_request',
  ];

  it('is in the catalog and ships off', () => {
    expect(browser).toBeDefined();
    expect(browser?.defaultOn).not.toBe(true);
  });

  it('grants no tool that changes anything on the far end', () => {
    for (const name of ACTS) expect(browser?.tools ?? []).not.toContain(name);
  });

  it('grants the reading tools it exists for', () => {
    expect(browser?.tools).toContain('browser_navigate');
    expect(browser?.tools).toContain('browser_snapshot');
  });

  it('needs no secret, because signing in is a file the user makes', () => {
    expect(browser?.secrets).toBeUndefined();
  });
});

/**
 * The first sending connection, and the boundary that makes it safe: it puts
 * nothing in front of a model. Sends happen when the user approves a reviewed
 * outbox (D-075) — so the tool list is empty, and widening it is a decision
 * about the safety model, exactly like adding a browser acting tool above.
 */
describe('the telegram connection sends only at approval', () => {
  const telegram = all.find((c) => c.name === 'telegram');

  it('is in the catalog and ships off, like everything credentialed', () => {
    expect(telegram).toBeDefined();
    expect(telegram?.defaultOn).not.toBe(true);
  });

  it('grants a session no tools at all', () => {
    expect(telegram?.tools).toEqual([]);
  });

  it('declares the bot token it can never be live without', () => {
    expect(Object.keys(telegram?.secrets ?? {})).toEqual(['TELEGRAM_BOT_TOKEN']);
  });
});

/**
 * The settings drawer renders each credentialed connection's walkthrough from
 * the catalog — an empty one is a drawer with a field and no way to know what
 * goes in it, which is the non-expert setup rule (D-011) failed quietly.
 */
describe('every credentialed connection carries its setup steps', () => {
  it.each(all.filter((c) => c.secrets).map((c) => [c.name, c] as const))(
    '%s explains where its secret comes from',
    (_, connection) => {
      expect(connection.setup?.length ?? 0).toBeGreaterThan(0);
    },
  );
});

describe('what a job is actually allowed to call', () => {
  it('reaches the web tool through the catalog rather than a special case', () => {
    const names = grantedTools(undefined, all, {}, {});
    const { granted } = resolveForJob(names, all, {});
    expect(mcpToolNames(granted)).toEqual(['mcp__web__fetch_page']);
  });

  it('adds only the reading half of the browser when it is switched on', () => {
    const names = grantedTools(['browser'], all, { connections: { browser: true } }, {});
    const { granted } = resolveForJob(names, all, {});
    const tools = mcpToolNames(granted);
    expect(tools).toContain('mcp__browser__browser_snapshot');
    expect(tools).not.toContain('mcp__browser__browser_click');
  });

  it('is not reachable at all while it is off, however a job asks', () => {
    const names = grantedTools(['browser'], all, {}, {});
    expect(names).not.toContain('browser');
  });
});

/**
 * The same boundary on the code host, and the same reason it is asserted here
 * rather than described in a comment: the catalog's `tools` list is the grant,
 * and `/internal/github` refuses anything the list does not name.
 *
 * The twelve below are the acting tools the reference GitHub MCP server
 * exposes, enumerated by speaking JSON-RPC to it rather than reading its
 * README (D-034's method, D-040's application). Adding one is a decision about
 * the safety model — a merged pull request cannot be reviewed afterwards —
 * which is why breaking this test should be uncomfortable.
 */
describe('the code host connection is read-only', () => {
  const github = all.find((c) => c.name === 'github');
  const ACTS = [
    'create_or_update_file',
    'create_repository',
    'push_files',
    'create_issue',
    'create_pull_request',
    'fork_repository',
    'create_branch',
    'update_issue',
    'add_issue_comment',
    'create_pull_request_review',
    'merge_pull_request',
    'update_pull_request_branch',
  ];

  it('ships, and grants only reading tools', () => {
    expect(github).toBeDefined();
    for (const name of ACTS) expect(github!.tools ?? []).not.toContain(name);
  });

  it('grants something, so the test cannot pass by the connection being empty', () => {
    expect((github!.tools ?? []).length).toBeGreaterThan(0);
    expect(github!.tools).toContain('list_issues');
  });

  // Credentialed connections ship off: they carry a token and read on the
  // user's behalf, which is a different decision from reading a public page.
  it('ships off and cannot be switched on without its secret', () => {
    expect(github!.defaultOn).not.toBe(true);
    expect(Object.keys(github!.secrets ?? {})).toContain('GITHUB_TOKEN');
    expect(grantedTools(['github'], all, {}, {})).not.toContain('github');
  });
});

/**
 * Finding a page, as against reading one. It exists because the gap was
 * measured: a session that cannot search does not refuse, it substitutes —
 * once cheaply into model knowledge, once expensively into the browser, where
 * it died (D-053).
 */
describe('the search connection', () => {
  const search = all.find((c) => c.name === 'search');

  it('ships, granting exactly the one tool it is for', () => {
    expect(search).toBeDefined();
    expect(search!.tools).toEqual(['search_web']);
  });

  /**
   * Asserted through `resolveForJob` and `mcpToolNames`, not off `grantedTools`
   * — that one returns *connection* names, so `not.toContain('search_web')`
   * would pass however broken the gate was. The first draft of these tests did
   * exactly that, which is the vacuous-check trap this project has hit before.
   */
  const callable = (settings: object, env: Record<string, string>): string[] => {
    const names = grantedTools(['search'], all, settings, env);
    return mcpToolNames(resolveForJob(names, all, env).granted);
  };

  it('ships off, so asking for it is not enough on its own', () => {
    expect(search!.defaultOn).not.toBe(true);
    expect(Object.keys(search!.secrets ?? {})).toEqual(['BRAVE_API_KEY']);
    expect(callable({}, {})).not.toContain('mcp__search__search_web');
  });

  // Switched on but with no key is still nothing: a connection whose secret is
  // missing is never live, whatever the user or the default says.
  it('stays refused when the key is missing even if it is switched on', () => {
    expect(callable({ connections: { search: true } }, {})).not.toContain(
      'mcp__search__search_web',
    );
  });

  it('becomes callable once the key exists and the user asks for it', () => {
    expect(callable({ connections: { search: true } }, { BRAVE_API_KEY: 'k' })).toContain(
      'mcp__search__search_web',
    );
  });
});
