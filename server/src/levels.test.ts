import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DB } from '@agentlings/shared';
import {
  appendKnowledge,
  createLevelFiles,
  knowledgeNote,
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

  it('for the legacy crew the migration writes', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agentlings-legacy-'));
    try {
      // The migration only fires when there is a pre-level cave to move.
      writeFileSync(path.join(root, 'roster.json'), JSON.stringify({ a1: 'worker' }));
      migrateLegacy(root);
      const crew = readRoster(levelDir(root, 'hq'));
      expect(crew).toHaveLength(4);
      for (const member of crew) expect(PALETTE.has(member.color)).toBe(true);
    } finally {
      // A throw here would replace the assertion above with a lock error.
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(
        () => {},
      );
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

  // A recurring job banks its note every run, and the eight most relevant
  // notes a session is shown become eight copies of one fact (D-073). The
  // date is bookkeeping, not content: the same words on a new date are the
  // same note, and the newest telling is the one that stays.
  it('replaces a note that says the same thing on a new date', () => {
    const dir = levelDir(root, 'k2');
    mkdirSync(dir, { recursive: true });
    appendKnowledge(dir, '2026-08-01 · Pip (worker) delivered "monthly table"');
    appendKnowledge(dir, '2026-08-02 · something else entirely');
    appendKnowledge(dir, '2026-08-04 · Pip (worker) delivered "monthly table"');
    expect(readKnowledge(dir)).toEqual([
      '2026-08-02 · something else entirely',
      '2026-08-04 · Pip (worker) delivered "monthly table"',
    ]);
  });

  // Exact match only, deliberately: measured against the real corpora, a
  // reworded lesson scores 0.3–0.5 under similarity() while genuinely distinct
  // notes crowd the same band, so anything fuzzier here would eat real notes.
  it('keeps notes that differ in any word, however alike they read', () => {
    const dir = levelDir(root, 'k3');
    mkdirSync(dir, { recursive: true });
    appendKnowledge(dir, '2026-08-01 · indicators lag their reference period by 1-3 weeks');
    appendKnowledge(dir, '2026-08-04 · indicators lag their reference period by 2-3 weeks');
    expect(readKnowledge(dir)).toHaveLength(2);
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

/**
 * D-167 measured half the corpus as contentless job-log lines, and 31% of what
 * a session was actually handed. The fix is at the write, not the read: a run
 * with no lesson leaves nothing behind.
 */
describe('a note is only worth keeping if it carries a lesson', () => {
  const pip = { name: 'Pip', role: 'worker' };

  it('refuses a delivered run that banked no lesson', () => {
    expect(knowledgeNote('2026-08-12', pip, 'monthly table', 'done')).toBeNull();
  });

  it('refuses a failed run that banked no lesson', () => {
    expect(knowledgeNote('2026-08-12', pip, 'Harden slugify', 'failed')).toBeNull();
  });

  // A close-out that returns an empty string, or one of whitespace, has said
  // nothing — and `lesson ? …` alone would have written the em-dash anyway.
  it('refuses an empty or whitespace lesson', () => {
    expect(knowledgeNote('2026-08-12', pip, 'monthly table', 'done', '')).toBeNull();
    expect(knowledgeNote('2026-08-12', pip, 'monthly table', 'done', '   ')).toBeNull();
  });

  // The format is pinned because the corpus already holds 218 lines in it:
  // `undated()` dedups on it and relevantLines() scores on it, so a run that
  // learns something must still land byte-identical to what came before.
  it('keeps a lesson in exactly the shape the corpus already holds', () => {
    expect(knowledgeNote('2026-08-12', pip, 'monthly table', 'done', 'Check the date column')).toBe(
      '2026-08-12 · Pip (worker) delivered "monthly table" — Check the date column',
    );
    expect(
      knowledgeNote('2026-08-12', { name: 'Moss', role: 'designer' }, 'Author a pack', 'failed', 'Use finish: smooth'),
    ).toBe('2026-08-12 · Moss (designer) failed "Author a pack" — Use finish: smooth');
  });
});
