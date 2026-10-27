/** V10c: the 3D hand mirror + fan maths + face texture budget. */
import { describe, expect, it } from 'vitest';
import { parseCardText } from '../src/three3d/handMirror';
import { fanTilt } from '../src/three3d/HandFan';
import { FACE_BUDGET_BYTES, FACE_BYTES, TEX_H, TEX_W } from '../src/three3d/cardTextures';
import { cardText } from '../src/modes/views';

describe('parseCardText round-trips the DOM card text', () => {
  it('every rank × suit and the joker', () => {
    for (const suit of ['S', 'H', 'D', 'C'] as const) for (let rank = 1; rank <= 13; rank++) {
      expect(parseCardText(cardText({ id: 'x', rank, suit } as never))).toEqual({ rank, suit });
    }
    expect(parseCardText('JK')).toEqual({ rank: 0, suit: null });
  });
  it('rejects anything else (only real cards ever get a face)', () => {
    for (const t of ['', '?', '1♠', '14♥', 'A', '♣', 'back']) expect(parseCardText(t)).toBeNull();
  });
});

describe('fan', () => {
  it('is symmetric and capped at ±6°', () => {
    expect(fanTilt(0, 1)).toBe(0);
    for (const n of [2, 5, 7, 9, 12]) { expect(fanTilt(0, n)).toBeCloseTo(-fanTilt(n - 1, n)); expect(Math.abs(fanTilt(0, n))).toBeLessThanOrEqual(6.01); }
  });
});

describe('face textures', () => {
  it('256×358 faces; the resident budget holds a full hand + table and stays far under 54 faces', () => {
    expect([TEX_W, TEX_H]).toEqual([256, 358]);
    expect(FACE_BUDGET_BYTES / FACE_BYTES).toBeGreaterThanOrEqual(10);
    expect(FACE_BUDGET_BYTES).toBeLessThan(54 * FACE_BYTES / 4);
  });
});
