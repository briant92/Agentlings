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
   * D-113's finding: a session handed an image wrote its own PNG decoder
   * inside a sandbox that already contained ours, spending a third of its
   * turns on it. The pointer was scoped to the reference section, and the
   * pattern recurred exactly where that scope missed — the first paid More
   * Time leg measured its own plate with a hand-rolled measure.cjs (D-146).
   * Every authoring brief carries it now.
   */
  it('points at the decoder the repository already has, reference or not', () => {
    expect(brief).toContain('decodePng');
    expect(brief).toContain('server/src/raster.ts');
  });

  /**
   * The packs had doubled every run — 46, 78, 204, 413 ops — while every run
   * was cut at the cap, so I told the brief that past ~250 ops it was
   * elaborating rather than improving. **That was wrong and the re-run proved
   * it**: ops fell to 89, the world came back sparse and blobby, it was cut
   * anyway, and it cost more ($1.77 → $2.36).
   *
   * The error was targeting a proxy. The 413-op world was not bad *because*
   * of its op count; it was bad because its palms marched at an even interval
   * under no light at all. A count correlated with the fault and was not the
   * fault, so the bar bought fewer ops and none of the quality.
   *
   * So the number is gone and what actually separates the good worlds from
   * the bad ones is named instead — and the brief says outright that a count
   * is not a target in either direction, because the run that produced 89 was
   * following an instruction I wrote.
   */
  describe('finishing and improving', () => {
    it('asks for a complete pack early, not a sketch to expand', () => {
      expect(brief).toMatch(/complete pack rendered and looked at/i);
      expect(brief).toMatch(/halfway/i);
    });

    it('names variation and light as what separates them, not size', () => {
      expect(brief).toMatch(/variation and light, never size/i);
      expect(brief).toMatch(/rhythm too even to be alive/i);
      expect(brief).toMatch(/No light/);
    });

    it('sets no op-count target, in either direction', () => {
      expect(brief).not.toMatch(/250 ops/);
      expect(brief).toMatch(/A count is not a target in either direction/i);
      expect(brief).toMatch(/thinner\s+and worse/i);
    });

    /** Three cut runs in a row delivered a pack and no account of it. */
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

    // The decoder pointer deliberately stays (D-146) — only the reference
    // prose must vanish with the reference.
    it('says none of it when there is no reference', () => {
      const plain = packBrief([]);
      expect(plain).not.toMatch(/reference/i);
    });

    /**
     * The laundering wall (D-144): render_plate would happily screenshot a
     * page with the reference embedded as a data: URI, which is someone
     * else's picture with extra steps. The brief has to close that door in
     * the same breath it opens the plate one.
     */
    it('forbids embedding the reference in a plate page', () => {
      expect(withRef).toMatch(/never embed the\s+reference image itself in a plate page/i);
    });
  });

  describe('the plate half (D-142, D-143, D-144)', () => {
    it('teaches plates in the skeleton and the vocabulary, every time', () => {
      expect(brief).toContain('"plates": ["plate.png"]');
      expect(brief).toMatch(/rendered picture \(plates\)/i);
      expect(brief).toContain('render_plate');
      expect(brief).toContain('http://three.local/three.module.js');
      expect(brief).toMatch(/rim\` becomes \*\*required\*\*/i);
    });

    /**
     * D-113's "cannot carry a rendered painting" was true of the ops and is
     * now false of the format; the brief must not still say the old thing.
     */
    it('no longer claims the format cannot carry a rendered picture', () => {
      expect(brief).not.toMatch(/format has no field for/i);
      expect(brief).toMatch(/What the ops cannot paint, a \*\*plate\*\* can carry/i);
    });

    it('names the op discriminant, because a run once guessed "kind" (D-147)', () => {
      expect(brief).toContain('{"op": "rect"');
      expect(brief).toMatch(/there is no other name for that field/i);
    });

    it('leads with the plate when the button asked for one', () => {
      const plated = packBrief([], undefined, true);
      expect(plated).toMatch(/backdrop is a rendered plate — that is the ask/i);
      expect(plated).toMatch(/Render the plate first/i);
      expect(plated).toMatch(/without\s+`backdrop\.plates`\s+does not deliver/i);
      // ...and says none of that lead when nobody asked.
      expect(brief).not.toMatch(/that is the ask/i);
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
