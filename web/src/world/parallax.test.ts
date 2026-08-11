import { describe, expect, it } from 'vitest';
import {
  cameraTarget,
  DEPTH_SCALE,
  DRIFT_BUDGET,
  DRIFT_MAX,
  IDLE_AMPLITUDE,
  layerOffset,
  layerOffsetRaw,
  occlusionRate,
  planeFor,
  plateRate,
} from './parallax';

describe('planeFor', () => {
  it('reads world width and overscan off the natural size, at 1× and 2×', () => {
    expect(planeFor(1000, 450, 450)).toEqual({ worldW: 1000, overscan: false });
    expect(planeFor(1060, 450, 450)).toEqual({ worldW: 1060, overscan: true });
    expect(planeFor(2000, 900, 450)).toEqual({ worldW: 1000, overscan: false });
    expect(planeFor(2120, 900, 450)).toEqual({ worldW: 1060, overscan: true });
  });
});

describe('the rates', () => {
  it('gives the farthest plate the most, decaying toward the sprites', () => {
    const far = plateRate(0, true);
    const mid = plateRate(1, true);
    const near = plateRate(2, true);
    expect(far).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(0);
  });

  it('pins any plate without overscan — every v1 pack keeps holding still', () => {
    expect(plateRate(0, false)).toBe(0);
    expect(occlusionRate(false)).toBe(0);
  });

  it('runs the occlusion strip against the pan, harder than any plate', () => {
    expect(occlusionRate(true)).toBeLessThan(0);
    expect(Math.abs(occlusionRate(true))).toBeGreaterThan(plateRate(0, true));
  });
});

describe('cameraTarget', () => {
  it('follows the pointer, clamped to the deflection range', () => {
    expect(cameraTarget(0, 0)).toBe(0);
    expect(cameraTarget(1, 0)).toBe(DRIFT_BUDGET);
    expect(cameraTarget(-1, 0)).toBe(-DRIFT_BUDGET);
    expect(cameraTarget(5, 0)).toBe(DRIFT_BUDGET);
  });

  it('breathes on its own when the pointer is away, inside the idle amplitude', () => {
    for (const t of [0, 3, 7, 13, 19, 25]) {
      expect(Math.abs(cameraTarget(null, t))).toBeLessThanOrEqual(IDLE_AMPLITUDE);
    }
    // It actually moves — a dead idle would be the declined still world.
    const values = [0, 3, 7, 13].map((t) => cameraTarget(null, t));
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThan(1);
  });
});

describe('layerOffset', () => {
  it('steps in whole pixels', () => {
    expect(Number.isInteger(layerOffset(0.55, 7.3))).toBe(true);
  });

  it('scales by the rate, opposite for the strip', () => {
    expect(layerOffset(1, 20)).toBe(20);
    expect(layerOffset(0.55, 20)).toBe(11);
    expect(layerOffset(-1.4, 20)).toBe(-28);
  });

  it('never exceeds the overscan margin, the checker clearance contract', () => {
    expect(layerOffset(-1.4, DRIFT_BUDGET * 2)).toBe(-DRIFT_MAX);
    expect(layerOffset(3, 1000)).toBe(DRIFT_MAX);
  });

  it('is dead still at rate 0 whatever the camera does', () => {
    expect(layerOffset(0, 999)).toBe(0);
  });
});

describe('the smooth medium (D-151)', () => {
  it('layerOffsetRaw keeps the sub-pixel and the clamp', () => {
    expect(layerOffsetRaw(0.55, 7.3)).toBeCloseTo(4.015, 3);
    expect(layerOffsetRaw(3, 1000)).toBe(DRIFT_MAX);
    expect(layerOffsetRaw(-1.4, DRIFT_BUDGET * 2)).toBe(-DRIFT_MAX);
  });

  it('the rounded offset is the raw one rounded — one law, two media', () => {
    for (const [rate, camera] of [
      [1, 13.7],
      [0.55, -9.2],
      [-1.4, 18],
    ]) {
      expect(layerOffset(rate, camera)).toBe(Math.round(layerOffsetRaw(rate, camera)));
    }
  });

  it('displacement at full pointer stays well inside the drift bound', () => {
    expect(DEPTH_SCALE * DRIFT_BUDGET).toBeLessThanOrEqual(DRIFT_MAX);
    expect(DEPTH_SCALE * DRIFT_BUDGET).toBeGreaterThan(0);
  });
});
