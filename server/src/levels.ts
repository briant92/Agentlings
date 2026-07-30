import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ThemeKey } from '@agentlings/shared';

/**
 * A level is a workspace: its own crew, jobs, sandboxes, memory, and shared
 * knowledge, all under .agentlings/levels/<id>/. The roles & skills catalog
 * stays global; only definitions are shared, never context.
 */

export interface LevelMeta {
  id: string;
  name: string;
  project: string;
  theme: ThemeKey;
  createdAt: number;
}

export interface CrewSeed {
  id: string;
  name: string;
  color: number;
  role: string;
}

export const THEME_KEYS: ThemeKey[] = ['cave', 'chalkboard', 'household', 'marble'];

const NAME_POOL = [
  'Pip', 'Dot', 'Moss', 'Bea', 'Fen', 'Ivy', 'Sol', 'Tam',
  'Rue', 'Ash', 'Lux', 'Nib', 'Odd', 'Pug', 'Sky', 'Zip',
];
// Crew name tints, drawn from the DB32 master palette the world renders in.
const COLOR_POOL = [0x99e550, 0x639bff, 0xd9a066, 0xd95763, 0xd77bba, 0x5fcde4, 0xfbf236, 0x37946e];
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
  input: { name: string; project: string; theme: ThemeKey },
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

/** The level's shared brain: every finished job appends a line. */
export function appendKnowledge(dir: string, line: string): void {
  const file = path.join(dir, 'KNOWLEDGE.md');
  if (!existsSync(file)) appendFileSync(file, '# Level knowledge\n\n');
  appendFileSync(file, `- ${line}\n`);
}

export function readKnowledge(dir: string, max = 12): string[] {
  const file = path.join(dir, 'KNOWLEDGE.md');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2))
    .slice(-max);
}

/** Legacy crew from before levels existed, in original colors. */
const LEGACY = [
  { id: 'a1', name: 'Pip', color: 0x7bd88f },
  { id: 'a2', name: 'Dot', color: 0x6fb7ff },
  { id: 'a3', name: 'Moss', color: 0xffb86c },
  { id: 'a4', name: 'Bea', color: 0xff8fa3 },
];

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
