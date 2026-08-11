import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { slugProblem, THEME_SLOTS, type LevelPack } from '@agentlings/shared';
import { checkPackDraft, PACK_FILE, readPackDraft } from './packcontract';
import { installPack, packsDir, scanPacks } from './packs';
import { encodePng, encodePngA } from './raster';

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

describe('plates ride the draft (D-143)', () => {
  /**
   * A draft's plate is a file beside PACK.json at the sandbox root; harvest
   * judges the pair, review shows them, and Approve copies plates before the
   * json so the json stays the commit point. What D-142 refused for want of
   * a copier, this carries.
   */
  const plated = () =>
    pack({ rim: 'rockEdge', backdrop: { plates: ['far.png'] } }) as unknown as LevelPack;
  const PNG = (() => {
    const w = 1000;
    const h = 450;
    const pixels = new Uint8ClampedArray(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      pixels[i * 3] = 0x0a;
      pixels[i * 3 + 1] = 0x0a;
      pixels[i * 3 + 2] = 0x12;
    }
    return encodePng({ pixels, w, h });
  })();

  let sandbox: string;
  beforeEach(() => {
    sandbox = path.join(root, 'sandbox');
    mkdirSync(sandbox, { recursive: true });
  });

  it('reads a draft whose plate sits beside it', () => {
    writeFileSync(path.join(sandbox, PACK_FILE), JSON.stringify({ slug: 'amber', pack: plated() }));
    writeFileSync(path.join(sandbox, 'far.png'), PNG);
    const read = readPackDraft(sandbox);
    expect(read?.error).toBeUndefined();
    expect(read?.draft?.pack.backdrop?.plates).toEqual(['far.png']);
  });

  it('fails the draft at harvest, by name, when the plate is not there', () => {
    writeFileSync(path.join(sandbox, PACK_FILE), JSON.stringify({ slug: 'amber', pack: plated() }));
    expect(readPackDraft(sandbox)?.error).toMatch(/"far\.png" is not in the pack folder/);
  });

  it('Approve copies the plate with the json, and the scan accepts the result', () => {
    writeFileSync(path.join(sandbox, 'far.png'), PNG);
    const result = installPack(root, { slug: 'amber', pack: plated() }, sandbox);
    expect(result).toEqual({ installed: true, already: false });
    expect(existsSync(path.join(packsDir(root), 'amber', 'far.png'))).toBe(true);
    const scan = scanPacks(root);
    expect(scan.rejected).toEqual([]);
    expect(scan.installed.map((p) => p.slug)).toEqual(['amber']);
  });

  it('a second Approve completes a half-landed install rather than refusing', () => {
    writeFileSync(path.join(sandbox, 'far.png'), PNG);
    installPack(root, { slug: 'amber', pack: plated() }, sandbox);
    rmSync(path.join(packsDir(root), 'amber', 'far.png'));
    const again = installPack(root, { slug: 'amber', pack: plated() }, sandbox);
    expect(again).toEqual({ installed: true, already: true });
    expect(existsSync(path.join(packsDir(root), 'amber', 'far.png'))).toBe(true);
  });

  it('refuses at Approve when the sandbox no longer holds a good plate', () => {
    writeFileSync(path.join(sandbox, 'far.png'), 'gone wrong');
    const result = installPack(root, { slug: 'amber', pack: plated() }, sandbox);
    expect('error' in result && result.error).toMatch(/did not decode/);
  });

  it('refuses a plated pack given nowhere to copy from', () => {
    const result = installPack(root, { slug: 'amber', pack: plated() });
    expect('error' in result && result.error).toMatch(/nowhere to copy/);
  });
});

describe('the v2 shape rules', () => {
  const plated = (backdrop: Record<string, unknown>, over: Record<string, unknown> = {}) =>
    checkPackDraft(draft({ pack: pack({ rim: 'rockEdge', backdrop, ...over }) as never }));

  it('caps the stack at three plates', () => {
    const bad = plated({ plates: ['a.png', 'b.png', 'c.png', 'd.png'] });
    expect(bad.error).toMatch(/at most 3/);
  });

  it('refuses a duplicate plate entry', () => {
    expect(plated({ plates: ['a.png', 'a.png'] }).error).toMatch(/same file twice/);
  });

  it('accepts an occlusion strip, but not one reusing a plate file', () => {
    expect(plated({ plates: ['a.png'], occlusion: 'near.png' }).error).toBeUndefined();
    expect(plated({ plates: ['a.png'], occlusion: 'a.png' }).error).toMatch(/its own cut-out/);
  });

  it('demands the rim for an occlusion strip even with no plates', () => {
    const bad = checkPackDraft(
      draft({ pack: pack({ backdrop: { occlusion: 'near.png' } }) as never }),
    );
    expect(bad.error).toMatch(/needs the rim/);
  });

  it('holds plateloop to its own fields', () => {
    const loop = (fx: Record<string, unknown>) =>
      plated({ plates: ['a.png'] }, { ambient: [{ fx: 'plateloop', ...fx }] });
    expect(
      loop({ file: 'falls.png', x: 0, y: 0, w: 10, h: 10, dx: 0, dy: 12 }).error,
    ).toBeUndefined();
    expect(loop({ file: '../x.png', x: 0, y: 0, w: 10, h: 10, dx: 0, dy: 12 }).error).toMatch(
      /plain \.png filename/,
    );
    expect(loop({ file: 'falls.png', x: 0, y: 0, w: 10, h: 10, dy: 12 }).error).toMatch(
      /finite number "dx"/,
    );
    expect(loop({ file: 'falls.png', x: 0, y: 0, w: 10, h: 10, dx: 0, dy: 0 }).error).toMatch(
      /scrolls nowhere/,
    );
  });
});

describe('the install copies every raster the pack references (v2)', () => {
  it('carries the occlusion strip and the plate-life tiles with the plates', () => {
    const sandbox = path.join(root, 'sandbox-v2');
    mkdirSync(sandbox, { recursive: true });
    const dark = () => {
      const pixels = new Uint8ClampedArray(1000 * 450 * 3);
      for (let i = 0; i < 1000 * 450; i++) {
        pixels[i * 3] = 0x0a;
        pixels[i * 3 + 1] = 0x0a;
        pixels[i * 3 + 2] = 0x12;
      }
      return encodePng({ pixels, w: 1000, h: 450 });
    };
    const strip = () => {
      const pixels = new Uint8ClampedArray(1000 * 450 * 4);
      // Opaque only in the top-left corner, clear of furniture and crew.
      for (let y = 0; y < 60; y++) {
        for (let x = 0; x < 40; x++) {
          const i = (y * 1000 + x) * 4;
          pixels[i + 2] = 0x0a;
          pixels[i + 3] = 255;
        }
      }
      return encodePngA({ pixels, w: 1000, h: 450 });
    };
    const tile = () => {
      const pixels = new Uint8ClampedArray(16 * 16 * 3).fill(0x22);
      return encodePng({ pixels, w: 16, h: 16 });
    };
    writeFileSync(path.join(sandbox, 'far.png'), dark());
    writeFileSync(path.join(sandbox, 'near.png'), strip());
    writeFileSync(path.join(sandbox, 'falls.png'), tile());

    const full = pack({
      rim: 'rockEdge',
      backdrop: { plates: ['far.png'], occlusion: 'near.png' },
      ambient: [{ fx: 'plateloop', file: 'falls.png', x: 100, y: 100, w: 16, h: 16, dx: 0, dy: 8 }],
    }) as unknown as LevelPack;

    const result = installPack(root, { slug: 'odyssey', pack: full }, sandbox);
    expect(result).toEqual({ installed: true, already: false });
    for (const name of ['far.png', 'near.png', 'falls.png']) {
      expect(existsSync(path.join(packsDir(root), 'odyssey', name)), name).toBe(true);
    }
    const scan = scanPacks(root);
    expect(scan.rejected).toEqual([]);
    expect(scan.installed.map((p) => p.slug)).toEqual(['odyssey']);
  });
});
