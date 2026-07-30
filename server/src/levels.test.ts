import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendKnowledge,
  createLevelFiles,
  levelDir,
  listLevelDirs,
  migrateLegacy,
  newCrewSeed,
  readKnowledge,
  readMeta,
  readRoster,
} from './levels';

describe('levels', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-lvl-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('creates a level with meta, a starting crew of two, and a unique slug', () => {
    const meta = createLevelFiles(root, { name: 'Home Chores', project: 'Household', theme: 'household' });
    expect(meta.id).toBe('home-chores');
    const dir = levelDir(root, meta.id);
    expect(readMeta(dir).theme).toBe('household');
    const crew = readRoster(dir);
    expect(crew).toHaveLength(2);
    expect(new Set(crew.map((c) => c.name)).size).toBe(2);

    const again = createLevelFiles(root, { name: 'Home Chores', project: 'x', theme: 'cave' });
    expect(again.id).toBe('home-chores-2');
    expect(listLevelDirs(root)).toHaveLength(2);
  });

  it('hands out unused names for hires', () => {
    const crew = [newCrewSeed([])];
    crew.push(newCrewSeed(crew));
    crew.push(newCrewSeed(crew));
    expect(new Set(crew.map((c) => c.name)).size).toBe(3);
  });

  it('appends and reads level knowledge', () => {
    const dir = levelDir(root, 'k');
    mkdirSync(dir, { recursive: true });
    appendKnowledge(dir, 'first fact');
    appendKnowledge(dir, 'second fact');
    expect(readKnowledge(dir)).toEqual(['first fact', 'second fact']);
  });

  it('migrates the legacy cave into levels/hq with roles intact', () => {
    writeFileSync(path.join(root, 'roster.json'), JSON.stringify({ a1: 'scout' }));
    mkdirSync(path.join(root, 'memory'), { recursive: true });
    writeFileSync(path.join(root, 'memory', 'pip.md'), '# Pip — lessons\n\n- old wisdom\n');

    migrateLegacy(root);

    const dir = levelDir(root, 'hq');
    expect(readMeta(dir).name).toBe('HQ');
    const crew = readRoster(dir);
    expect(crew.find((c) => c.id === 'a1')!.role).toBe('scout');
    expect(crew).toHaveLength(4);
    expect(existsSync(path.join(dir, 'memory', 'pip.md'))).toBe(true);
    // Running it again is a no-op.
    migrateLegacy(root);
    expect(listLevelDirs(root)).toHaveLength(1);
  });
});
