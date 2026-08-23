import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { LedgerEntry } from './ledger';
import { readKnowledge } from './levels';
import { undated } from './memory';
import { jobsFile, readStoredJobs } from './queue';
import { normalise, readRecipes, readToolCandidates, recipesFile, terms, toolCandidatesFile } from './recipes';
import { wantedTerms } from './router';
import { PRIOR_RECONCILIATION_FILE, RECONCILIATIONS_DIR } from './reconciliation';
import { indexFile, readIndex } from './store';
import { readTools, toolsDir } from './tools';

/**
 * The provenance index: what a level has on file, and which record came from
 * which, built from identifiers the records already carry.
 *
 * Derived and read-only. Every node is a record that exists on disk, every
 * edge names the identifier that produced it (`via`), and an identifier that
 * names nothing — or more than one thing — is counted rather than hidden. No
 * edge is ever inferred from similarity: a map that guesses is the thing the
 * router is built to refuse, and this map is for looking, not for routing.
 * Nothing in the executors or the router reads it (a test holds that).
 */

export type NodeKind =
  | 'job'
  | 'note'
  | 'lesson'
  | 'recipe'
  | 'tool'
  | 'candidate'
  | 'source'
  | 'passage'
  | 'reconciliation'
  | 'agentling';

export type Flag = 'stale' | 'missing' | 'retired' | 'scanned' | 'unparsed' | 'unlisted';

/** Which identifier an edge was read off. Never a score. */
export type Via =
  /** A ledger row carrying the recipe it ran under (oneshot rows). */
  | 'ledger.recipeKey'
  /** A job whose normalised prompt is a recipe's key — the router's own identity. */
  | 'job.prompt=recipe.key'
  /** A ledger row run by a tool, matched to the manifest compiled from that exact key. */
  | 'ledger.tier=tool'
  /** The `(job: title)` stamp the close-out puts on a lesson (D-089). By title. */
  | 'lesson.jobStamp'
  /** The quoted title inside a knowledge note (`delivered "…"`, `had "…" discarded`). By title. */
  | 'note.title'
  /** The agentling named at the front of a knowledge note. */
  | 'note.agentling'
  /** A tool manifest's `recipeKey`. */
  | 'manifest.recipeKey'
  /** A store passage's `source` file. */
  | 'entry.source'
  /** `job.continues`. */
  | 'job.continues'
  /** A banked reconciliation's `jobId` (D-223). */
  | 'reconciliation.jobId'
  /** The prior a job was handed, by the `jobId` inside its sandbox's PRIOR-RECONCILIATION.json. */
  | 'prior.jobId'
  /** A tool-candidate line's `recipeKey` and `jobId`. */
  | 'candidate.recipeKey';

export interface Node {
  id: string;
  kind: NodeKind;
  /** The record's own first line or title, trimmed to `LABEL_CHARS`. */
  label: string;
  origin: { file: string; line?: number };
  at?: number;
  flags?: Flag[];
}

export interface Edge {
  from: string;
  to: string;
  via: Via;
  /** Set when a title named this many jobs; the edge points at the first. */
  ambiguous?: number;
}

export interface Provenance {
  levelId: string;
  builtAt: number;
  /** The newest mtime among the files read, so a cache can tell when to rebuild. */
  inputsMtime: number;
  nodes: Node[];
  edges: Edge[];
  /** Identifiers that named nothing, by the edge kind they would have made. */
  unresolved: Partial<Record<Via, number>>;
  buildMs: number;
}

export const LABEL_CHARS = 160;
/** A week, the store's own bound. Imported as a number rather than from store.ts to keep this a leaf. */
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Store passages between turns of the event loop. The sim ticks every 100 ms
 * and a build at the store's caps (50,000 passages) took 390 ms in one piece
 * — four ticks the world would have skipped for a panel. Measured at this
 * batch size: the worst pause at the caps is 52 ms, and that slice is the
 * index's own parse (31 ms bare), which nothing here can split; the build
 * still finishes inside half a second.
 */
const YIELD_EVERY = 500;

/** One turn of the loop, so a tick or a frame can go out mid-build. */
const breathe = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function hash(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 12);
}

function label(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > LABEL_CHARS ? `${one.slice(0, LABEL_CHARS - 1)}…` : one;
}

function mtime(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** `2026-08-04 · Pip (worker) delivered "title" — lesson`, and the discard twin. */
const NOTE =
  /^(\d{4}-\d{2}-\d{2}) · (.+?) \((.+?)\) (?:delivered|failed|had) "(.+?)"(?: discarded)?(?: —|$)/;
/** `(job: title)` on the end of a lesson (D-089). */
const STAMP = / \(job: (.+)\)$/;

export const jobNodeId = (id: string): string => `job:${id}`;
export const recipeNodeId = (key: string, shape?: readonly string[]): string =>
  `recipe:${key}#${shape && shape.length > 0 ? [...shape].sort().join('|') : 'none'}`;

/**
 * Builds the index for one level from its directory and the ledger rows that
 * belong to it. The ledger is the one global file, so the caller filters it;
 * this function never sees another level's rows.
 */
export async function buildProvenance(
  levelDir: string,
  levelId: string,
  ledger: readonly LedgerEntry[],
  now: number,
): Promise<Provenance> {
  const started = performance.now();
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  const unresolved: Partial<Record<Via, number>> = {};
  let inputsMtime = 0;
  const touch = (file: string): void => {
    inputsMtime = Math.max(inputsMtime, mtime(file));
  };
  const miss = (via: Via): void => {
    unresolved[via] = (unresolved[via] ?? 0) + 1;
  };
  const add = (node: Node): Node => {
    const existing = nodes.get(node.id);
    if (existing) return existing;
    nodes.set(node.id, node);
    return node;
  };
  const rel = (file: string): string => path.relative(levelDir, file).split(path.sep).join('/');

  // --- jobs: the queue file, the sandboxes, and whatever the ledger names ---
  const jobsPath = jobsFile(levelDir);
  touch(jobsPath);
  let jobs: ReturnType<typeof readStoredJobs> = [];
  try {
    jobs = readStoredJobs(levelDir);
  } catch {
    add({
      id: `job:${rel(jobsPath)}`,
      kind: 'job',
      label: 'jobs.json could not be read',
      origin: { file: rel(jobsPath) },
      flags: ['unparsed'],
    });
  }
  /** Title → job ids, for the two by-title edges. */
  const byTitle = new Map<string, string[]>();
  const byKey = new Map<string, string[]>();
  /**
   * The jobs a dated, titled line names: every job with that title, narrowed
   * to the ones that finished on the line's date when that leaves any. Still
   * identification — two fields the records carry — never a score. A
   * recurring sentence shares its title across every run, so the title alone
   * named several jobs for most of hq's lessons; the date is what the
   * close-out wrote the line under.
   */
  const named = (title: string, date: string | undefined): string[] => {
    const hits = byTitle.get(title) ?? [];
    if (!date || hits.length < 2) return hits;
    const sameDay = hits.filter((id) => {
      const job = jobs.find((j) => j.id === id);
      const at = job?.finishedAt ?? job?.createdAt;
      return typeof at === 'number' && new Date(at).toISOString().slice(0, 10) === date;
    });
    return sameDay.length > 0 ? sameDay : hits;
  };
  for (const job of jobs) {
    add({
      id: jobNodeId(job.id),
      kind: 'job',
      label: label(job.title || job.id),
      origin: { file: rel(jobsPath) },
      at: job.createdAt,
    });
    const title = (job.title ?? '').trim();
    if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), job.id]);
    if (job.prompt) {
      const key = normalise(job.prompt);
      byKey.set(key, [...(byKey.get(key) ?? []), job.id]);
    }
  }
  for (const job of jobs) {
    if (!job.continues) continue;
    if (nodes.has(jobNodeId(job.continues))) {
      edges.push({ from: jobNodeId(job.id), to: jobNodeId(job.continues), via: 'job.continues' });
    } else miss('job.continues');
  }
  const sandboxes = path.join(levelDir, 'jobs');
  const sandboxIds = existsSync(sandboxes)
    ? readdirSync(sandboxes).filter((name) => {
        try {
          return statSync(path.join(sandboxes, name)).isDirectory();
        } catch {
          return false;
        }
      })
    : [];
  let opened = 0;
  for (const id of sandboxIds) {
    // Sandboxes are file reads; a level with hundreds of them is the other
    // place a build could hold the loop.
    if (++opened % 25 === 0) await breathe();
    const dir = path.join(sandboxes, id);
    const result = path.join(dir, 'RESULT.md');
    let head: string | undefined;
    if (existsSync(result)) {
      touch(result);
      try {
        head = readFileSync(result, 'utf8')
          .split(/\r?\n/)
          .map((l) => l.replace(/^#+\s*/, '').trim())
          .find(Boolean);
      } catch {
        head = undefined;
      }
    }
    const node = add({
      id: jobNodeId(id),
      kind: 'job',
      label: head ? label(head) : id,
      origin: { file: `jobs/${id}` },
      flags: ['unlisted'],
    });
    if (head && node.label === id) node.label = label(head);
    // The prior a run was handed (D-223): the sandbox copy names the job it came from.
    const prior = path.join(dir, PRIOR_RECONCILIATION_FILE);
    if (existsSync(prior)) {
      touch(prior);
      try {
        const parsed = JSON.parse(readFileSync(prior, 'utf8')) as { jobId?: unknown };
        if (typeof parsed.jobId === 'string') {
          edges.push({
            from: jobNodeId(id),
            to: `reconciliation:${parsed.jobId}`,
            via: 'prior.jobId',
          });
        } else miss('prior.jobId');
      } catch {
        miss('prior.jobId');
      }
    }
  }

  await breathe();
  // --- recipes ---
  const recipesPath = recipesFile(levelDir);
  touch(recipesPath);
  const recipes = readRecipes(levelDir);
  if (existsSync(recipesPath) && recipes.length === 0) {
    let torn = false;
    try {
      torn = !Array.isArray(JSON.parse(readFileSync(recipesPath, 'utf8')));
    } catch {
      torn = true;
    }
    if (torn) {
      add({
        id: 'recipe:recipes.json',
        kind: 'recipe',
        label: 'recipes.json could not be read',
        origin: { file: 'recipes.json' },
        flags: ['unparsed'],
      });
    }
  }
  const recipeIdsByKey = new Map<string, string[]>();
  recipes.forEach((recipe, i) => {
    const id = recipeNodeId(recipe.key, recipe.inputShape);
    add({
      id,
      kind: 'recipe',
      label: label(recipe.key),
      origin: { file: 'recipes.json', line: i },
      at: recipe.learnedAt,
    });
    recipeIdsByKey.set(recipe.key, [...(recipeIdsByKey.get(recipe.key) ?? []), id]);
  });
  /**
   * A recipe key that rows still name but recipes.json no longer holds — a
   * method dropped or rewritten since (D-074 dropped one by identification).
   * Shown as a missing node rather than lost as a count: "this method ran 26
   * times and is gone" is a fact about the level worth seeing.
   */
  const recipeOrMissing = (key: string): string => {
    const found = recipeIdsByKey.get(key);
    if (found) return found[0];
    const id = recipeNodeId(key, undefined);
    add({ id, kind: 'recipe', label: label(key), origin: { file: 'recipes.json' }, flags: ['missing'] });
    recipeIdsByKey.set(key, [id]);
    return id;
  };
  // A job is a run of a recipe when its own sentence is the recipe's key — the
  // same identity the router uses, never the similarity it also uses.
  for (const [key, jobIds] of byKey) {
    const targets = recipeIdsByKey.get(key);
    if (!targets) continue;
    for (const jobId of jobIds) {
      edges.push({ from: jobNodeId(jobId), to: targets[0], via: 'job.prompt=recipe.key' });
    }
  }

  await breathe();
  // --- tools and candidates ---
  const tools = readTools(levelDir);
  const toolsByKey = new Map<string, string>();
  for (const tool of tools) {
    const manifest = path.join(toolsDir(levelDir), tool.name, 'tool.json');
    touch(manifest);
    const id = `tool:${tool.name}`;
    add({
      id,
      kind: 'tool',
      label: tool.name,
      origin: { file: `tools/${tool.name}/tool.json` },
      ...(tool.retiredReason ? { flags: ['retired' as Flag] } : {}),
    });
    toolsByKey.set(tool.recipeKey, id);
    const targets = recipeIdsByKey.get(tool.recipeKey);
    if (targets) edges.push({ from: id, to: targets[0], via: 'manifest.recipeKey' });
    else miss('manifest.recipeKey');
  }
  const candidatesPath = toolCandidatesFile(levelDir);
  touch(candidatesPath);
  readToolCandidates(levelDir).forEach((raw, i) => {
    const c = raw as { at?: number; jobId?: string; recipeKey?: string; prompt?: string };
    if (typeof c.recipeKey !== 'string') return;
    const id = `candidate:${hash(`${c.jobId ?? ''}#${c.recipeKey}`)}`;
    add({
      id,
      kind: 'candidate',
      label: label(c.prompt ?? c.recipeKey),
      origin: { file: 'tool-candidates.jsonl', line: i + 1 },
      at: c.at,
    });
    edges.push({ from: id, to: recipeOrMissing(c.recipeKey), via: 'candidate.recipeKey' });
    if (typeof c.jobId === 'string' && nodes.has(jobNodeId(c.jobId))) {
      edges.push({ from: jobNodeId(c.jobId), to: id, via: 'candidate.recipeKey' });
    }
  });

  await breathe();
  // --- the ledger, already filtered to this level by the caller ---
  for (const row of ledger) {
    const from = jobNodeId(row.jobId);
    if (!nodes.has(from)) {
      add({
        id: from,
        kind: 'job',
        label: row.jobId,
        origin: { file: 'ledger.jsonl' },
        at: row.at,
        flags: ['unlisted'],
      });
    }
    if (row.recipeKey) {
      edges.push({ from, to: recipeOrMissing(row.recipeKey), via: 'ledger.recipeKey' });
    }
    if (row.tier === 'tool') {
      // The row does not name the tool. The manifest compiled from this exact
      // sentence is identification; a tool that matched on similarity is not,
      // and is counted as unresolved rather than guessed.
      const job = jobs.find((j) => j.id === row.jobId);
      const tool = job?.prompt ? toolsByKey.get(normalise(job.prompt)) : undefined;
      if (tool) edges.push({ from, to: tool, via: 'ledger.tier=tool' });
      else miss('ledger.tier=tool');
    }
  }

  await breathe();
  // --- agentlings and lessons ---
  const memoryDir = path.join(levelDir, 'memory');
  const memoryFiles = existsSync(memoryDir)
    ? readdirSync(memoryDir).filter((n) => n.endsWith('.md'))
    : [];
  const agentlingIds = new Map<string, string>();
  for (const file of memoryFiles) {
    const name = file.slice(0, -3);
    const full = path.join(memoryDir, file);
    touch(full);
    const agentId = `agentling:${name}`;
    add({ id: agentId, kind: 'agentling', label: name, origin: { file: `memory/${file}` } });
    agentlingIds.set(name.toLowerCase(), agentId);
    let lines: string[];
    try {
      lines = readFileSync(full, 'utf8').split(/\r?\n/);
    } catch {
      add({
        id: `lesson:${name}:unparsed`,
        kind: 'lesson',
        label: `${file} could not be read`,
        origin: { file: `memory/${file}` },
        flags: ['unparsed'],
      });
      continue;
    }
    lines.forEach((raw, i) => {
      if (!raw.startsWith('- ')) return;
      const text = raw.slice(2);
      const id = `lesson:${name}:${hash(undated(text))}`;
      add({
        id,
        kind: 'lesson',
        label: label(text),
        origin: { file: `memory/${file}`, line: i + 1 },
        at: dateOf(text),
      });
      edges.push({ from: id, to: agentId, via: 'note.agentling' });
      const stamp = STAMP.exec(text);
      if (!stamp) return;
      const hits = named(stamp[1].trim(), /^(\d{4}-\d{2}-\d{2}) · /.exec(text)?.[1]);
      if (hits.length === 0) miss('lesson.jobStamp');
      else {
        edges.push({
          from: id,
          to: jobNodeId(hits[0]),
          via: 'lesson.jobStamp',
          ...(hits.length > 1 ? { ambiguous: hits.length } : {}),
        });
      }
    });
  }

  await breathe();
  // --- level knowledge ---
  const knowledgePath = path.join(levelDir, 'KNOWLEDGE.md');
  touch(knowledgePath);
  readKnowledge(levelDir, Number.MAX_SAFE_INTEGER).forEach((text, i) => {
    const id = `note:${hash(undated(text))}`;
    add({ id, kind: 'note', label: label(text), origin: { file: 'KNOWLEDGE.md', line: i + 1 }, at: dateOf(text) });
    const m = NOTE.exec(text);
    if (!m) return;
    const agent = agentlingIds.get(m[2].toLowerCase());
    if (agent) edges.push({ from: id, to: agent, via: 'note.agentling' });
    else miss('note.agentling');
    const hits = named(m[4].trim(), m[1]);
    if (hits.length === 0) miss('note.title');
    else {
      edges.push({
        from: id,
        to: jobNodeId(hits[0]),
        via: 'note.title',
        ...(hits.length > 1 ? { ambiguous: hits.length } : {}),
      });
    }
  });

  await breathe();
  // --- the store ---
  const storePath = indexFile(levelDir);
  touch(storePath);
  const index = readIndex(levelDir);
  // The parse of a cap-sized index is 30 ms on its own; it gets its own slice.
  await breathe();
  if (index) {
    const stale = now - index.syncedAt > STALE_MS;
    const ordinal = new Map<string, number>();
    let seen = 0;
    for (const entry of index.entries) {
      if (++seen % YIELD_EVERY === 0) await breathe();
      const sourceId = `source:${entry.source}`;
      if (!nodes.has(sourceId)) {
        const present = index.sources.some((root) => existsSync(path.join(root, entry.source)));
        add({
          id: sourceId,
          kind: 'source',
          label: entry.source,
          origin: { file: 'store-index.json' },
          at: entry.syncedAt,
          flags: [...(stale ? ['stale' as Flag] : []), ...(present ? [] : ['missing' as Flag])],
        });
      }
      const n = (ordinal.get(entry.source) ?? 0) + 1;
      ordinal.set(entry.source, n);
      const id = `passage:${entry.source}#${n}`;
      add({
        id,
        kind: 'passage',
        label: label(entry.text),
        origin: { file: 'store-index.json' },
        at: entry.syncedAt,
        flags: [...(stale ? ['stale' as Flag] : []), ...(entry.scanned ? ['scanned' as Flag] : [])],
      });
      edges.push({ from: id, to: sourceId, via: 'entry.source' });
    }
  } else if (existsSync(storePath)) {
    add({
      id: 'source:store-index.json',
      kind: 'source',
      label: 'store-index.json could not be read',
      origin: { file: 'store-index.json' },
      flags: ['unparsed'],
    });
  }

  await breathe();
  // --- banked reconciliations (D-223) ---
  const reconDir = path.join(levelDir, RECONCILIATIONS_DIR);
  if (existsSync(reconDir)) {
    for (const name of readdirSync(reconDir)) {
      if (!name.endsWith('.json')) continue;
      const full = path.join(reconDir, name);
      touch(full);
      const file = `${RECONCILIATIONS_DIR}/${name}`;
      let parsed: { jobId?: unknown; approvedAt?: unknown; reconciliation?: { period?: unknown } };
      try {
        parsed = JSON.parse(readFileSync(full, 'utf8'));
      } catch {
        add({ id: `reconciliation:${name}`, kind: 'reconciliation', label: `${name} could not be read`, origin: { file }, flags: ['unparsed'] });
        continue;
      }
      if (typeof parsed.jobId !== 'string') {
        add({ id: `reconciliation:${name}`, kind: 'reconciliation', label: `${name} names no job`, origin: { file }, flags: ['unparsed'] });
        miss('reconciliation.jobId');
        continue;
      }
      const id = `reconciliation:${parsed.jobId}`;
      const period = typeof parsed.reconciliation?.period === 'string' ? parsed.reconciliation.period : undefined;
      add({
        id,
        kind: 'reconciliation',
        label: period ? `reconciliation ${period}` : `reconciliation from ${parsed.jobId}`,
        origin: { file },
        ...(typeof parsed.approvedAt === 'number' ? { at: parsed.approvedAt } : {}),
      });
      if (nodes.has(jobNodeId(parsed.jobId))) {
        edges.push({ from: id, to: jobNodeId(parsed.jobId), via: 'reconciliation.jobId' });
      } else miss('reconciliation.jobId');
    }
  }
  // A prior named by a sandbox but banked nowhere is a dangling pointer, said so.
  for (const edge of edges) {
    if (edge.via === 'prior.jobId' && !nodes.has(edge.to)) {
      add({ id: edge.to, kind: 'reconciliation', label: edge.to.slice('reconciliation:'.length), origin: { file: RECONCILIATIONS_DIR }, flags: ['missing'] });
    }
  }

  return {
    levelId,
    builtAt: now,
    inputsMtime,
    nodes: [...nodes.values()],
    edges,
    unresolved,
    buildMs: Math.round((performance.now() - started) * 10) / 10,
  };
}

/** The date a dated line starts with, as a timestamp; absent when it has none. */
function dateOf(text: string): number | undefined {
  const m = /^(\d{4}-\d{2}-\d{2}) · /.exec(text);
  if (!m) return undefined;
  const t = Date.parse(m[1]);
  return Number.isNaN(t) ? undefined : t;
}

/** One node and everything one hop away, capped; `more` says what the cap hid. */
export function neighbourhood(
  p: Provenance,
  id: string,
  cap = 50,
): { node: Node; edges: Edge[]; nodes: Node[]; more: number } | null {
  const node = p.nodes.find((n) => n.id === id);
  if (!node) return null;
  const touching = p.edges.filter((e) => e.from === id || e.to === id);
  const kept = touching.slice(0, cap);
  const ids = new Set(kept.flatMap((e) => [e.from, e.to]));
  ids.delete(id);
  return {
    node,
    edges: kept,
    nodes: p.nodes.filter((n) => ids.has(n.id)),
    more: touching.length - kept.length,
  };
}

/** Nodes by kind, for the summary and the report. */
export function countByKind(p: Provenance): Record<NodeKind, number> {
  const counts = Object.fromEntries(
    (['job', 'note', 'lesson', 'recipe', 'tool', 'candidate', 'source', 'passage', 'reconciliation', 'agentling'] as NodeKind[]).map((k) => [k, 0]),
  ) as Record<NodeKind, number>;
  for (const n of p.nodes) counts[n.kind]++;
  return counts;
}

/** Edges by `via`, and how many of each were ambiguous. */
export function countByVia(p: Provenance): Record<string, { edges: number; ambiguous: number }> {
  const out: Record<string, { edges: number; ambiguous: number }> = {};
  for (const e of p.edges) {
    out[e.via] ??= { edges: 0, ambiguous: 0 };
    out[e.via].edges++;
    if (e.ambiguous) out[e.via].ambiguous++;
  }
  return out;
}

/**
 * Records sharing words with a query, best first — ranked by the same rule a
 * session's eight notes are: content words, the asking words dropped, counted.
 * `shared` is shown so the ranking is legible, not so it can be tuned here.
 */
export function searchProvenance(
  p: Provenance,
  query: string,
  limit = 50,
): { node: Node; shared: number }[] {
  const wanted = wantedTerms(query);
  if (wanted.size === 0) return [];
  return p.nodes
    .map((node) => ({ node, shared: terms(node.label).filter((t) => wanted.has(t)).length }))
    .filter((hit) => hit.shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, limit);
}

/** How long a built index stays in memory after its last use. */
export const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * The newest mtime among a level's inputs, stat'd rather than read — a few
 * hundred stats on hq, under 10 ms — so a panel open can tell whether the
 * cached build is still the level. Compared to `Provenance.inputsMtime`,
 * which the build records off the same files.
 */
export function inputsStamp(levelDir: string, ledgerFile: string): number {
  let stamp = Math.max(
    mtime(ledgerFile),
    mtime(jobsFile(levelDir)),
    mtime(path.join(levelDir, 'KNOWLEDGE.md')),
    mtime(recipesFile(levelDir)),
    mtime(indexFile(levelDir)),
    mtime(toolCandidatesFile(levelDir)),
  );
  const under = (dir: string, pick: (name: string) => string | null): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const file = pick(name);
      if (file) stamp = Math.max(stamp, mtime(file));
    }
  };
  under(path.join(levelDir, 'memory'), (n) => (n.endsWith('.md') ? path.join(levelDir, 'memory', n) : null));
  under(toolsDir(levelDir), (n) => path.join(toolsDir(levelDir), n, 'tool.json'));
  under(path.join(levelDir, RECONCILIATIONS_DIR), (n) => path.join(levelDir, RECONCILIATIONS_DIR, n));
  under(path.join(levelDir, 'jobs'), (n) => path.join(levelDir, 'jobs', n, 'RESULT.md'));
  return stamp;
}

/**
 * One built index per level, kept while a panel is looking and rebuilt when
 * the files move. Never warmed at boot, never touched by a job or a tick.
 */
export class ProvenanceCache {
  private entries = new Map<string, { built: Provenance; stamp: number; drop: NodeJS.Timeout }>();

  constructor(
    private ledgerFile: string,
    private ledgerFor: (levelId: string) => readonly LedgerEntry[],
    private ttlMs = CACHE_TTL_MS,
  ) {}

  async get(levelDir: string, levelId: string, now: number): Promise<Provenance> {
    const stamp = inputsStamp(levelDir, this.ledgerFile);
    const have = this.entries.get(levelId);
    if (have && have.stamp >= stamp) {
      have.drop.refresh();
      return have.built;
    }
    const built = await buildProvenance(levelDir, levelId, this.ledgerFor(levelId), now);
    if (have) clearTimeout(have.drop);
    const drop = setTimeout(() => this.entries.delete(levelId), this.ttlMs);
    drop.unref();
    this.entries.set(levelId, { built, stamp, drop });
    return built;
  }

  /** For tests and for a level being closed. */
  forget(levelId: string): void {
    const have = this.entries.get(levelId);
    if (have) clearTimeout(have.drop);
    this.entries.delete(levelId);
  }

  size(): number {
    return this.entries.size;
  }
}
