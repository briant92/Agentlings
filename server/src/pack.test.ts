import { describe, expect, it } from 'vitest';
import {
  AGENTLING_PACK,
  THEME_SLOTS,
  validateLevelPack,
  validatePack,
} from '@agentlings/shared';

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

describe('validateLevelPack', () => {
  const theme = Object.fromEntries(THEME_SLOTS.map((s) => [s, 0x112233]));

  function pack(over: Record<string, unknown> = {}) {
    return {
      name: 'The Pequod',
      provenance: 'scene authored by crew, job 8f2a — no third-party art',
      viewH: 450,
      groundY: 388,
      theme,
      ops: [{ op: 'rect', x: 0, y: 'groundY', w: 'worldWidth', h: 62, color: 'wood' }],
      ...over,
    };
  }
  const bad = (p: unknown) =>
    validateLevelPack(p).filter((x) => x.level === 'error').map((x) => x.message);

  it('accepts a whole pack', () => {
    expect(validateLevelPack(pack())).toEqual([]);
  });

  it('insists on provenance, because the licence becomes this repo’s problem', () => {
    expect(bad(pack({ provenance: '   ' }))).toEqual(['provenance must be a non-empty string']);
  });

  it('insists on every slot the renderer will ask for', () => {
    const { hover: _drop, ...missing } = theme;
    expect(bad(pack({ theme: missing }))).toEqual([
      'theme.hover is missing; a pack must define every slot the renderer asks for',
    ]);
  });

  it('refuses a colour outside the range a colour can be', () => {
    expect(bad(pack({ theme: { ...theme, void: 0x1000000 } }))).toEqual([
      'theme.void must be a colour between 0x000000 and 0xffffff',
    ]);
  });

  // The check worth having: an unknown slot reaches the renderer as a throw at
  // draw time, i.e. a level that will not open. Here it names the op.
  it('catches a colour the theme does not define, however deeply nested', () => {
    const deep = pack({
      ops: [
        {
          op: 'repeat',
          at: [100, 200],
          of: [
            {
              op: 'band',
              from: 0,
              to: 30,
              step: 10,
              of: [{ op: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'sky' }],
            },
          ],
        },
      ],
    });
    expect(bad(deep)).toEqual([
      'ops[0].of[0].of[0].color paints with "sky", which this pack\'s theme does not define',
    ]);
  });

  it('checks the colours hanging off a ceiling, and inside a scrim and a rim', () => {
    expect(
      bad(
        pack({
          rim: 'nope',
          backdrop: { scrim: { color: 'alsoNope', alpha: 0.4, from: 200 } },
          ops: [
            {
              op: 'ceiling',
              step: 60,
              minY: 50,
              maxY: 84,
              fill: 'rock',
              edge: 'rockEdge',
              hang: { spike: { chance: 0.3, below: 66, color: 'rock', tip: 'stillNope' } },
            },
          ],
        }),
      ),
    ).toEqual([
      'ops[0].hang.spike.tip paints with "stillNope", which this pack\'s theme does not define',
      'backdrop.scrim.color paints with "alsoNope", which this pack\'s theme does not define',
      'rim paints with "nope", which this pack\'s theme does not define',
    ]);
  });

  it('refuses a coordinate the renderer could not resolve', () => {
    expect(bad(pack({ ops: [{ op: 'rect', x: 0, y: 'cellarY-10', w: 1, h: 1, color: 'rock' }] })))
      .toEqual(['ops[0].y: unknown anchor "cellarY"']);
    expect(bad(pack({ ops: [{ op: 'rect', x: 0, y: 'groundY*2', w: 1, h: 1, color: 'rock' }] })))
      .toEqual(['ops[0].y: bad coordinate "groundY*2"']);
  });

  // The doorway is drawn at groundY - 58, so a shallower ground line puts a
  // level's own exit off the top of the world.
  it('refuses a ground line with no headroom for the doorway', () => {
    expect(bad(pack({ viewH: 100, groundY: 40 }))).toEqual([
      'groundY 40 leaves no headroom; the doorway alone needs 58',
    ]);
  });

  it('refuses a ground line below the floor of the world', () => {
    expect(bad(pack({ viewH: 320, groundY: 320 }))).toContain(
      'groundY 320 must sit above viewH 320',
    );
  });

  it('refuses a pack with nothing in the foreground', () => {
    expect(bad(pack({ ops: [] }))).toEqual([
      'ops is missing or empty — a pack with no foreground draws nothing',
    ]);
  });

  // The raster plate, shape half (D-142). The folder half — existence, size,
  // colour budget — lives in server/plates and is tested there.
  describe('backdrop plates', () => {
    const withPlates = (plates: unknown, over: Record<string, unknown> = {}) =>
      pack({ rim: 'rockEdge', backdrop: { plates }, ...over });

    it('accepts one plainly-named plate on a pack that sets its rim', () => {
      expect(bad(withPlates(['far.png']))).toEqual([]);
    });

    it('refuses more than one plate — v1 draws exactly one', () => {
      expect(bad(withPlates(['a.png', 'b.png']))[0]).toMatch(/v1 draws exactly one/);
    });

    it('refuses an empty plates array rather than treating it as none', () => {
      expect(bad(withPlates([]))[0]).toMatch(/non-empty array/);
    });

    // The filename is joined to the pack directory, so it is a boundary the
    // same way the slug is: nothing that could name a path may pass.
    it('refuses names that reach for a path or another format', () => {
      for (const evil of ['../escape.png', 'a/b.png', 'a\\b.png', '.hidden.png', 'plate.jpg']) {
        expect(bad(withPlates([evil]))[0]).toMatch(/plain \.png filename/);
      }
    });

    it('insists on the rim: the one device that survives a picture', () => {
      expect(bad(pack({ backdrop: { plates: ['far.png'] } }))[0]).toMatch(/needs the rim/);
    });
  });

});
