import { nameTaken } from './userconnections';

/**
 * The public MCP registry as a browse for the add-a-connection form (D-256).
 *
 * **What a fill is, and is not.** An entry here fills the form — transport,
 * command or address, the env-variable names its credential needs — and
 * **saves nothing**. It becomes a connection only when this machine's own
 * probe reaches the server and it answers (D-244). So nothing below vouches
 * for anything: the registry says what a server's authors published, this
 * turns that into the form's shape, and the tool-list read is still the
 * whole verification. D-245's rule survives the chips it was written for —
 * every fill names its source and the date it was read.
 *
 * **Why the registry and not a longer hand list.** D-245 measured what a
 * curated entry costs: one primary source, read and dated, per entry — four
 * in a day, honest *because* short. A catalog written for any business, not
 * for the operator at hand, cannot be curated at that price. The registry is
 * the population; the probe is what keeps it from becoming a claim.
 *
 * **What the form cannot carry is passed over by name**, never silently:
 * an SSE-only address (D-243 has no such transport), a key templated inside
 * the address (it would sit in the job's own folder — D-242, D-262), and
 * package kinds this machine has no runner for (docker images, NuGet,
 * `.mcpb` bundles). The browse says how many it passed over and why.
 */

export const REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0.1/servers';
/** The registry refuses more (422 at 101, measured 2026-08-25). */
const PAGE = 100;
const TIMEOUT_MS = 10_000;

// The registry's own shape (server.schema.json, 2025-12-11), the parts read.
export interface RegistryServer {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: { url?: string; source?: string };
  packages?: RegistryPackage[];
  remotes?: RegistryRemote[];
}
export interface RegistryPackage {
  registryType?: string;
  identifier?: string;
  version?: string;
  runtimeHint?: string;
  transport?: { type?: string };
  runtimeArguments?: RegistryArgument[];
  packageArguments?: RegistryArgument[];
  environmentVariables?: RegistryInput[];
}
export interface RegistryArgument {
  type?: 'positional' | 'named';
  name?: string;
  value?: string;
}
export interface RegistryInput {
  name?: string;
  description?: string;
  value?: string;
  isSecret?: boolean;
  isRequired?: boolean;
}
export interface RegistryRemote {
  type?: string;
  url?: string;
  headers?: RegistryInput[];
  variables?: Record<string, RegistryInput>;
}
interface RegistryPage {
  servers?: {
    server?: RegistryServer;
    _meta?: { 'io.modelcontextprotocol.registry/official'?: { status?: string; isLatest?: boolean } };
  }[];
  metadata?: { nextCursor?: string };
}

/** What the browse hands the form — the same shape a D-245 chip carried, never a connection. */
export interface RegistryFill {
  name: string;
  label: string;
  description?: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  secrets?: Record<string, string>;
  /** The authors' own page, so the user can check what we say against it. */
  docs?: string;
  /** Where this shape was read, and when. */
  source: string;
}
export interface RegistryHit {
  id: string;
  version: string;
  fill: RegistryFill;
}
export interface RegistryOmitted {
  id: string;
  why: string;
}
export type RegistrySearch =
  | {
      ok: true;
      query: string;
      hits: RegistryHit[];
      omitted: RegistryOmitted[];
      /** The registry had more than one page for these words — the list is cut, and the form says so. */
      truncated: boolean;
    }
  | { ok: false; error: string };

export interface FillOptions {
  /** The date the entry was read, for the source line — `YYYY-MM-DD`. */
  readOn: string;
  /** Names already in use, so a fill never offers a dead end. */
  taken: Set<string>;
}

const WHY_NEEDED = 'needed by this server';

/**
 * One entry to one fill, or the reason it cannot be one.
 *
 * Shapes are tried in the order a person would: a package `npx` can run,
 * then a remote address, then a Python package. The first that the form
 * can carry wins; the reasons the others could not are what a passed-over
 * entry reports.
 */
export function fillFromEntry(server: RegistryServer, opts: FillOptions): { fill: RegistryFill } | { why: string } {
  const reasons: string[] = [];
  const shape = shapeOf(server, reasons);
  if (!shape) return { why: reasons.length ? [...new Set(reasons)].join('; ') : 'no address or package to reach it by' };

  const fill: RegistryFill = {
    name: shortName(server.name, opts.taken),
    label: server.title?.trim() || readable(server.name),
    ...(server.description?.trim() ? { description: server.description.trim() } : {}),
    ...shape,
    ...(server.websiteUrl || server.repository?.url ? { docs: server.websiteUrl || server.repository?.url } : {}),
    source: `the MCP registry (registry.modelcontextprotocol.io), entry ${server.name} v${server.version ?? '?'}, read ${opts.readOn}`,
  };
  return { fill };
}

type Shape = Pick<RegistryFill, 'transport' | 'command' | 'args' | 'url' | 'headers' | 'secrets'>;

function shapeOf(server: RegistryServer, reasons: string[]): Shape | null {
  const packages = server.packages ?? [];
  const remotes = server.remotes ?? [];

  const npm = packages.find((p) => p.registryType === 'npm' && stdio(p) && p.identifier);
  if (npm) return command('npx', versioned(npm), npm);

  for (const remote of remotes) {
    if (remote.type !== 'streamable-http') {
      if (remote.type) reasons.push(`only an ${remote.type.toUpperCase()} address, which the form has no transport for`);
      continue;
    }
    if (!remote.url) continue;
    if (templated(remote.url)) {
      reasons.push('a key inside its address, which would sit in the job’s own folder');
      continue;
    }
    return remoteShape(server.name, remote);
  }

  const pypi = packages.find((p) => p.registryType === 'pypi' && stdio(p) && p.identifier);
  if (pypi) return command('uvx', versioned(pypi), pypi);

  for (const p of packages) {
    if (p.registryType && p.registryType !== 'npm' && p.registryType !== 'pypi') {
      reasons.push(`only a ${p.registryType} package, which this machine has no runner for`);
    } else if (!stdio(p)) {
      reasons.push(`a package speaking ${p.transport?.type ?? 'nothing'}, not stdio`);
    }
  }
  return null;
}

const stdio = (p: RegistryPackage) => (p.transport?.type ?? 'stdio') === 'stdio';
const versioned = (p: RegistryPackage) => (p.version ? `${p.identifier}@${p.version}` : p.identifier!);
/** `{token}` — a value the registry leaves to the user, which is nobody's to guess. */
const templated = (s: string) => /\{[^}]+\}/.test(s);

function command(cmd: string, pkg: string, p: RegistryPackage): Shape {
  // Runtime arguments precede the package for the runtime's own sake; `npx`
  // gets `-y` from us, so one the entry declares is not repeated.
  const runtime = (p.runtimeArguments ?? []).flatMap(literal).filter((a) => !(cmd === 'npx' && a === '-y'));
  const args = [...(cmd === 'npx' ? ['-y'] : []), ...runtime, pkg, ...(p.packageArguments ?? []).flatMap(literal)];
  const secrets: Record<string, string> = {};
  for (const v of p.environmentVariables ?? []) {
    if (v.name && isEnvName(v.name)) secrets[v.name] = v.description?.trim() || WHY_NEEDED;
  }
  return { transport: 'stdio', command: cmd, args, ...(Object.keys(secrets).length ? { secrets } : {}) };
}

/** An argument with a value the registry spelled out; a templated one is skipped. */
function literal(a: RegistryArgument): string[] {
  const value = a.value && !templated(a.value) ? a.value : undefined;
  if (a.type === 'named' && a.name) return value === undefined ? [] : [a.name, value];
  return value === undefined ? [] : [value];
}

function remoteShape(id: string, remote: RegistryRemote): Shape {
  const headers: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const h of remote.headers ?? []) {
    if (!h.name) continue;
    const why = h.description?.trim() || WHY_NEEDED;
    if (h.value) {
      // `{smithery_api_key}` → `${SMITHERY_API_KEY}`: the authors named it.
      headers[h.name] = h.value.replace(/\{([^}]+)\}/g, (_, v: string) => {
        const env = envName(v);
        secrets[env] = why;
        return `\${${env}}`;
      });
      continue;
    }
    if (!h.isSecret) continue;
    // A secret header with no shape given. The whole value cannot be the
    // secret — a token is refused at the door if it carries a space — so an
    // Authorization header is carried as Bearer, which every remote in the
    // registry that does spell its header out spells, and the fill says the
    // shape was assumed rather than read.
    const env = envName(`${shortName(id, new Set())}_${h.name === 'Authorization' ? 'token' : h.name}`);
    if (h.name === 'Authorization') {
      headers[h.name] = `Bearer \${${env}}`;
      secrets[env] = `${why} — the registry names the header and not its shape; Bearer is assumed`;
    } else {
      headers[h.name] = `\${${env}}`;
      secrets[env] = why;
    }
  }
  return {
    transport: 'http',
    url: remote.url!,
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(Object.keys(secrets).length ? { secrets } : {}),
  };
}

const isEnvName = (s: string) => /^[A-Z][A-Z0-9_]*$/.test(s);
const envName = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(?=[0-9])/, 'X_');

/**
 * `io.github.brave/brave-search-mcp-server` → `brave-search-mcp-server`, held
 * to what a tool id can carry (D-244), and suffixed rather than refused when
 * the name is already someone's — the collision rule would otherwise turn a
 * pick into a dead end.
 */
function shortName(registryName: string, taken: Set<string>): string {
  const tail = registryName.split('/').pop() ?? registryName;
  let base = tail
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 31)
    .replace(/-+$/, '');
  if (base.length < 2) base = base ? `${base}-mcp` : 'server';
  let name = base;
  for (let n = 2; nameTaken(name, taken); n++) {
    const suffix = `-${n}`;
    name = `${base.slice(0, 31 - suffix.length).replace(/-+$/, '')}${suffix}`;
  }
  return name;
}

const readable = (registryName: string) =>
  (registryName.split('/').pop() ?? registryName).replace(/[-_]+/g, ' ').trim();

export interface SearchOptions extends FillOptions {
  fetchImpl?: typeof fetch;
  base?: string;
  timeoutMs?: number;
}

/**
 * One page of the registry for the words typed, as fills.
 *
 * **Unreachable is a named state.** An empty list would read as "no such
 * server", and that is the one thing a browse must never say by accident —
 * so a failure to reach the registry, or an answer that is not one, comes
 * back as `ok: false` with what happened, never as `hits: []`.
 */
export async function searchRegistry(query: string, opts: SearchOptions): Promise<RegistrySearch> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.base ?? REGISTRY_URL}?search=${encodeURIComponent(query)}&limit=${PAGE}`;
  let page: RegistryPage;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS) });
    if (!res.ok) return { ok: false, error: `the registry answered ${res.status} — it could not be searched just now` };
    page = (await res.json()) as RegistryPage;
    if (!page || !Array.isArray(page.servers)) throw new Error('not a registry page');
  } catch (err) {
    const what = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `the registry could not be reached (${what})` };
  }

  const hits: RegistryHit[] = [];
  const omitted: RegistryOmitted[] = [];
  // Names picked earlier in this page count as taken for later ones, so two
  // entries sharing a tail do not both offer the same short name.
  const taken = new Set(opts.taken);
  for (const row of page.servers) {
    const server = row.server;
    const meta = row._meta?.['io.modelcontextprotocol.registry/official'];
    if (!server?.name || meta?.isLatest === false || (meta?.status && meta.status !== 'active')) continue;
    const got = fillFromEntry(server, { readOn: opts.readOn, taken });
    if ('fill' in got) {
      taken.add(got.fill.name);
      hits.push({ id: server.name, version: server.version ?? '?', fill: got.fill });
    } else {
      omitted.push({ id: server.name, why: got.why });
    }
  }
  // One page is what the browse reads; a cut list must say it is cut, or
  // the rest reads as "no such server" — the same rule as unreachable.
  return { ok: true, query, hits, omitted, truncated: Boolean(page.metadata?.nextCursor) };
}
