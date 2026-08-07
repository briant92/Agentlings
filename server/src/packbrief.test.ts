import { describe, expect, it } from 'vitest';
import {
  MAX_STATIONS,
  slugProblem,
  STATION_BASE_X,
  THEME_SLOTS,
  validateLevelPack,
} from '@agentlings/shared';
import { packBrief } from './packbrief';

const brief = packBrief();

describe('packBrief', () => {
  it('names every slot a pack must define', () => {
    for (const slot of THEME_SLOTS) expect(brief, slot).toContain(slot);
  });

  it('names where the props actually stand', () => {
    expect(brief).toContain(String(STATION_BASE_X));
    expect(brief).toContain(`${MAX_STATIONS} signposts`);
  });

  it('tells the session to write the file the server reads', () => {
    expect(brief).toContain('PACK.json');
  });

  /**
   * The drift that matters. A brief teaching a rule the checker does not
   * enforce sends every run at a wall; a brief omitting one the checker does
   * enforce fails runs for a reason they were never told. So the boundary is
   * asserted from both sides: the number in the prose has to be the number
   * that flips the checker.
   */
  it('states the headroom the checker actually enforces', () => {
    const base = {
      name: 'x',
      provenance: 'x',
      viewH: 450,
      theme: Object.fromEntries(THEME_SLOTS.map((s) => [s, 0])),
      ops: [{ op: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'rock' }],
    };
    const refuses = (groundY: number) =>
      validateLevelPack({ ...base, groundY }).some((p) => p.message.includes('headroom'));

    let boundary = 0;
    for (let y = 1; y < 200; y++) {
      if (!refuses(y)) {
        boundary = y;
        break;
      }
    }
    expect(boundary).toBeGreaterThan(0);
    expect(brief).toContain(`below ${boundary} is refused`);
  });

  it('tells it to set a rim, and not to trust the scrim for legibility', () => {
    expect(brief).toContain('rim');
    expect(brief).toMatch(/scrim/i);
  });

  /**
   * A loop nobody is told about is not a loop. The renderer exists so a
   * session can look at what it drew, and the only way it learns that is
   * here — the same brief that told it about the checker.
   */
  it('tells it to render the pack and look at it, not only to check it', () => {
    expect(brief).toContain('npm run pack:render');
    expect(brief).toMatch(/checking is not seeing|Open it and look/i);
  });

  it('says what the separation numbers mean and what rescues a vanishing gown', () => {
    expect(brief).toMatch(/separation/i);
    expect(brief).toContain('Under 5');
    expect(brief).toContain('rim');
  });

  it('warns what the render cannot show, so a clean picture is not over-read', () => {
    expect(brief).toMatch(/ambient/i);
    expect(brief).toMatch(/signposts|doorway/i);
  });

  /**
   * Five designer runs, four of them cut at the cap, $6.75 absorbed against
   * $0.99 charged — and the packs doubled every time: 46, 78, 204, 413 ops.
   * The turn budget had been climbing too (10 → 12 → 16 → 23), so more turns
   * were only ever buying more ops. The 413 was the worst picture of the four.
   *
   * That is a stopping problem, not a budget problem, so the fix is here and
   * in the role rather than in the cap.
   */
  describe('when to stop', () => {
    it('asks for a complete pack early, not a sketch to expand', () => {
      expect(brief).toMatch(/complete pack rendered and looked at/i);
      expect(brief).toMatch(/halfway/i);
    });

    it('gives the real op counts, including the one that went wrong', () => {
      expect(brief).toContain('46, 78 and 204');
      expect(brief).toContain('413');
      // Whitespace-tolerant: the brief is hard-wrapped, so a phrase can carry
      // a newline in the middle of it.
      expect(brief).toMatch(/best \*picture\*\s+of the three is not the biggest/i);
    });

    it('names a number at which adding stops being improving', () => {
      expect(brief).toMatch(/past roughly 250 ops/i);
    });

    /** Two cut runs in a row delivered a pack and no account of it. */
    it('tells it to reserve turns for the result, and to write it first if short', () => {
      expect(brief).toMatch(/Keep back enough turns/i);
      expect(brief).toMatch(/write the result \*first\*/i);
    });
  });

  describe('given a reference picture', () => {
    const withRef = packBrief([], 'reference.png');

    it('names the file and says to look at it', () => {
      expect(withRef).toContain('input/reference.png');
      expect(withRef).toMatch(/Open it and look at it/i);
    });

    /**
     * The half that stops the run wasting its turns. D-108 settled that the
     * ops vocabulary cannot reproduce a rendered painting at any budget, so a
     * session told to work from a picture has to be told that tracing it is
     * the wrong job — measured at 32 colours destroying the source, and at
     * 128 needing a raster the format has no field for.
     */
    it('says plainly that the picture cannot be reproduced, and what to take instead', () => {
      expect(withRef).toMatch(/cannot reproduce it/i);
      expect(withRef).toMatch(/staging|palette|depth/i);
    });

    it('makes the reference a provenance question, because it is one', () => {
      expect(withRef).toMatch(/name the reference in `provenance`/i);
    });

    /**
     * D-113's other finding: a session handed an image wrote its own PNG
     * decoder inside a sandbox that already contained ours, spending a third
     * of its turns on it. Nothing had told it the capability was there.
     */
    it('points at the decoder the repository already has', () => {
      expect(withRef).toContain('decodePng');
      expect(withRef).toContain('server/src/raster.ts');
    });

    it('says none of it when there is no reference', () => {
      const plain = packBrief([]);
      expect(plain).not.toMatch(/reference/i);
      expect(plain).not.toContain('decodePng');
    });
  });

  it('requires provenance in the same words the checker does', () => {
    expect(brief).toContain('provenance');
    expect(validateLevelPack({}).map((p) => p.message)).toContain(
      'provenance must be a non-empty string',
    );
  });
});

describe('the brief does not answer its own question', () => {
  /**
   * The first real authoring run copied the example's identity wholesale —
   * name "The Pequod", slug "moby-dick" — from a description that said only
   * "a whaling ship". The example was the answer. So the identity fields are
   * placeholders now, and this is the test that keeps them that way.
   */
  it('offers no concrete name or slug to copy', () => {
    expect(brief).toContain('"slug": "<your-slug>"');
    expect(brief).toContain('"name": "<Your World>"');
    expect(brief).not.toContain('moby-dick');
    expect(brief).not.toContain('The Pequod');
  });

  it('says plainly that the examples are format, not defaults', () => {
    expect(brief).toMatch(/never from the examples/i);
  });

  it('names what is already installed, so a taken slug is not a surprise', () => {
    const withTaken = packBrief(['moby-dick', 'arrakis']);
    expect(withTaken).toContain('not available');
    expect(withTaken).toContain('moby-dick');
    expect(withTaken).toContain('arrakis');
    // ...and says nothing about availability when nothing is installed.
    expect(packBrief([])).not.toContain('not available');
  });

  it('rejects the slug it would have chosen, once told', () => {
    expect(slugProblem('moby-dick', ['moby-dick'])).toMatch(/already installed/);
    expect(slugProblem('moby-dick', [])).toBeNull();
    expect(slugProblem('orlop-deck', ['moby-dick'])).toBeNull();
  });
});
