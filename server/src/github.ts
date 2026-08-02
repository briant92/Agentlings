import type { Http } from './library';

/**
 * Reading a code host, as a builtin connection rather than an MCP server.
 *
 * The obvious route was `@modelcontextprotocol/server-github` over stdio, the
 * way the browser is wired. Two things ruled it out: npm reports the package
 * as no longer supported, and a credentialed connection resting on an
 * abandoned dependency is a poor trade. GitHub's supported replacement ships
 * as a Docker image or a remote HTTP endpoint, and this registry speaks
 * `builtin` and `stdio` only.
 *
 * Builtin turns out to be the better answer anyway, for the reason the catalog
 * already gives about stdio: "every token a tool returns is a token the model
 * pays to read, and for a stdio server that budget is the server's own flags,
 * not ours". A code host is exactly where that bites — one `list_issues` can
 * hand back a hundred issues of full JSON, and a diff is unbounded. Owning the
 * call means owning the size of the answer, so every tool here returns compact
 * lines, caps its lists, truncates bodies, and never returns a patch.
 *
 * It reads and cannot act. Of the 26 tools the reference server exposes,
 * enumerated by speaking JSON-RPC to it rather than trusting its README, 12
 * act — create, update, comment, merge, push, fork. None is implemented here,
 * and `catalog.test.ts` asserts their absence, so the boundary is a test
 * rather than a description of one (D-034, D-040).
 */

const API = 'https://api.github.com';

/** Lists are for orientation; a session that needs more can ask again, narrower. */
const MAX_ITEMS = 30;
/** Enough to know what an issue is about, far short of pasting a thread in. */
const MAX_BODY = 800;
/** The same budget the web connection uses, for the same reason. */
const MAX_FILE_CHARS = 12_000;

export interface ToolParam {
  name: string;
  type: 'string' | 'number';
  required?: boolean;
  describe: string;
}

/**
 * A tool the session may call. Declared as data rather than as eight zod
 * schemas in the runner, because the runner is plain JS that must not import
 * anything of ours — so the shapes travel to it as config and it builds the
 * schemas generically.
 */
export interface ToolSpec {
  name: string;
  description: string;
  params: ToolParam[];
}

const REPO: ToolParam = {
  name: 'repo',
  type: 'string',
  required: true,
  describe: 'owner/name, e.g. briant92/Agentlings',
};
const NUMBER: ToolParam = {
  name: 'number',
  type: 'number',
  required: true,
  describe: 'the issue or pull request number',
};
const STATE: ToolParam = {
  name: 'state',
  type: 'string',
  describe: 'open, closed or all — defaults to open',
};

export const GITHUB_TOOLS: ToolSpec[] = [
  {
    name: 'list_pull_requests',
    description: 'List pull requests on a repository, newest first. Titles and authors only.',
    params: [REPO, STATE],
  },
  {
    name: 'get_pull_request',
    description: 'Details of one pull request: state, branches, size, and its description.',
    params: [REPO, NUMBER],
  },
  {
    name: 'get_pull_request_files',
    description:
      'Which files a pull request touches, with line counts. Never returns the diff itself.',
    params: [REPO, NUMBER],
  },
  {
    name: 'list_issues',
    description: 'List issues on a repository. Pull requests are excluded.',
    params: [REPO, STATE],
  },
  {
    name: 'get_issue',
    description: 'Details of one issue: state, labels, and its description.',
    params: [REPO, NUMBER],
  },
  {
    name: 'list_commits',
    description: 'Recent commits on a branch — short sha, first line, author and date.',
    params: [REPO, { name: 'ref', type: 'string', describe: 'branch or sha; defaults to the default branch' }],
  },
  {
    name: 'get_checks',
    description: 'CI results for a commit or branch — which checks passed and which did not.',
    params: [REPO, { name: 'ref', type: 'string', required: true, describe: 'branch, tag or sha' }],
  },
  {
    name: 'get_file_contents',
    description: 'Read one file from a repository, trimmed to a budget.',
    params: [
      REPO,
      { name: 'path', type: 'string', required: true, describe: 'path within the repository' },
      { name: 'ref', type: 'string', describe: 'branch or sha; defaults to the default branch' },
    ],
  },
];

export const GITHUB_TOOL_NAMES = GITHUB_TOOLS.map((t) => t.name);

/**
 * A repository name that is safe to put in a URL.
 *
 * Untrusted input becoming a path is the same class of problem the library
 * install refuses rather than sanitises. `owner/name` and nothing else — no
 * traversal, no query, no second slash.
 */
export function isRepo(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split('/');
  if (parts.length !== 2) return false;
  // A segment of nothing but dots is `.` or `..`, which climbs. Caught by the
  // test rather than by review: `[\w.-]+` reads as "word characters, dots and
  // dashes" and quietly accepts `..` on its own, so `../secrets` was a
  // well-formed owner/name and reached the API as a path.
  return parts.every((part) => /^[\w.-]+$/.test(part) && !/^\.+$/.test(part));
}

function trim(text: string | null | undefined, max: number): string {
  const clean = (text ?? '').replace(/\r/g, '').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}\n…truncated` : clean;
}

function firstLine(text: string): string {
  return (text ?? '').split('\n')[0].trim();
}

function day(iso: string | undefined): string {
  return (iso ?? '').slice(0, 10);
}

/**
 * Plain language, and never the raw body — an API error is not a session's
 * problem to parse.
 *
 * `subject` is what was actually looked up, and it exists because this
 * collapsed two different 404s into one message: asking for pull request #1 in
 * a repository that has no pull requests answered "no such repository, or the
 * token cannot see it", which sends whoever reads it after a permissions fault
 * that is not there. Found on the first authenticated run against a real
 * private repo, not by any of the fourteen tests.
 */
function explain(status: number, repo: string, subject = `repository ${repo}`): string {
  if (status === 401) return 'GitHub rejected the token — check GITHUB_TOKEN in .env';
  if (status === 403) {
    return `GitHub refused: the token lacks the permission this needs, or the rate limit is spent (${subject})`;
  }
  if (status === 404) return `no such ${subject}, or the token cannot see it`;
  return `GitHub returned ${status}`;
}

export interface GithubResult {
  text?: string;
  error?: string;
}

/**
 * Runs one tool. `http` is injected so tests need no network, exactly as the
 * library sync does.
 */
export async function callGithub(
  tool: string,
  args: Record<string, unknown>,
  options: { http: Http; token?: string },
): Promise<GithubResult> {
  const spec = GITHUB_TOOLS.find((t) => t.name === tool);
  if (!spec) return { error: `no such tool: ${tool}` };

  const repo = args.repo;
  if (!isRepo(repo)) return { error: 'repo must look like owner/name' };
  for (const param of spec.params) {
    if (param.required && args[param.name] === undefined) {
      return { error: `${param.name} is required` };
    }
  }

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'agentlings',
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
  };

  const get = async (
    url: string,
    /** What was looked up, so a 404 can say which thing was missing. */
    subject?: string,
  ): Promise<{ data?: unknown; error?: string }> => {
    let res;
    try {
      res = await options.http(url, headers);
    } catch (err) {
      return { error: `could not reach GitHub: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!res.ok) return { error: explain(res.status, repo, subject) };
    try {
      return { data: JSON.parse(await res.text()) };
    } catch {
      return { error: 'GitHub returned something that was not JSON' };
    }
  };

  const state = typeof args.state === 'string' ? args.state : 'open';
  const ref = typeof args.ref === 'string' ? args.ref : undefined;
  const number = args.number;

  switch (tool) {
    case 'list_pull_requests': {
      const { data, error } = await get(
        `${API}/repos/${repo}/pulls?state=${encodeURIComponent(state)}&per_page=${MAX_ITEMS}`,
      );
      if (error) return { error };
      const list = (data as any[]) ?? [];
      if (!list.length) return { text: `No ${state} pull requests on ${repo}.` };
      return {
        text: [
          `${list.length} ${state} pull request${list.length === 1 ? '' : 's'} on ${repo}:`,
          ...list.map(
            (p) => `#${p.number} ${firstLine(p.title)} — ${p.user?.login ?? 'unknown'}, updated ${day(p.updated_at)}`,
          ),
        ].join('\n'),
      };
    }
    case 'get_pull_request': {
      const { data, error } = await get(`${API}/repos/${repo}/pulls/${Number(number)}`, `pull request #${Number(number)} in ${repo}`);
      if (error) return { error };
      const p = data as any;
      return {
        text: [
          `#${p.number} ${firstLine(p.title)}`,
          `${p.state}${p.merged ? ' (merged)' : ''} — ${p.user?.login ?? 'unknown'}, opened ${day(p.created_at)}`,
          `${p.head?.ref} → ${p.base?.ref}`,
          `${p.changed_files ?? 0} files, +${p.additions ?? 0} −${p.deletions ?? 0}`,
          '',
          trim(p.body, MAX_BODY) || '(no description)',
        ].join('\n'),
      };
    }
    case 'get_pull_request_files': {
      const { data, error } = await get(
        `${API}/repos/${repo}/pulls/${Number(number)}/files?per_page=${MAX_ITEMS}`,
        `pull request #${Number(number)} in ${repo}`,
      );
      if (error) return { error };
      const list = (data as any[]) ?? [];
      if (!list.length) return { text: `#${number} changes no files.` };
      return {
        // Deliberately no `patch`, though the API offers it on every entry: a
        // diff is unbounded and is what makes a turn expensive. Names and
        // counts are what a session needs to decide where to look.
        text: [
          `#${number} touches ${list.length} file${list.length === 1 ? '' : 's'}:`,
          ...list.map((f) => `${f.filename} (${f.status}, +${f.additions} −${f.deletions})`),
        ].join('\n'),
      };
    }
    case 'list_issues': {
      const { data, error } = await get(
        `${API}/repos/${repo}/issues?state=${encodeURIComponent(state)}&per_page=${MAX_ITEMS}`,
      );
      if (error) return { error };
      // GitHub returns pull requests from the issues endpoint. Anything with a
      // `pull_request` key is one, and listing them here would double-count
      // every PR against a tool whose whole job is to say what the issues are.
      const list = ((data as any[]) ?? []).filter((i) => !i.pull_request);
      if (!list.length) return { text: `No ${state} issues on ${repo}.` };
      return {
        text: [
          `${list.length} ${state} issue${list.length === 1 ? '' : 's'} on ${repo}:`,
          ...list.map(
            (i) => `#${i.number} ${firstLine(i.title)} — ${i.user?.login ?? 'unknown'}, ${i.comments ?? 0} comments`,
          ),
        ].join('\n'),
      };
    }
    case 'get_issue': {
      const { data, error } = await get(`${API}/repos/${repo}/issues/${Number(number)}`, `issue #${Number(number)} in ${repo}`);
      if (error) return { error };
      const i = data as any;
      const labels = ((i.labels as any[]) ?? []).map((l) => l.name ?? l).join(', ');
      return {
        text: [
          `#${i.number} ${firstLine(i.title)}`,
          `${i.state} — ${i.user?.login ?? 'unknown'}, opened ${day(i.created_at)}`,
          labels ? `labels: ${labels}` : '',
          '',
          trim(i.body, MAX_BODY) || '(no description)',
        ]
          .filter(Boolean)
          .join('\n'),
      };
    }
    case 'list_commits': {
      const query = ref ? `?sha=${encodeURIComponent(ref)}&per_page=${MAX_ITEMS}` : `?per_page=${MAX_ITEMS}`;
      const { data, error } = await get(`${API}/repos/${repo}/commits${query}`);
      if (error) return { error };
      const list = (data as any[]) ?? [];
      if (!list.length) return { text: `No commits found on ${repo}${ref ? ` at ${ref}` : ''}.` };
      return {
        text: [
          `${list.length} recent commit${list.length === 1 ? '' : 's'} on ${repo}${ref ? ` (${ref})` : ''}:`,
          ...list.map(
            (c) =>
              `${String(c.sha).slice(0, 7)} ${firstLine(c.commit?.message ?? '')} — ${c.commit?.author?.name ?? 'unknown'}, ${day(c.commit?.author?.date)}`,
          ),
        ].join('\n'),
      };
    }
    case 'get_checks': {
      const { data, error } = await get(
        `${API}/repos/${repo}/commits/${encodeURIComponent(String(ref))}/check-runs?per_page=${MAX_ITEMS}`,
        `CI checks for ${ref} in ${repo}`,
      );
      if (error) return { error };
      const list = ((data as any)?.check_runs as any[]) ?? [];
      if (!list.length) return { text: `No CI checks reported for ${repo} at ${ref}.` };
      const failed = list.filter((r) => r.conclusion && r.conclusion !== 'success' && r.conclusion !== 'neutral');
      return {
        text: [
          `${list.length} check${list.length === 1 ? '' : 's'} for ${repo} at ${ref} — ${failed.length} not passing:`,
          ...list.map((r) => `${r.conclusion ?? r.status} — ${r.name}`),
        ].join('\n'),
      };
    }
    case 'get_file_contents': {
      const path = String(args.path ?? '');
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const { data, error } = await get(
        `${API}/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}${query}`,
        `path ${path} in ${repo}`,
      );
      if (error) return { error };
      const f = data as any;
      if (Array.isArray(f)) {
        return {
          text: [`${path} is a directory:`, ...f.slice(0, MAX_ITEMS).map((e) => `${e.type} ${e.name}`)].join('\n'),
        };
      }
      if (f.encoding !== 'base64' || typeof f.content !== 'string') {
        return { error: `${path} is not a readable text file` };
      }
      const decoded = Buffer.from(f.content, 'base64').toString('utf8');
      return { text: `${path} (${f.size ?? decoded.length} bytes)\n\n${trim(decoded, MAX_FILE_CHARS)}` };
    }
    default:
      return { error: `no such tool: ${tool}` };
  }
}
