import { describe, expect, it } from 'vitest';
import { MAX_STATIONS, STATION_BASE_X, THEME_SLOTS, validateLevelPack } from '@agentlings/shared';
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

  it('requires provenance in the same words the checker does', () => {
    expect(brief).toContain('provenance');
    expect(validateLevelPack({}).map((p) => p.message)).toContain(
      'provenance must be a non-empty string',
    );
  });
});
