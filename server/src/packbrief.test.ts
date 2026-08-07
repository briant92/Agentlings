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
