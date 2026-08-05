import { describe, expect, it } from 'vitest';
import { anchorPoint, clampBubbleX } from './anchor';

describe('anchorPoint', () => {
  it('maps a world point through the canvas scale and its page offset', () => {
    // A 1000-unit world drawn 500px wide, sitting at (100, 40) on the page:
    // half scale, so world 380 lands at 100 + 190.
    const p = anchorPoint(380, 200, { left: 100, top: 40, width: 500 }, 1000);
    expect(p).toEqual({ x: 290, y: 140 });
  });

  it('is the identity mapping at scale 1 and zero offset', () => {
    expect(anchorPoint(123, 45, { left: 0, top: 0, width: 1000 }, 1000)).toEqual({ x: 123, y: 45 });
  });
});

describe('clampBubbleX', () => {
  it('leaves a centred anchor alone', () => {
    expect(clampBubbleX(500, 400, 1200)).toBe(500);
  });

  it('pins the box inside both edges, margins included', () => {
    expect(clampBubbleX(30, 400, 1200)).toBe(208); // 8 + 200
    expect(clampBubbleX(1190, 400, 1200)).toBe(992); // 1200 - 8 - 200
  });

  it('a viewport narrower than the box pins left rather than oscillating', () => {
    expect(clampBubbleX(150, 400, 300)).toBe(208);
    expect(clampBubbleX(10, 400, 300)).toBe(208);
  });
});
