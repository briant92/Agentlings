import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BUILTIN_THEMES, type ThemeId, type ThemeKey } from '@agentlings/shared';
import { undated } from './memory';

/**
 * A level is a workspace: its own crew, jobs, sandboxes, memory, and shared
 * knowledge, all under .agentlings/levels/<id>/. The roles & skills catalog
 * stays global; only definitions are shared, never context.
 */

export interface LevelMeta {
  id: string;
  name: string;
  project: string;
  theme: ThemeId;
  createdAt: number;
  /**
   * Project folder jobs in this level work against. Asked once by the work
   * intake: undefined means never asked, '' means the user declined.
   */
  repoPath?: string;
  /**
   * Folders of your own material this level indexes into its knowledge store.
   * Per level because capability is per level (D-013): a note about one
   * project is not a note about another, the same reason a recipe is.
   */
  knowledgeSources?: string[];
  /**
   * Closed levels stay on disk, whole, and only stop being loaded — the app
   * archives and never destroys (the agentling let-go precedent). Keeping the
   * directory under levels/ is also what keeps `createLevelFiles` from ever
   * reissuing the id, so ledger rows keep pointing at real history.
   */
  closedAt?: number;
}

export interface CrewSeed {
  id: string;
  name: string;
  color: number;
  role: string;
  /** The user's own words for this agentling's job, set when they were hired. */
  jobDescription?: string;
  /**
   * Career, persisted. These used to live only in the running sim and reset
   * on every restart, which made an agentling's record meaningless.
   */
  jobsDone?: number;
  jobsFailed?: number;
  hiredAt?: number;
  lastWorkedAt?: number;
  /** Resting crew keep everything but leave the world and the job queue. */
  resting?: boolean;
}

/** The built-in looks. One list, defined in shared (M4). */
export const THEME_KEYS: readonly ThemeKey[] = BUILTIN_THEMES;

const NAME_POOL = [
  'Pip', 'Dot', 'Moss', 'Bea', 'Fen', 'Ivy', 'Sol', 'Tam',
  'Rue', 'Ash', 'Lux', 'Nib', 'Odd', 'Pug', 'Sky', 'Zip',
];
// Crew name tints, drawn from the DB32 master palette the world renders in.
// Exported because a pack is judged partly on whether these stay visible
// against it — the renderer measures every one of them.
export const COLOR_POOL = [
  0x99e550, 0x639bff, 0xd9a066, 0xd95763, 0xd77bba, 0x5fcde4, 0xfbf236, 0x37946e,
];
const STARTING_CREW = 2;

export function levelsRoot(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'levels');
}

export function levelDir(sandboxRoot: string, id: string): string {
  return path.join(levelsRoot(sandboxRoot), id);
}

export function readMeta(dir: string): LevelMeta {
  return JSON.parse(readFileSync(path.join(dir, 'level.json'), 'utf8')) as LevelMeta;
}

export function writeMeta(dir: string, meta: LevelMeta): void {
  writeFileSync(path.join(dir, 'level.json'), JSON.stringify(meta, null, 2));
}

export function readRoster(dir: string): CrewSeed[] {
  return JSON.parse(readFileSync(path.join(dir, 'roster.json'), 'utf8')) as CrewSeed[];
}

export function writeRoster(dir: string, crew: CrewSeed[]): void {
  writeFileSync(path.join(dir, 'roster.json'), JSON.stringify(crew, null, 2));
}

/** Fresh crew member with an unused name and the next color in rotation. */
export function newCrewSeed(existing: CrewSeed[]): CrewSeed {
  const used = new Set(existing.map((c) => c.name));
  const name =
    NAME_POOL.find((n) => !used.has(n)) ?? `Ling-${existing.length + 1}`;
  return {
    hiredAt: Date.now(),
    id: `a${existing.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    color: COLOR_POOL[existing.length % COLOR_POOL.length],
    role: 'worker',
  };
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'level';
}

export function createLevelFiles(
  sandboxRoot: string,
  input: { name: string; project: string; theme: ThemeId },
): LevelMeta {
  let id = slugify(input.name);
  let n = 2;
  while (existsSync(levelDir(sandboxRoot, id))) id = `${slugify(input.name)}-${n++}`;
  const dir = levelDir(sandboxRoot, id);
  mkdirSync(dir, { recursive: true });
  const meta: LevelMeta = { id, ...input, createdAt: Date.now() };
  writeFileSync(path.join(dir, 'level.json'), JSON.stringify(meta, null, 2));
  const crew: CrewSeed[] = [];
  for (let i = 0; i < STARTING_CREW; i++) crew.push(newCrewSeed(crew));
  writeRoster(dir, crew);
  return meta;
}

export function listLevelDirs(sandboxRoot: string): string[] {
  const root = levelsRoot(sandboxRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, 'level.json')))
    .map((e) => path.join(root, e.name));
}

/**
 * The note a finished job leaves in the level's shared brain, or `null` when
 * it has nothing worth leaving.
 *
 * A run that banked no lesson used to append its job-log line regardless, and
 * those lines had grown to half the corpus (D-167). They carry the title and
 * the outcome — both already recorded in the ledger and in the agentling's own
 * memory — and no lesson for anyone to read. Since a session is handed the
 * eight notes most relevant to *its own* job, a contentless one can only ever
 * take a slot: measured at 31% of what a session actually received, with one
 * real lesson displaced.
 *
 * Nothing migrates. The bare lines already written stay where they are — this
 * only stops the corpus growing that half further, which is why it needs no
 * read-path change and no backfill.
 */
export function knowledgeNote(
  date: string,
  agentling: { name: string; role: string },
  title: string,
  outcome: 'done' | 'failed',
  lesson?: string,
): string | null {
  if (!lesson?.trim()) return null;
  const verb = outcome === 'done' ? 'delivered' : 'failed';
  return `${date} · ${agentling.name} (${agentling.role}) ${verb} "${title}" — ${lesson}`;
}

/** The level's shared brain: every finished job that learnt something appends a line. */
export function appendKnowledge(dir: string, line: string): void {
  const file = path.join(dir, 'KNOWLEDGE.md');
  if (!existsSync(file)) {
    writeFileSync(file, `# Level knowledge\n\n- ${line}\n`);
    return;
  }
  // The same note on a new date replaces the old rather than joining it — a
  // recurring job banks its lesson every run, and the eight most relevant
  // notes a session is shown become eight copies of one fact (D-073). Exact
  // match on the undated text only: measured, `similarity()` cannot tell a
  // reworded lesson from a different one, so anything cleverer here would eat
  // real notes; the reworded repeat is caught upstream, by the close-out. Only
  // the "- " duplicate is dropped — anything else in the file stays put.
  const fresh = undated(line);
  const kept = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !(l.startsWith('- ') && undated(l.slice(2)) === fresh));
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
  writeFileSync(file, `${kept.join('\n')}\n- ${line}\n`);
}

/**
 * The level's notes. `max` is a sanity bound, not a selection: both callers
 * pick what they need by relevance, and handing them only the newest twelve
 * meant a job about billing was shown whatever happened to be done yesterday.
 */
export function readKnowledge(dir: string, max = 400): string[] {
  const file = path.join(dir, 'KNOWLEDGE.md');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2))
    .slice(-max);
}

/**
 * Legacy crew from before levels existed.
 *
 * Their colours used to be hand-written and predate the ramp, which stopped
 * being cosmetic once the sprite itself is painted in them: a tint is snapped
 * onto DB32, and Pip's mint green landed 1% closer to `steel` than to
 * `limeLight`, so a green agentling was drawn grey while their name label
 * stayed green. Taking the tints from the same pool every other hire draws
 * from makes that unrepresentable rather than merely fixed — there is now one
 * list of crew colours in this file, and it is already on the palette.
 */
const LEGACY = ['Pip', 'Dot', 'Moss', 'Bea'].map((name, i) => ({
  id: `a${i + 1}`,
  name,
  color: COLOR_POOL[i],
}));

/** One-time move of the pre-level cave into levels/hq. */
export function migrateLegacy(sandboxRoot: string): void {
  if (existsSync(levelsRoot(sandboxRoot))) return;
  const oldRoster = path.join(sandboxRoot, 'roster.json');
  const oldMemory = path.join(sandboxRoot, 'memory');
  const oldJobs = path.join(sandboxRoot, 'jobs');
  if (!existsSync(oldRoster) && !existsSync(oldMemory) && !existsSync(oldJobs)) return;

  const dir = levelDir(sandboxRoot, 'hq');
  mkdirSync(dir, { recursive: true });
  const meta: LevelMeta = {
    id: 'hq',
    name: 'HQ',
    project: 'Agentlings dev',
    theme: 'cave',
    createdAt: Date.now(),
  };
  writeFileSync(path.join(dir, 'level.json'), JSON.stringify(meta, null, 2));

  let crew: CrewSeed[] = LEGACY.map((c) => ({ ...c, role: 'worker' }));
  if (existsSync(oldRoster)) {
    try {
      const roles = JSON.parse(readFileSync(oldRoster, 'utf8')) as Record<string, string>;
      crew = crew.map((c) => ({ ...c, role: roles[c.id] ?? 'worker' }));
    } catch {
      // Keep defaults.
    }
    renameSync(oldRoster, path.join(dir, 'roster.legacy.json'));
  }
  writeRoster(dir, crew);
  if (existsSync(oldMemory)) renameSync(oldMemory, path.join(dir, 'memory'));
  if (existsSync(oldJobs)) renameSync(oldJobs, path.join(dir, 'jobs'));
}
