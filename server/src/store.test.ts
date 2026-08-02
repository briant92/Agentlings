import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_ENTRY_CHARS,
  MAX_PER_SOURCE,
  STALE_MS,
  asLine,
  isStale,
  passages,
  readIndex,
  storeLines,
  sync,
  writeIndex,
} from './store';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 2);

describe('passages', () => {
  it('splits a document at its headings', () => {
    const out = passages('# Deploy\nRun the script.\n\n## Rollback\nRevert the tag.');
    expect(out).toEqual(['# Deploy Run the script.', '## Rollback Revert the tag.']);
  });

  // The heading is usually the only place the subject is named. Dropping it
  // makes a section about the retry logic score zero against "retry".
  it('keeps the heading with its own section', () => {
    expect(passages('# Retry logic\nIt backs off.')[0]).toContain('Retry logic');
  });

  it('treats a file with no headings as one passage', () => {
    expect(passages('just some notes\nover two lines')).toEqual(['just some notes over two lines']);
  });

  it('drops empty sections rather than indexing blanks', () => {
    expect(passages('\n\n   \n')).toEqual([]);
  });

  it('trims a passage that would swamp the context', () => {
    const [only] = passages(`# Big\n${'word '.repeat(500)}`);
    expect(only.length).toBeLessThanOrEqual(MAX_ENTRY_CHARS + 40);
  });
});

describe('sync', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-store-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const write = (rel: string, text: string): void => {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  };

  it('indexes markdown and text, and stamps each entry', () => {
    write('notes.md', '# Deploy\nRun the script.');
    write('plain.txt', 'a loose note');
    const index = sync([root], NOW);

    expect(index.entries).toHaveLength(2);
    expect(index.entries.every((e) => e.syncedAt === NOW)).toBe(true);
    expect(index.entries.map((e) => e.source).sort()).toEqual(['notes.md', 'plain.txt']);
  });

  it('walks subfolders and records a readable relative source', () => {
    write('team/onboarding/day-one.md', '# Day one\nGet a laptop.');
    expect(sync([root], NOW).entries[0].source).toBe('team/onboarding/day-one.md');
  });

  it('ignores files it cannot read as prose', () => {
    write('notes.md', '# Keep\nthis');
    write('photo.png', 'binary-ish');
    write('script.js', 'export const x = 1;');
    expect(sync([root], NOW).entries.map((e) => e.source)).toEqual(['notes.md']);
  });

  it('skips dotfolders and node_modules rather than indexing a dependency tree', () => {
    write('notes.md', '# Keep\nthis');
    write('node_modules/pkg/README.md', '# Nope\nnot yours');
    write('.git/COMMIT_EDITMSG', 'nope');
    expect(sync([root], NOW).entries).toHaveLength(1);
  });

  // A path the user typed is the likeliest thing to be wrong, and one bad line
  // should not cost them the rest of their notes.
  it('skips a source that does not exist instead of failing the sync', () => {
    write('notes.md', '# Keep\nthis');
    const index = sync([path.join(root, 'no-such-folder'), root], NOW);
    expect(index.entries).toHaveLength(1);
  });

  // Reported, never hidden: a store that quietly indexed half your notes would
  // answer confidently from the half it had.
  it('caps a source and says how many it left', () => {
    for (let i = 0; i < MAX_PER_SOURCE + 5; i++) write(`n${i}.md`, `# N${i}\nbody`);
    const index = sync([root], NOW);
    expect(index.skipped).toBe(5);
    expect(new Set(index.entries.map((e) => e.source)).size).toBe(MAX_PER_SOURCE);
  });
});

describe('a line carries where it came from', () => {
  // Provenance rides inside the line so the recall tier and the session prompt
  // both get it without either knowing a store exists.
  it('names the file and the date it was read', () => {
    expect(asLine({ text: 'Deploys run on Fridays.', source: 'ops/deploy.md', syncedAt: NOW })).toBe(
      'Deploys run on Fridays. [ops/deploy.md, synced 2026-08-02]',
    );
  });
});

describe('staleness', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-level-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const indexed = (syncedAt: number): void =>
    writeIndex(dir, {
      sources: ['/notes'],
      syncedAt,
      entries: [{ text: 'Deploys run on Fridays.', source: 'ops/deploy.md', syncedAt }],
      skipped: 0,
    });

  it('serves a fresh index', () => {
    indexed(NOW - DAY);
    expect(storeLines(dir, NOW)).toHaveLength(1);
  });

  /**
   * The staleness guard, and the reason it is a single rule in a single place:
   * a stale index contributes *nothing*, so the free tier has nothing to match
   * and the job falls through to a session that can go and look. Serving a
   * stale page for free is the failure D-045 caught the first compiled tool
   * committing, and two copies of this rule would eventually disagree.
   */
  it('contributes nothing at all once it is stale', () => {
    indexed(NOW - STALE_MS - 1);
    expect(storeLines(dir, NOW)).toEqual([]);
  });

  it('has nothing to say before anything is indexed', () => {
    expect(storeLines(dir, NOW)).toEqual([]);
  });

  it('treats a torn index as a missing one rather than crashing', () => {
    writeFileSync(path.join(dir, 'store-index.json'), '{ not json');
    expect(readIndex(dir)).toBeNull();
    expect(storeLines(dir, NOW)).toEqual([]);
  });

  it('measures staleness from when it was synced', () => {
    const index = { sources: [], syncedAt: NOW, entries: [], skipped: 0 };
    expect(isStale(index, NOW + STALE_MS - 1)).toBe(false);
    expect(isStale(index, NOW + STALE_MS + 1)).toBe(true);
  });
});
