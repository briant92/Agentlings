import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { slugProblem, THEME_SLOTS, type LevelPack } from '@agentlings/shared';
import { checkPackDraft, PACK_FILE, readPackDraft } from './packcontract';
import { installPack, packsDir, scanPacks } from './packs';

const theme = Object.fromEntries(THEME_SLOTS.map((s) => [s, 0x112233]));

function pack(over: Record<string, unknown> = {}) {
  return {
    name: 'The Pequod',
    provenance: 'authored by the crew',
    viewH: 450,
    groundY: 388,
    theme,
    ops: [{ op: 'rect', x: 0, y: 'groundY', w: 'worldWidth', h: 62, color: 'wood' }],
    ...over,
  };
}
const draft = (over: Record<string, unknown> = {}) => ({
  slug: 'moby-dick',
  pack: pack() as unknown as LevelPack,
  ...over,
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'agentlings-m4-'));
  mkdirSync(packsDir(root), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('slugProblem', () => {
  it('accepts lower-case hyphenated words', () => {
    for (const ok of ['moby-dick', 'dune', 'a', 'nineteen-eighty-four']) {
      expect(slugProblem(ok), ok).toBeNull();
    }
  });

  // The slug becomes a directory name, so this is a boundary, not tidiness:
  // anything with a separator would let a sandbox choose where Approve writes.
  it('refuses anything that could escape the packs folder', () => {
    for (const bad of [
      '../../etc',
      'a/b',
      'a\\b',
      'C:packs',
      './x',
      '..',
      'with space',
      'UPPER',
      'trailing-',
    ]) {
      expect(slugProblem(bad), bad).toMatch(/lower-case words|required/);
    }
  });

  it('refuses a missing slug and a built-in name', () => {
    expect(slugProblem(undefined)).toMatch(/required/);
    expect(slugProblem('')).toMatch(/required/);
    expect(slugProblem('cave')).toMatch(/built-in theme/);
  });
});

describe('checkPackDraft', () => {
  it('accepts a whole draft', () => {
    expect(checkPackDraft(draft()).draft?.slug).toBe('moby-dick');
  });

  it('names what is wrong rather than reading as no pack', () => {
    expect(checkPackDraft(null).error).toMatch(/JSON object/);
    expect(checkPackDraft({ slug: 'x' }).error).toMatch(/"pack" is required/);
    expect(checkPackDraft({ pack: pack() }).error).toMatch(/"slug" is required/);
  });

  // One checker: a pack Approve installs cannot be one the loader then refuses.
  it('holds the pack to exactly the checker the loader uses', () => {
    const bad = checkPackDraft(draft({ pack: pack({ provenance: '', ops: [] }) }));
    expect(bad.error).toContain('provenance must be a non-empty string');
    expect(bad.error).toContain('ops is missing or empty');
  });
});

describe('readPackDraft', () => {
  it('is absent, not an error, when a run wrote no pack', () => {
    expect(readPackDraft(root)).toBeNull();
  });

  it('reports unparseable JSON rather than dropping it', () => {
    writeFileSync(path.join(root, PACK_FILE), '{ not json');
    expect(readPackDraft(root)?.error).toBe('not valid JSON');
  });

  it('reads a good one back', () => {
    writeFileSync(path.join(root, PACK_FILE), JSON.stringify(draft()));
    expect(readPackDraft(root)?.draft?.pack.name).toBe('The Pequod');
  });
});

describe('installPack', () => {
  it('writes the pack where the loader will find it', () => {
    expect(installPack(root, draft())).toEqual({ installed: true, already: false });
    const { installed } = scanPacks(root);
    expect(installed.map((p) => p.slug)).toEqual(['moby-dick']);
    expect(installed[0].pack.name).toBe('The Pequod');
  });

  // The outbox rule, applied here: a retry must not be blocked by the work the
  // first attempt already did, and must not do it twice.
  it('is safe to approve twice', () => {
    installPack(root, draft());
    expect(installPack(root, draft())).toEqual({ installed: true, already: true });
    expect(scanPacks(root).installed).toHaveLength(1);
  });

  it('refuses to overwrite a different pack, and leaves it alone', () => {
    installPack(root, draft());
    const before = readFileSync(path.join(packsDir(root), 'moby-dick', 'pack.json'), 'utf8');
    const result = installPack(root, draft({ pack: pack({ name: 'Something Else' }) }));
    expect('error' in result && result.error).toMatch(/"moby-dick" already belongs/);
    expect(readFileSync(path.join(packsDir(root), 'moby-dick', 'pack.json'), 'utf8')).toBe(before);
  });

  it('refuses a built-in name even if the contract were bypassed', () => {
    const result = installPack(root, { slug: 'cave', pack: pack() as never });
    expect('error' in result && result.error).toMatch(/built-in theme/);
    expect(existsSync(path.join(packsDir(root), 'cave'))).toBe(false);
  });

  // The whole loop: what a session writes is what the app then loads.
  it('installs something the loader accepts with no errors', () => {
    writeFileSync(path.join(root, PACK_FILE), JSON.stringify(draft()));
    const read = readPackDraft(root);
    expect(read?.error).toBeUndefined();
    installPack(root, read!.draft!);
    const { installed, rejected } = scanPacks(root);
    expect(rejected).toEqual([]);
    expect(installed[0].pack.viewH).toBe(450);
  });
});

describe('renaming a pack out of a collision', () => {
  /**
   * The dead end this closes: the first real authoring run produced a good
   * pack whose slug was taken, and the only move the review offered was
   * discard. Installing the same pack under another name has to work, and has
   * to leave the world already there untouched.
   */
  it('installs the same pack beside the one holding its name', () => {
    installPack(root, draft());
    const renamed = { ...draft(), slug: 'orlop-deck' };
    expect(installPack(root, renamed)).toEqual({ installed: true, already: false });

    const { installed, rejected } = scanPacks(root);
    expect(rejected).toEqual([]);
    expect(installed.map((p) => p.slug).sort()).toEqual(['moby-dick', 'orlop-deck']);
  });

  it('names the world in the way, not the folder', () => {
    installPack(root, draft());
    const other = installPack(root, draft({ pack: pack({ name: 'Something Else' }) }));
    // The reviewer has seen "The Pequod" on the palette and has never seen
    // "moby-dick" anywhere, so that is the name the refusal has to use.
    expect('error' in other && other.error).toContain('The Pequod');
    expect('error' in other && other.error).not.toContain('web/public/packs');
  });

  it('still refuses a rename that is itself illegal', () => {
    expect(slugProblem('../../etc', [])).toMatch(/lower-case words/);
    expect(slugProblem('cave', [])).toMatch(/built-in theme/);
  });
});
