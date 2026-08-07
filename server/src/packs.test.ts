import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_SLOTS } from '@agentlings/shared';
import { packsDir, scanPacks, themeExists } from './packs';

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

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'agentlings-packs-'));
  mkdirSync(packsDir(root), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function install(slug: string, contents: unknown | string): void {
  const dir = path.join(packsDir(root), slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'pack.json'),
    typeof contents === 'string' ? contents : JSON.stringify(contents),
  );
}

describe('scanPacks', () => {
  it('finds nothing, and does not mind, when the folder does not exist', () => {
    expect(scanPacks(mkdtempSync(path.join(tmpdir(), 'agentlings-empty-')))).toEqual({
      installed: [],
      rejected: [],
    });
  });

  it('installs a pack that checks out, under its folder name', () => {
    install('moby-dick', pack());
    const { installed, rejected } = scanPacks(root);
    expect(rejected).toEqual([]);
    expect(installed.map((p) => p.slug)).toEqual(['moby-dick']);
    expect(installed[0].pack.name).toBe('The Pequod');
  });

  // A bad pack degrades the one world it was for. Everything else must load.
  it('keeps the good packs when one is broken', () => {
    install('moby-dick', pack());
    install('dune', pack({ provenance: '' }));
    const { installed, rejected } = scanPacks(root);
    expect(installed.map((p) => p.slug)).toEqual(['moby-dick']);
    expect(rejected.map((r) => r.slug)).toEqual(['dune']);
    expect(rejected[0].problems[0].message).toContain('provenance');
  });

  it('refuses a pack named after a built-in, which slug would otherwise win', () => {
    install('cave', pack());
    const { installed, rejected } = scanPacks(root);
    expect(installed).toEqual([]);
    expect(rejected[0].problems[0].message).toContain('built-in theme');
  });

  it('says what is wrong rather than skipping in silence', () => {
    mkdirSync(path.join(packsDir(root), 'empty-folder'), { recursive: true });
    install('not-json', '{ this is not json');
    const { rejected } = scanPacks(root);
    expect(rejected.find((r) => r.slug === 'empty-folder')?.problems[0].message).toBe(
      'no pack.json in the folder',
    );
    expect(rejected.find((r) => r.slug === 'not-json')?.problems[0].message).toContain(
      'not valid JSON',
    );
  });

  it('carries the checker’s own reasons through', () => {
    install('bad-colour', pack({ ops: [{ op: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'sky' }] }));
    const { rejected } = scanPacks(root);
    expect(rejected[0].problems.map((p) => p.message)).toEqual([
      'ops[0].color paints with "sky", which this pack\'s theme does not define',
    ]);
  });
});

describe('themeExists', () => {
  it('accepts every built-in', () => {
    for (const key of ['cave', 'chalkboard', 'household', 'marble']) {
      expect(themeExists(root, key), key).toBe(true);
    }
  });

  it('accepts an installed pack and refuses a rejected one', () => {
    install('moby-dick', pack());
    install('dune', pack({ ops: [] }));
    expect(themeExists(root, 'moby-dick')).toBe(true);
    expect(themeExists(root, 'dune')).toBe(false);
  });

  it('refuses a look nothing supplies', () => {
    expect(themeExists(root, 'atlantis')).toBe(false);
  });
});
