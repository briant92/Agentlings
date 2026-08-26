import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mcpToolNames, readConnections, resolveForJob } from './connections';
import { GOOGLE_SCOPES } from './google';
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
  it('reaches the web and render tools through the catalog rather than a special case', () => {
    const names = grantedTools(undefined, all, {}, {});
    const { granted } = resolveForJob(names, all, {});
    expect(mcpToolNames(granted).sort()).toEqual([
      'mcp__render__render_pdf',
      'mcp__render__render_plate',
      'mcp__web__fetch_page',
    ]);
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
 * The renderer prints a run's own HTML and reaches nothing — no secret, no
 * network (every request the page makes is aborted, render.test.ts proves it
 * against a live listener; the plate tool's one vendored exception is served
 * from disk and proved the same way). What is asserted here is the grant
 * shape: the two tools, builtin, on by default like `web`, and the settings
 * switch still authoritative over both.
 */
describe('the render connection', () => {
  const render = all.find((c) => c.name === 'render');

  it('grants exactly the print and plate tools, with nothing to configure', () => {
    expect(render?.transport).toBe('builtin');
    expect(render?.defaultOn).toBe(true);
    expect(render?.tools).toEqual(['render_pdf', 'render_plate']);
    expect(render?.secrets).toBeUndefined();
  });

  it('obeys the switch: off in settings means unreachable, defaultOn or not', () => {
    const names = grantedTools(undefined, all, { connections: { render: false } }, {});
    const { granted } = resolveForJob(names, all, {});
    expect(mcpToolNames(granted)).not.toContain('mcp__render__render_pdf');
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

/**
 * The first reading sibling on the Google consent (D-158): it reuses the
 * three secrets the Connect flow stores — ready the moment google is, never
 * before — behind its own switch and its own grant. The connection it rides
 * stays a sender granting nothing, because one switch and one grant must
 * never cover both reading and sending.
 */
describe('the calendar connection reads only', () => {
  const calendar = all.find((c) => c.name === 'calendar');
  const google = all.find((c) => c.name === 'google');

  const callable = (settings: object, env: Record<string, string>): string[] => {
    const names = grantedTools(['calendar'], all, settings, env);
    return mcpToolNames(resolveForJob(names, all, env).granted);
  };

  it('ships off and grants exactly the one reading tool', () => {
    expect(calendar).toBeDefined();
    expect(calendar?.defaultOn).not.toBe(true);
    expect(calendar?.sendsOnly).not.toBe(true);
    expect(calendar?.tools).toEqual(['calendar_events']);
  });

  it('declares the google secrets rather than minting its own', () => {
    expect(Object.keys(calendar?.secrets ?? {}).sort()).toEqual([
      'GOOGLE_OAUTH_CLIENT_ID',
      'GOOGLE_OAUTH_CLIENT_SECRET',
      'GOOGLE_OAUTH_REFRESH_TOKEN',
    ]);
  });

  it('leaves google a sender that grants a session nothing', () => {
    expect(google?.sendsOnly).toBe(true);
    expect(google?.tools).toEqual([]);
  });

  it('is nothing while off, and nothing while on but unconnected', () => {
    expect(callable({}, {})).not.toContain('mcp__calendar__calendar_events');
    expect(callable({ connections: { calendar: true } }, {})).not.toContain(
      'mcp__calendar__calendar_events',
    );
  });

  it('becomes callable once the Connect flow has run and the switch is on', () => {
    const env = {
      GOOGLE_OAUTH_CLIENT_ID: 'id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'token',
    };
    expect(callable({ connections: { calendar: true } }, env)).toContain(
      'mcp__calendar__calendar_events',
    );
  });
});

/**
 * The second reading sibling (D-158): the same three stored secrets, its own
 * switch and its own grant. Unlike the calendar, the stored consent does not
 * already carry this read — so the scope is pinned onto the walk itself: a
 * Connect that never asks for gmail.readonly can never grant this connection,
 * and dropping the scope from GOOGLE_SCOPES quietly unbuilds mail-read.
 */
describe('the mail connection reads only', () => {
  const mail = all.find((c) => c.name === 'mail');

  const callable = (settings: object, env: Record<string, string>): string[] => {
    const names = grantedTools(['mail'], all, settings, env);
    return mcpToolNames(resolveForJob(names, all, env).granted);
  };

  it('ships off and grants exactly the two reading tools', () => {
    expect(mail).toBeDefined();
    expect(mail?.defaultOn).not.toBe(true);
    expect(mail?.sendsOnly).not.toBe(true);
    expect(mail?.tools).toEqual(['mail_search', 'mail_read']);
  });

  it('declares the google secrets rather than minting its own', () => {
    expect(Object.keys(mail?.secrets ?? {}).sort()).toEqual([
      'GOOGLE_OAUTH_CLIENT_ID',
      'GOOGLE_OAUTH_CLIENT_SECRET',
      'GOOGLE_OAUTH_REFRESH_TOKEN',
    ]);
  });

  it('the consent walk asks for the scope this reader needs', () => {
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/gmail.readonly');
  });

  it('is nothing while off, and nothing while on but unconnected', () => {
    expect(callable({}, {})).not.toContain('mcp__mail__mail_search');
    expect(callable({ connections: { mail: true } }, {})).not.toContain('mcp__mail__mail_search');
  });

  it('becomes callable once the Connect flow has run and the switch is on', () => {
    const env = {
      GOOGLE_OAUTH_CLIENT_ID: 'id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'token',
    };
    const granted = callable({ connections: { mail: true } }, env);
    expect(granted).toContain('mcp__mail__mail_search');
    expect(granted).toContain('mcp__mail__mail_read');
  });
});

/**
 * Slack is the fourth sender (D-104) and holds telegram's whole shape: a
 * paste-a-token connection that grants a session nothing and sends only at
 * approval.
 */
describe('the slack connection sends only at approval', () => {
  const slack = all.find((c) => c.name === 'slack');

  it('is in the catalog and ships off, like everything credentialed', () => {
    expect(slack).toBeDefined();
    expect(slack?.defaultOn).not.toBe(true);
  });

  it('grants a session no tools at all', () => {
    expect(slack?.tools).toEqual([]);
    expect(slack?.sendsOnly).toBe(true);
  });

  it('declares the bot token it can never be live without', () => {
    expect(Object.keys(slack?.secrets ?? {})).toEqual(['SLACK_BOT_TOKEN']);
  });
});

/**
 * The second browser connection (D-255, #16): the twelve acting tools exist
 * here and nowhere else, beside the eight reads a job needs to act at all —
 * a job holding only `browser-act` still has to navigate and look. It ships
 * off, holds no secret (the profile is signed into by the person, never by
 * the app), and is `supervised`: the one flag every refusal reads — a rule
 * cannot hold it, a legacy firing is not granted it, the chips do not offer
 * it, and the run launches a window a person can close.
 */
describe('the browser-act connection carries the acting tools, under supervision', () => {
  const act = all.find((c) => c.name === 'browser-act');
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

  it('is in the catalog, ships off, and is marked supervised', () => {
    expect(act).toBeDefined();
    expect(act?.defaultOn).not.toBe(true);
    expect(act?.supervised).toBe(true);
    expect(act?.transport).toBe('stdio');
  });

  it('holds all twelve acting tools, and they exist on no other connection', () => {
    for (const name of ACTS) expect(act?.tools).toContain(name);
    for (const other of all.filter((c) => c.name !== 'browser-act')) {
      for (const name of ACTS) expect(other.tools ?? []).not.toContain(name);
    }
  });

  it('holds the eight reads too, so a job with only this door can navigate and look', () => {
    for (const name of browser?.tools ?? []) expect(act?.tools).toContain(name);
  });

  it('never closes the window itself — that gesture is the person watching', () => {
    expect(act?.tools).not.toContain('browser_close');
  });

  it('needs no secret and carries no per-machine argument — the run adds the endpoint and the allowlist', () => {
    expect(act?.secrets).toBeUndefined();
    expect((act?.args ?? []).join(' ')).not.toMatch(/cdp-endpoint|allowed-origins|user-data-dir|headless/);
  });

  it('is granted to a hand-queued job that names it, only when switched on — never to one that names nothing', () => {
    expect(grantedTools(['browser-act'], all, { connections: { 'browser-act': true } }, {})).toEqual(['browser-act']);
    expect(grantedTools(['browser-act'], all, {}, {})).toEqual([]);
    expect(grantedTools(undefined, all, { connections: { 'browser-act': true } }, {})).not.toContain('browser-act');
    const tools = mcpToolNames(resolveForJob(['browser-act'], all, {}).granted);
    expect(tools).toContain('mcp__browser-act__browser_click');
    expect(tools).toContain('mcp__browser-act__browser_navigate');
  });
});
