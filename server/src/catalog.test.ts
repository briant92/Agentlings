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
