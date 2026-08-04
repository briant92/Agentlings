import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DB } from '@agentlings/shared';
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

const PALETTE = new Set<number>(Object.values(DB));

/**
 * A crew tint is not decoration any more — the sprite is painted in it, and a
 * tint off the ramp gets snapped to the nearest entry, which is how a green
 * agentling came to be drawn grey while their name label stayed green.
 */
describe('crew colours are on the palette', () => {
  it('for a fresh hire, at every position in the rotation', () => {
    let crew = [] as ReturnType<typeof newCrewSeed>[];
    for (let i = 0; i < 16; i++) {
      const seed = newCrewSeed(crew);
      expect(PALETTE.has(seed.color)).toBe(true);
      crew = [...crew, seed];
    }
  });

  it('for the legacy crew the migration writes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agentlings-legacy-'));
    try {
      // The migration only fires when there is a pre-level cave to move.
      writeFileSync(path.join(root, 'roster.json'), JSON.stringify({ a1: 'worker' }));
      migrateLegacy(root);
      const crew = readRoster(levelDir(root, 'hq'));
      expect(crew).toHaveLength(4);
      for (const member of crew) expect(PALETTE.has(member.color)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('levels', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-lvl-'));
  });

  // rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

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
