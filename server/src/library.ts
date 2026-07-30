import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CatalogEntry, LibraryStatus, SourceStatus } from '@agentlings/shared';
import { parseFrontmatter } from './roles';

/**
 * The library: roles and abilities published on GitHub, indexed locally so
 * they can be searched in plain language and installed on purpose.
 *
 * Two rules shape everything here. An installed role or skill is executable
 * instruction handed to an agent, so nothing installs without the user seeing
 * it first; and every entry is pinned to the exact commit it was read at — a
 * re-sync can report that an update exists, never apply one.
 */

export interface Source {
  name: string;
  label: string;
  repo: string;
  ref: string;
  kind: 'role' | 'skill';
  include: string[];
  trust: string;
  /** The source repo's licence, shown before anything is copied in. */
  license?: string;
}

export interface LibraryIndex {
  fetchedAt: number;
  sources: SourceStatus[];
  entries: CatalogEntry[];
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}
export type Http = (url: string, headers: Record<string, string>) => Promise<HttpResponse>;

/**
 * Per source, so one enormous repo can't stall a sync. Overflow is reported,
 * never dropped quietly. Raw file reads don't count against the API rate
 * limit, so the cap is about sync time rather than quota.
 */
const MAX_PER_SOURCE = 250;
const BATCH = 12;
const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
/** A week: templates change slowly and every request is someone's rate limit. */
export const STALE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Path globs, only as much as the source list needs: `*` stays inside one
 * segment, `**` followed by a slash spans directories, bare `**` spans
 * anything.
 */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if ('.+^${}()|[]\\/'.includes(char)) {
      out += `\\${char}`;
    } else {
      out += char;
    }
  }
  return new RegExp(`^${out}$`);
}

export function readSources(file: string): Source[] {
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { sources?: Source[] };
  return (parsed.sources ?? []).filter((s) => s.repo && s.name);
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

function ghError(status: number): string {
  if (status === 403 || status === 429) {
    return 'GitHub rate limit reached — set GITHUB_TOKEN in .env to raise it';
  }
  if (status === 404) return 'repository or branch not found';
  return `GitHub returned ${status}`;
}

interface TreeEntry {
  path: string;
  type: string;
}

/** Reads one source's tree at its head commit and indexes what parses. */
async function syncSource(
  source: Source,
  http: Http,
  token?: string,
): Promise<{ status: SourceStatus; entries: CatalogEntry[] }> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'agentlings',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const base: SourceStatus = {
    name: source.name,
    label: source.label,
    repo: source.repo,
    kind: source.kind,
    trust: source.trust,
    ...(source.license ? { license: source.license } : {}),
    count: 0,
    ok: false,
  };

  try {
    const commit = await http(`${API}/repos/${source.repo}/commits/${source.ref}`, headers);
    if (!commit.ok) return { status: { ...base, error: ghError(commit.status) }, entries: [] };
    const sha = (JSON.parse(await commit.text()) as { sha: string }).sha;

    const tree = await http(`${API}/repos/${source.repo}/git/trees/${sha}?recursive=1`, headers);
    if (!tree.ok) return { status: { ...base, error: ghError(tree.status) }, entries: [] };
    const listed = (JSON.parse(await tree.text()) as { tree?: TreeEntry[] }).tree ?? [];

    const patterns = source.include.map(globToRegExp);
    const matched = listed
      .filter((t) => t.type === 'blob' && patterns.some((rx) => rx.test(t.path)))
      .map((t) => t.path);
    // Never truncate silently: the overflow count is shown to the user.
    const truncated = Math.max(0, matched.length - MAX_PER_SOURCE);
    const paths = matched.slice(0, MAX_PER_SOURCE);

    const entries = (
      await inBatches(paths, BATCH, async (file) => {
        const raw = await http(`${RAW}/${source.repo}/${sha}/${file}`, {
          'user-agent': 'agentlings',
        });
        if (!raw.ok) return null;
        const parsed = parseFrontmatter(await raw.text());
        const name = String(parsed?.meta.name ?? '').trim();
        const description = String(parsed?.meta.description ?? '').trim();
        if (!name || !description) return null;
        return {
          id: `${source.repo}:${file}`,
          kind: source.kind,
          name,
          description,
          repo: source.repo,
          path: file,
          sha,
          source: source.name,
          trust: source.trust,
          ...(source.license ? { license: source.license } : {}),
        } satisfies CatalogEntry;
      })
    ).filter((entry): entry is CatalogEntry => entry !== null);

    return {
      status: { ...base, sha, count: entries.length, ok: true, truncated: truncated || undefined },
      entries,
    };
  } catch (err) {
    return {
      status: { ...base, error: err instanceof Error ? err.message : String(err) },
      entries: [],
    };
  }
}

/** Same name from two sources: the first source listed wins. */
export function dedupe(entries: CatalogEntry[]): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.name}`;
    if (!seen.has(key)) seen.set(key, entry);
  }
  return [...seen.values()];
}

export async function syncSources(
  sources: Source[],
  http: Http,
  now: number,
  token?: string,
): Promise<LibraryIndex> {
  const results = await inBatches(sources, 3, (source) => syncSource(source, http, token));
  return {
    fetchedAt: now,
    sources: results.map((r) => r.status),
    entries: dedupe(results.flatMap((r) => r.entries)),
  };
}

export function indexFile(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'catalog', 'index.json');
}

export function manifestFile(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'catalog', 'installed.json');
}

function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2));
}

export function loadIndex(sandboxRoot: string): LibraryIndex | null {
  return readJson<LibraryIndex | null>(indexFile(sandboxRoot), null);
}

export function saveIndex(sandboxRoot: string, index: LibraryIndex): void {
  writeJson(indexFile(sandboxRoot), index);
}

/** What was installed from where, so updates can be spotted but never forced. */
export interface InstalledRecord {
  repo: string;
  path: string;
  sha: string;
  source: string;
  installedAt: number;
}

export type Manifest = Record<string, InstalledRecord>;

export function loadManifest(sandboxRoot: string): Manifest {
  return readJson<Manifest>(manifestFile(sandboxRoot), {});
}

export function recordInstall(
  sandboxRoot: string,
  kind: 'role' | 'skill',
  name: string,
  record: InstalledRecord,
): void {
  const manifest = loadManifest(sandboxRoot);
  manifest[`${kind}:${name}`] = record;
  writeJson(manifestFile(sandboxRoot), manifest);
}

/**
 * Installed already? From an older commit? The UI says which, and offers
 * neither silently.
 */
export function installState(
  manifest: Manifest,
  installed: { roles: string[]; skills: string[] },
  entry: CatalogEntry,
): 'new' | 'installed' | 'outdated' {
  const present = entry.kind === 'role' ? installed.roles : installed.skills;
  if (!present.includes(entry.name)) return 'new';
  const record = manifest[`${entry.kind}:${entry.name}`];
  return record && record.sha !== entry.sha ? 'outdated' : 'installed';
}

/** Tools that let a template act on the machine rather than just read. */
const BROAD_TOOLS = ['bash', 'write', 'edit', 'web_fetch', 'websearch'];

/**
 * What to tell a non-expert before they install. Not a security boundary —
 * the point is that nothing arrives unread.
 */
export function reviewWarnings(text: string): string[] {
  const warnings: string[] = [];
  const parsed = parseFrontmatter(text);
  const tools = parsed?.meta.tools;
  const list = (Array.isArray(tools) ? tools : String(tools ?? '').split(','))
    .map((tool) => tool.trim().toLowerCase())
    .filter(Boolean);
  const broad = list.filter((tool) => BROAD_TOOLS.includes(tool));
  if (broad.length > 0) {
    warnings.push(`asks to use ${broad.join(', ')} — it can change files or reach the network`);
  }
  // Installing copies the file into the user's own repository, so its terms
  // are their problem the moment they click Add.
  const license = String(parsed?.meta.license ?? '').trim();
  if (license) warnings.push(`licensed: ${license} — installing copies it into your project`);
  if (/\bhttps?:\/\//i.test(parsed?.body ?? '')) {
    warnings.push('contains links — see where they point before installing');
  }
  return warnings;
}

/** Fetches one template at the exact commit the index recorded. */
export async function fetchTemplate(
  http: Http,
  repo: string,
  sha: string,
  file: string,
): Promise<string> {
  const res = await http(`${RAW}/${repo}/${sha}/${file}`, { 'user-agent': 'agentlings' });
  if (!res.ok) throw new Error(`could not read ${file} (${res.status})`);
  return res.text();
}

export function libraryStatus(index: LibraryIndex | null, now: number): LibraryStatus {
  return {
    fetchedAt: index?.fetchedAt ?? 0,
    stale: !index || now - index.fetchedAt > STALE_MS,
    sources: index?.sources ?? [],
    total: index?.entries.length ?? 0,
  };
}
