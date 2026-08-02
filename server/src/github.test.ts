import { describe, expect, it } from 'vitest';
import { GITHUB_TOOLS, GITHUB_TOOL_NAMES, callGithub, isRepo } from './github';
import type { Http } from './library';

/** A fake GitHub: no network, and it records what was asked for. */
function fake(replies: Record<string, unknown>, status = 200): { http: Http; urls: string[] } {
  const urls: string[] = [];
  const http: Http = async (url) => {
    urls.push(url);
    const key = Object.keys(replies).find((k) => url.includes(k));
    return {
      ok: status === 200 && key !== undefined,
      status: key === undefined ? 404 : status,
      text: async () => JSON.stringify(key ? replies[key] : {}),
    };
  };
  return { http, urls };
}

describe('isRepo', () => {
  it('takes owner/name and nothing else', () => {
    expect(isRepo('briant92/Agentlings')).toBe(true);
    expect(isRepo('with.dots/and-dashes')).toBe(true);
  });

  // Untrusted input becoming a URL path is the same class of problem the
  // library install refuses rather than sanitises.
  it('refuses anything that could climb out of the path', () => {
    for (const bad of ['../etc', 'owner', 'owner/name/extra', 'owner/name?x=1', '/absolute', '']) {
      expect(isRepo(bad)).toBe(false);
    }
  });
});

describe('callGithub', () => {
  it('refuses a tool it does not have', async () => {
    const { http } = fake({});
    const r = await callGithub('merge_pull_request', { repo: 'a/b' }, { http });
    expect(r.error).toMatch(/no such tool/);
  });

  it('refuses a malformed repo before making any request', async () => {
    const { http, urls } = fake({});
    const r = await callGithub('list_issues', { repo: '../secrets' }, { http });
    expect(r.error).toMatch(/owner\/name/);
    expect(urls).toHaveLength(0);
  });

  it('requires the parameters its spec marks required', async () => {
    const { http } = fake({});
    const r = await callGithub('get_issue', { repo: 'a/b' }, { http });
    expect(r.error).toBe('number is required');
  });

  it('sends the token to the API as a bearer, and only then', async () => {
    let seen: Record<string, string> = {};
    const http: Http = async (_url, headers) => {
      seen = headers;
      return { ok: true, status: 200, text: async () => '[]' };
    };
    await callGithub('list_issues', { repo: 'a/b' }, { http, token: 'secret' });
    expect(seen.authorization).toBe('Bearer secret');
  });

  // GitHub answers /issues with pull requests mixed in. Counting them would
  // double every PR against a tool whose whole job is to say what the issues
  // are.
  it('drops pull requests from the issue list', async () => {
    const { http } = fake({
      '/issues': [
        { number: 1, title: 'a real issue', user: { login: 'x' }, comments: 2 },
        { number: 2, title: 'actually a PR', user: { login: 'y' }, pull_request: { url: '…' } },
      ],
    });
    const r = await callGithub('list_issues', { repo: 'a/b' }, { http });
    expect(r.text).toContain('#1 a real issue');
    expect(r.text).not.toContain('#2');
    expect(r.text).toContain('1 open issue');
  });

  // The whole argument for this being builtin rather than an MCP server: a
  // diff is unbounded, and every token a tool returns is one the model pays to
  // read. The API offers `patch` on every entry and we never pass it on.
  it('never returns a diff, only the files and their counts', async () => {
    const { http } = fake({
      '/files': [
        { filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1, patch: '@@ SECRET DIFF @@' },
      ],
    });
    const r = await callGithub('get_pull_request_files', { repo: 'a/b', number: 7 }, { http });
    expect(r.text).toContain('src/a.ts (modified, +3 −1)');
    expect(r.text).not.toContain('SECRET DIFF');
  });

  it('truncates a long issue body rather than pasting a thread in', async () => {
    const { http } = fake({
      '/issues/3': { number: 3, title: 't', state: 'open', user: { login: 'x' }, body: 'x'.repeat(5000), labels: [] },
    });
    const r = await callGithub('get_issue', { repo: 'a/b', number: 3 }, { http });
    expect(r.text).toContain('…truncated');
    expect(r.text!.length).toBeLessThan(1200);
  });

  it('says what a failure means in plain language', async () => {
    const unauthorised: Http = async () => ({ ok: false, status: 401, text: async () => '' });
    const r = await callGithub('list_issues', { repo: 'a/b' }, { http: unauthorised });
    expect(r.error).toMatch(/GITHUB_TOKEN/);

    const missing: Http = async () => ({ ok: false, status: 404, text: async () => '' });
    const r2 = await callGithub('list_issues', { repo: 'a/b' }, { http: missing });
    expect(r2.error).toContain('a/b');
  });

  it('reads a file and reports its size', async () => {
    const { http } = fake({
      '/contents/': { encoding: 'base64', content: Buffer.from('hello').toString('base64'), size: 5 },
    });
    const r = await callGithub('get_file_contents', { repo: 'a/b', path: 'x/y.md' }, { http });
    expect(r.text).toContain('hello');
    expect(r.text).toContain('5 bytes');
  });

  it('counts the checks that are not passing', async () => {
    const { http } = fake({
      '/check-runs': {
        check_runs: [
          { name: 'build', conclusion: 'success' },
          { name: 'test', conclusion: 'failure' },
        ],
      },
    });
    const r = await callGithub('get_checks', { repo: 'a/b', ref: 'main' }, { http });
    expect(r.text).toContain('1 not passing');
    expect(r.text).toContain('failure — test');
  });
});

describe('the granted surface', () => {
  it('declares every tool with a description and a repo parameter', () => {
    for (const spec of GITHUB_TOOLS) {
      expect(spec.description.length).toBeGreaterThan(10);
      expect(spec.params.some((p) => p.name === 'repo' && p.required)).toBe(true);
    }
  });

  /**
   * The boundary is a test rather than a description of one (D-034). These are
   * the twelve acting tools the reference MCP server exposes, enumerated by
   * speaking JSON-RPC to it. None is implemented, and adding one is a decision
   * about the safety model rather than a line in a list.
   */
  it('implements none of the acting tools', () => {
    const acting = [
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
    for (const name of acting) expect(GITHUB_TOOL_NAMES).not.toContain(name);
  });
});
