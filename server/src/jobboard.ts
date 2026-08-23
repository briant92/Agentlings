import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import type { WorkProfile } from '@agentlings/shared';
import { onetVersion, readOnet } from './workprofile';

/**
 * The job board: the O*NET occupation database as a local, optional data
 * set the positions board can search (D-232). Not committed to the repo —
 * the release is 13 MB of generated text — and not required for anything:
 * the board is simply absent until the user adds it, the same shape as the
 * library sync. One download into `.agentlings/onet/`, attribution kept
 * (CC BY 4.0; the licensor's notice URL is in the release's own Read Me),
 * and only the three files the board reads are unpacked, so the footprint
 * is ~5 MB instead of ~40.
 *
 * Search is the positions board's rule (D-229) over the bigger list, with
 * the refinements the list forced: an exact name wins outright, a title
 * word outranks an alias word, a duty word trails, nothing matched is not
 * a result. No router, no model. Grading a hit is
 * `coverage()`'s job at the route, not this file's.
 */

export const ONET_ZIP_URL = 'https://www.onetcenter.org/dl_files/database/db_30_0_text.zip';

/** The files the board reads. Skills/technology/tools stay in the zip — the adapter tolerates their absence. */
const KEEP = ['Occupation Data.txt', 'Task Statements.txt', 'Alternate Titles.txt', 'Read Me.txt'];

export function jobboardDir(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'onet');
}

export interface JobBoardStatus {
  present: boolean;
  version?: string;
  occupations?: number;
}

export function boardStatus(sandboxRoot: string): JobBoardStatus {
  const dir = jobboardDir(sandboxRoot);
  const occFile = path.join(dir, 'Occupation Data.txt');
  if (!existsSync(occFile)) return { present: false };
  const rows = readFileSync(occFile, 'utf8').split(/\r?\n/).filter(Boolean).length - 1;
  return { present: true, version: onetVersion(dir), occupations: rows };
}

/** Unpack a downloaded release zip into the board directory; returns the status. */
export async function installOnet(sandboxRoot: string, zipBytes: Uint8Array): Promise<JobBoardStatus> {
  const zip = await JSZip.loadAsync(zipBytes);
  const dir = jobboardDir(sandboxRoot);
  mkdirSync(dir, { recursive: true });
  for (const keep of KEEP) {
    const entry = Object.values(zip.files).find((f) => !f.dir && path.basename(f.name) === keep);
    if (!entry) throw new Error(`the zip holds no "${keep}" — not an O*NET text release`);
    writeFileSync(path.join(dir, keep), await entry.async('nodebuffer'));
  }
  cache = null;
  return boardStatus(sandboxRoot);
}

/** Download the release and install it. One call, ~13 MB, only ever user-initiated. */
export async function syncOnet(
  sandboxRoot: string,
  fetchImpl: typeof fetch = fetch,
): Promise<JobBoardStatus> {
  const res = await fetchImpl(ONET_ZIP_URL);
  if (!res.ok) throw new Error(`onetcenter.org answered ${res.status}`);
  return installOnet(sandboxRoot, new Uint8Array(await res.arrayBuffer()));
}

let cache: { dir: string; profiles: WorkProfile[] } | null = null;

/** The board's profiles, read once per install. Empty when the board is absent. */
export function loadBoard(sandboxRoot: string): WorkProfile[] {
  const dir = jobboardDir(sandboxRoot);
  if (!boardStatus(sandboxRoot).present) return [];
  if (cache?.dir !== dir) cache = { dir, profiles: readOnet(dir) };
  return cache.profiles;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

const norm = (s: string) => words(s).join(' ');

/**
 * The positions board's scoring rule (D-229) over a WorkProfile, with two
 * refinements the bigger list forced: a query that *is* one of the names
 * wins outright — "bookkeeper" is an exact alias of the clerks and a
 * substring of the supervisors' "Head Bookkeeper", and O*NET's own answer
 * is the clerks — and a title word outranks an alias word, so
 * "bookkeeping" finds Bookkeeping Clerks (title) before Bookkeeping
 * Teacher (alias).
 */
export function scoreProfile(p: WorkProfile, query: string): number {
  const qs = words(query);
  if (qs.length === 0) return 0;
  const q = norm(query);
  if (norm(p.title) === q || p.aliases.some((a) => norm(a) === q)) return 100;
  const title = p.title.toLowerCase();
  const aliases = p.aliases.map((s) => s.toLowerCase());
  const duties = p.tasks.map((t) => t.text.toLowerCase()).join(' ');
  let s = 0;
  for (const w of qs) {
    if (title.includes(w)) s += 4;
    else if (aliases.some((n) => n.includes(w))) s += 3;
    else if (duties.includes(w)) s += 1;
  }
  return s;
}

/** Best matches for a query, name hits before duty hits; nothing for an empty query. */
export function searchBoard(profiles: readonly WorkProfile[], query: string, limit = 5): WorkProfile[] {
  return profiles
    .map((p, i) => ({ p, i, s: scoreProfile(p, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.p);
}

/**
 * The hire hint's stricter rule: only a title or alias hit counts, because a
 * hint under someone's own sentence must not fire on one shared duty word.
 */
export function titleMatch(profiles: readonly WorkProfile[], query: string): WorkProfile | null {
  const qs = words(query);
  if (qs.length === 0) return null;
  const q = norm(query);
  let best: { p: WorkProfile; s: number } | null = null;
  for (const p of profiles) {
    // An exact name is the answer, not a candidate.
    if (norm(p.title) === q || p.aliases.some((a) => norm(a) === q)) return p;
    const title = p.title.toLowerCase();
    const aliases = p.aliases.map((s) => s.toLowerCase());
    // Title words count double an alias word's, mirroring the search rule.
    const s = qs.reduce((n, w) => n + (title.includes(w) ? 2 : aliases.some((a) => a.includes(w)) ? 1 : 0), 0);
    // At least half the sentence's words must land in the name, and never
    // fewer than one — "bookkeeper" hints, "fix the bookkeeping of my life" half does.
    if (s > 0 && s >= qs.length && (!best || s > best.s)) best = { p, s };
  }
  return best?.p ?? null;
}
