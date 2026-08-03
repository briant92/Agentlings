import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@agentlings/shared';
import {
  companionPaths,
  dedupe,
  globToRegExp,
  installState,
  isSafeRelative,
  libraryStatus,
  loadManifest,
  recordInstall,
  skillFolder,
  reviewWarnings,
  STALE_MS,
  syncSources,
  type Http,
  type Source,
} from './library';
import { searchEntries } from './match';

const SOURCE: Source = {
  name: 'anthropic-skills',
  label: 'Anthropic skills',
  repo: 'anthropics/skills',
  ref: 'main',
  kind: 'skill',
  include: ['**/SKILL.md'],
  trust: 'official',
};

const HEAD = 'abc123';

function skill(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

/** A fake GitHub: a tree plus file bodies, and a log of what was asked for. */
function fakeHttp(files: Record<string, string>, overrides: Record<string, number> = {}) {
  const calls: string[] = [];
  const http: Http = async (url) => {
    calls.push(url);
    const status = overrides[url];
    if (status) return { ok: false, status, text: async () => '' };
    if (url.includes('/commits/')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ sha: HEAD }) };
    }
    if (url.includes('/git/trees/')) {
      const tree = Object.keys(files).map((p) => ({ path: p, type: 'blob' }));
      tree.push({ path: 'docs', type: 'tree' });
      return { ok: true, status: 200, text: async () => JSON.stringify({ tree }) };
    }
    const file = Object.keys(files).find((p) => url.endsWith(`/${HEAD}/${p}`));
    if (file) return { ok: true, status: 200, text: async () => files[file] };
    return { ok: false, status: 404, text: async () => '' };
  };
  return { http, calls };
}

/** The same fake, with a separate tree per repository. */
function multiRepoHttp(repos: Record<string, Record<string, string>>): Http {
  return async (url) => {
    const repo = Object.keys(repos).find((r) => url.includes(`/${r}/`));
    if (!repo) return { ok: false, status: 404, text: async () => '' };
    const files = repos[repo];
    if (url.includes('/commits/')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ sha: HEAD }) };
    }
    if (url.includes('/git/trees/')) {
      const tree = Object.keys(files).map((p) => ({ path: p, type: 'blob' }));
      return { ok: true, status: 200, text: async () => JSON.stringify({ tree }) };
    }
    const file = Object.keys(files).find((p) => url.endsWith(`/${HEAD}/${p}`));
    if (file) return { ok: true, status: 200, text: async () => files[file] };
    return { ok: false, status: 404, text: async () => '' };
  };
}

describe('globToRegExp', () => {
  it('matches a file at any depth', () => {
    const rx = globToRegExp('**/SKILL.md');
    expect(rx.test('SKILL.md')).toBe(true);
    expect(rx.test('pdf/SKILL.md')).toBe(true);
    expect(rx.test('a/b/c/SKILL.md')).toBe(true);
    expect(rx.test('SKILL.md.bak')).toBe(false);
    expect(rx.test('notes/README.md')).toBe(false);
  });

  it('keeps a single star inside one segment', () => {
    const rx = globToRegExp('agents/*.md');
    expect(rx.test('agents/reviewer.md')).toBe(true);
    expect(rx.test('agents/nested/reviewer.md')).toBe(false);
  });

  it('does not let dots match anything', () => {
    expect(globToRegExp('a.md').test('axmd')).toBe(false);
  });
});

describe('syncSources', () => {
  it('indexes what parses and pins it to the head commit', async () => {
    const { http } = fakeHttp({
      'pdf/SKILL.md': skill('pdf', 'Reads PDFs and extracts text and tables'),
      'xlsx/SKILL.md': skill('xlsx', 'Creates and edits spreadsheets'),
      'README.md': '# not a skill',
    });
    const index = await syncSources([SOURCE], http, 1000);

    expect(index.entries.map((e) => e.name).sort()).toEqual(['pdf', 'xlsx']);
    expect(index.entries.every((e) => e.sha === HEAD)).toBe(true);
    expect(index.entries[0].repo).toBe('anthropics/skills');
    expect(index.sources[0]).toMatchObject({ ok: true, count: 2, sha: HEAD });
    expect(index.fetchedAt).toBe(1000);
  });

  it('skips files without usable frontmatter', async () => {
    const { http } = fakeHttp({
      'good/SKILL.md': skill('good', 'Has both fields'),
      'nameless/SKILL.md': '---\ndescription: no name\n---\n',
      'plain/SKILL.md': 'no frontmatter at all',
    });
    const index = await syncSources([SOURCE], http, 1);
    expect(index.entries.map((e) => e.name)).toEqual(['good']);
  });

  it('reports a rate limit instead of failing silently', async () => {
    const { http } = fakeHttp(
      {},
      { 'https://api.github.com/repos/anthropics/skills/commits/main': 403 },
    );
    const index = await syncSources([SOURCE], http, 1);
    expect(index.sources[0].ok).toBe(false);
    expect(index.sources[0].error).toMatch(/rate limit/);
    expect(index.entries).toEqual([]);
  });

  it('reports a missing repository', async () => {
    const { http } = fakeHttp(
      {},
      { 'https://api.github.com/repos/anthropics/skills/commits/main': 404 },
    );
    expect((await syncSources([SOURCE], http, 1)).sources[0].error).toMatch(/not found/);
  });

  /**
   * A count taken before dedupe describes what the sync read, not what the
   * catalogue holds: measured on the real index, `wshobson-agents` reported 204
   * while 180 of its entries reached `entries`, and the four sources summed to
   * 556 against 532. `truncated` never covered it — that is the per-source cap.
   */
  it('counts what a source contributed, not what it read', async () => {
    const http = multiRepoHttp({
      'first/repo': {
        'pdf/SKILL.md': skill('pdf', 'Reads PDFs and extracts text'),
        'xlsx/SKILL.md': skill('xlsx', 'Creates and edits spreadsheets'),
      },
      'second/repo': {
        // The same `kind:name` as the source listed before it: dropped.
        'pdf/SKILL.md': skill('pdf', 'Also reads PDFs'),
        'docx/SKILL.md': skill('docx', 'Writes documents'),
      },
    });
    const first: Source = { ...SOURCE, name: 'first', repo: 'first/repo' };
    const second: Source = { ...SOURCE, name: 'second', repo: 'second/repo' };
    const index = await syncSources([first, second], http, 1);

    const survived = (name: string) => index.entries.filter((e) => e.source === name).length;
    expect(survived('second')).toBe(1);
    expect(index.sources[1].count).toBe(survived('second'));
    expect(index.sources[0].count).toBe(survived('first'));
    // The property that was false: source counts sum to the catalogue.
    expect(index.sources.reduce((n, s) => n + s.count, 0)).toBe(index.entries.length);
  });

  it('sends the token only to the API, never to raw file hosts', async () => {
    const seen: Record<string, string | undefined> = {};
    const files = { 'pdf/SKILL.md': skill('pdf', 'Reads PDFs') };
    const inner = fakeHttp(files).http;
    const http: Http = (url, headers) => {
      seen[new URL(url).host] = headers.authorization;
      return inner(url, headers);
    };
    await syncSources([SOURCE], http, 1, 'secret-token');
    expect(seen['api.github.com']).toBe('Bearer secret-token');
    expect(seen['raw.githubusercontent.com']).toBeUndefined();
  });
});

describe('dedupe', () => {
  const entry = (name: string, source: string): CatalogEntry => ({
    id: `${source}:${name}`,
    kind: 'skill',
    name,
    description: 'x',
    repo: source,
    path: `${name}/SKILL.md`,
    sha: HEAD,
    source,
    trust: 'official',
  });

  it('keeps the first source that offered a name', () => {
    const kept = dedupe([entry('pdf', 'official/repo'), entry('pdf', 'other/repo')]);
    expect(kept).toHaveLength(1);
    expect(kept[0].repo).toBe('official/repo');
  });
});

describe('searchEntries', () => {
  const entries: CatalogEntry[] = [
    {
      id: '1',
      kind: 'skill',
      name: 'pdf',
      description: 'Reads PDFs, extracts text and tables, fills forms',
      repo: 'a/b',
      path: 'pdf/SKILL.md',
      sha: HEAD,
      source: 's',
      trust: 'official',
    },
    {
      id: '2',
      kind: 'skill',
      name: 'xlsx',
      description: 'Creates and edits spreadsheets from tabular data',
      repo: 'a/b',
      path: 'xlsx/SKILL.md',
      sha: HEAD,
      source: 's',
      trust: 'official',
    },
  ];

  it('finds an ability from a plain-language description', () => {
    expect(searchEntries(entries, 'read my PDFs').hits[0].name).toBe('pdf');
    expect(searchEntries(entries, 'put numbers in a spreadsheet').hits[0].name).toBe('xlsx');
  });

  it('returns nothing rather than a bad guess', () => {
    expect(searchEntries(entries, 'book me a flight to Lisbon').hits).toEqual([]);
  });
});

describe('reviewWarnings', () => {
  it('flags a template that can change files or reach the network', () => {
    const warnings = reviewWarnings('---\nname: x\ndescription: y\ntools: [read, bash]\n---\nbody');
    expect(warnings.join(' ')).toMatch(/bash/);
  });

  it('says nothing alarming about a read-only template', () => {
    expect(reviewWarnings('---\nname: x\ndescription: y\ntools: [read]\n---\nbody')).toEqual([]);
  });

  it('surfaces a declared license, because installing copies the file in', () => {
    const warnings = reviewWarnings(
      '---\nname: x\ndescription: y\nlicense: Proprietary. LICENSE.txt has complete terms\n---\nbody',
    );
    expect(warnings.join(' ')).toMatch(/Proprietary/);
  });

  it('flags links in the body', () => {
    const warnings = reviewWarnings('---\nname: x\ndescription: y\n---\nsee https://example.com');
    expect(warnings.join(' ')).toMatch(/links/);
  });
});

describe('install manifest', () => {
  let root: string;
  const entry: CatalogEntry = {
    id: '1',
    kind: 'skill',
    name: 'pdf',
    description: 'Reads PDFs',
    repo: 'a/b',
    path: 'pdf/SKILL.md',
    sha: HEAD,
    source: 's',
    trust: 'official',
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-lib-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is new before install and installed after', () => {
    const names = { roles: [], skills: [] as string[] };
    expect(installState(loadManifest(root), names, entry)).toBe('new');

    recordInstall(root, 'skill', 'pdf', {
      repo: entry.repo,
      path: entry.path,
      sha: HEAD,
      source: 's',
      installedAt: 1,
    });
    names.skills.push('pdf');
    expect(installState(loadManifest(root), names, entry)).toBe('installed');
  });

  it('reports an update when the source moved on, without applying it', () => {
    recordInstall(root, 'skill', 'pdf', {
      repo: entry.repo,
      path: entry.path,
      sha: 'older',
      source: 's',
      installedAt: 1,
    });
    const state = installState(loadManifest(root), { roles: [], skills: ['pdf'] }, entry);
    expect(state).toBe('outdated');
  });
});

describe('libraryStatus', () => {
  it('is stale with no index at all', () => {
    expect(libraryStatus(null, 1000).stale).toBe(true);
  });

  it('goes stale after a week', () => {
    const index = { fetchedAt: 1000, sources: [], entries: [] };
    expect(libraryStatus(index, 1000 + STALE_MS - 1).stale).toBe(false);
    expect(libraryStatus(index, 1000 + STALE_MS + 1).stale).toBe(true);
  });
});

// A skill is a folder. Fetching only its SKILL.md installs something that
// reads correctly and cannot work, because the scripts it names are missing.
describe('isSafeRelative', () => {
  it('accepts the ordinary shapes a skill uses', () => {
    expect(isSafeRelative('run.py')).toBe(true);
    expect(isSafeRelative('scripts/run.py')).toBe(true);
    expect(isSafeRelative('references/a/b.json')).toBe(true);
  });

  // These come from a remote repository and are about to become filenames.
  it('refuses anything that could climb out of the folder', () => {
    expect(isSafeRelative('../escape.md')).toBe(false);
    expect(isSafeRelative('scripts/../../escape.md')).toBe(false);
    expect(isSafeRelative('./run.py')).toBe(false);
    expect(isSafeRelative('a//b.py')).toBe(false);
  });

  it('refuses absolute and drive-qualified paths', () => {
    expect(isSafeRelative('/etc/passwd')).toBe(false);
    expect(isSafeRelative('C:/Windows/system32')).toBe(false);
    expect(isSafeRelative('\\\\server\\share')).toBe(false);
  });

  it('refuses backslashes, which separate directories on Windows', () => {
    expect(isSafeRelative('scripts\\run.py')).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(isSafeRelative('')).toBe(false);
  });
});

describe('companionPaths', () => {
  const tree = [
    'skills/pdf/SKILL.md',
    'skills/pdf/scripts/fill.py',
    'skills/pdf/references/forms.md',
    'skills/other/SKILL.md',
    'README.md',
  ];

  it('takes the whole folder beside the SKILL.md', () => {
    expect(companionPaths(tree, 'skills/pdf/SKILL.md')).toEqual([
      'skills/pdf/scripts/fill.py',
      'skills/pdf/references/forms.md',
    ]);
  });

  it('leaves other skills and the rest of the repo alone', () => {
    const taken = companionPaths(tree, 'skills/pdf/SKILL.md');
    expect(taken).not.toContain('skills/other/SKILL.md');
    expect(taken).not.toContain('README.md');
  });

  // Otherwise a template published at the repo root claims the repository.
  it('takes nothing when the SKILL.md sits at the root', () => {
    expect(companionPaths(tree, 'SKILL.md')).toEqual([]);
  });

  it('reports the folder a skill lives in', () => {
    expect(skillFolder('skills/pdf/SKILL.md')).toBe('skills/pdf/');
    expect(skillFolder('SKILL.md')).toBe('');
  });
});
