import { describe, expect, it } from 'vitest';
import { EXIT_X, MAX_STATIONS, STATION_BASE_X, STATION_SPACING } from '@agentlings/shared';
import { doorBox, OUTLINE_OFFSETS, parcelsBox, stationBox } from './hover';

const GROUND_Y = 258;

describe('OUTLINE_OFFSETS', () => {
  it('covers all eight neighbours exactly once', () => {
    const keys = new Set(OUTLINE_OFFSETS.map(([x, y]) => `${x},${y}`));
    expect(keys.size).toBe(8);
    expect(keys.has('0,0')).toBe(false);
    for (const x of [-1, 0, 1]) {
      for (const y of [-1, 0, 1]) {
        if (x === 0 && y === 0) continue;
        expect(keys.has(`${x},${y}`)).toBe(true);
      }
    }
  });
});

describe('stationBox', () => {
  it('is centred on the slot the signpost is drawn at', () => {
    for (let slot = 0; slot < MAX_STATIONS; slot++) {
      const box = stationBox(slot, GROUND_Y);
      const postX = STATION_BASE_X + slot * STATION_SPACING;
      expect(box.x).toBeLessThan(postX);
      expect(box.x + box.w).toBeGreaterThan(postX);
    }
  });

  it('covers the drawn sign: pennant at the top down to the ground', () => {
    const box = stationBox(0, GROUND_Y);
    // The renderer draws the pennant tip at groundY - 52 and the post to the
    // ground; the box has to contain both or part of the sign is dead to the
    // pointer while still lighting up.
    expect(box.y).toBeLessThanOrEqual(GROUND_Y - 52);
    expect(box.y + box.h).toBeGreaterThanOrEqual(GROUND_Y);
  });

  it('does not overlap its neighbours', () => {
    for (let slot = 0; slot + 1 < MAX_STATIONS; slot++) {
      const left = stationBox(slot, GROUND_Y);
      const right = stationBox(slot + 1, GROUND_Y);
      expect(left.x + left.w).toBeLessThan(right.x);
    }
  });
});

describe('doorBox', () => {
  it('is centred on the exit and sits on the ground', () => {
    const box = doorBox(GROUND_Y);
    expect(box.x + box.w / 2).toBe(EXIT_X);
    expect(box.y + box.h).toBe(GROUND_Y);
  });

  it('is clear of the last station, so the two never fight for the pointer', () => {
    const last = stationBox(MAX_STATIONS - 1, GROUND_Y);
    expect(last.x + last.w).toBeLessThan(doorBox(GROUND_Y).x);
  });
});

describe('parcelsBox', () => {
  it('sits between the last station and the doorway, touching neither', () => {
    const pile = parcelsBox(GROUND_Y);
    const last = stationBox(MAX_STATIONS - 1, GROUND_Y);
    expect(last.x + last.w).toBeLessThan(pile.x);
    expect(pile.x + pile.w).toBeLessThanOrEqual(doorBox(GROUND_Y).x);
  });

  it('contains the drawn pile: glow, four crates, and the count tag', () => {
    const pile = parcelsBox(GROUND_Y);
    // The renderer draws the glow at EXIT_X-64 for 30 wide, crates from
    // EXIT_X-62 up two rows, and the count tag centred at GROUND_Y-38.
    expect(pile.x).toBeLessThanOrEqual(EXIT_X - 64);
    expect(pile.x + pile.w).toBeGreaterThanOrEqual(EXIT_X - 34);
    expect(pile.y).toBeLessThanOrEqual(GROUND_Y - 38 - 5);
    expect(pile.y + pile.h).toBe(GROUND_Y);
  });
});
