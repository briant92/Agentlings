import { describe, expect, it } from 'vitest';
import { AGENTLING_PACK, validatePack } from '@agentlings/shared';

function atlas(over: Record<string, unknown> = {}) {
  return {
    frames: {
      a: { frame: { x: 0, y: 0, w: 18, h: 20 } },
      b: { frame: { x: 18, y: 0, w: 18, h: 20 } },
    },
    animations: { walk: ['a', 'b'], work: ['a'], deliver: ['b'] },
    meta: { image: 'agentling.png', size: { w: 36, h: 20 } },
    ...over,
  };
}

const errors = (a: unknown) =>
  validatePack(a, AGENTLING_PACK).filter((p) => p.level === 'error').map((p) => p.message);
const warnings = (a: unknown) =>
  validatePack(a, AGENTLING_PACK).filter((p) => p.level === 'warning').map((p) => p.message);

describe('validatePack', () => {
  it('passes a well-formed pack with nothing to say', () => {
    expect(validatePack(atlas(), AGENTLING_PACK)).toEqual([]);
  });

  it('rejects something that is not an atlas at all', () => {
    expect(errors(null)).toHaveLength(1);
    expect(errors('nope')).toHaveLength(1);
    expect(errors({})[0]).toMatch(/no frames/);
  });

  it('refuses a pack missing a cycle the app asks for', () => {
    const { deliver, ...rest } = atlas().animations;
    expect(errors(atlas({ animations: rest }))[0]).toMatch(/deliver/);
  });

  it('refuses a cycle pointing at a frame that does not exist', () => {
    expect(errors(atlas({ animations: { walk: ['ghost'], work: ['a'], deliver: ['b'] } }))[0]).toMatch(
      /"ghost"/,
    );
  });

  it('refuses frames of differing sizes — the world anchors by the feet', () => {
    const ragged = atlas({
      frames: {
        a: { frame: { x: 0, y: 0, w: 18, h: 20 } },
        b: { frame: { x: 18, y: 0, w: 18, h: 24 } },
      },
    });
    expect(errors(ragged)[0]).toMatch(/every frame must be 18x20/);
  });

  it('refuses a frame that falls off the sheet', () => {
    const off = atlas({ meta: { image: 'x.png', size: { w: 20, h: 20 } } });
    expect(errors(off).some((m) => /outside the 20x20 sheet/.test(m))).toBe(true);
  });

  it('refuses an atlas that does not name its image', () => {
    expect(errors(atlas({ meta: { size: { w: 36, h: 20 } } }))[0]).toMatch(/meta.image/);
  });

  it('refuses a pack with no animations, since frames get reused', () => {
    const { animations, ...rest } = atlas();
    expect(errors(rest)[0]).toMatch(/no animations/);
  });

  // A different resolution is a feature, not a fault: the world scales to it.
  it('allows another resolution, but says so', () => {
    const big = atlas({
      frames: {
        a: { frame: { x: 0, y: 0, w: 36, h: 40 } },
        b: { frame: { x: 36, y: 0, w: 36, h: 40 } },
      },
      meta: { image: 'x.png', size: { w: 72, h: 40 } },
    });
    expect(errors(big)).toEqual([]);
    expect(warnings(big)[0]).toMatch(/36x40/);
  });

  it('mentions frames no cycle ever uses', () => {
    const spare = atlas({
      frames: {
        a: { frame: { x: 0, y: 0, w: 18, h: 20 } },
        b: { frame: { x: 18, y: 0, w: 18, h: 20 } },
        unused: { frame: { x: 0, y: 0, w: 18, h: 20 } },
      },
    });
    expect(errors(spare)).toEqual([]);
    expect(warnings(spare)[0]).toMatch(/never used/);
  });
});
