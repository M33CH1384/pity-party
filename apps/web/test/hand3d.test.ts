/** V10c: the 3D hand mirror + fan maths + face texture budget. */
import { describe, expect, it } from 'vitest';
import { parseCardText } from '../src/three3d/handMirror';
import { fanStep, fanTilt, solveFan } from '../src/three3d/HandFan';
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
  it('hand-v2: 14° a card for ≤ 5, 9.5° for 7, symmetric, outer cards within ±30°', () => {
    expect(fanTilt(0, 1)).toBe(0); expect(fanStep(5)).toBe(14); expect(fanStep(7)).toBeCloseTo(9.5);
    for (const n of [2, 5, 7, 9, 12]) { expect(fanTilt(0, n)).toBeCloseTo(-fanTilt(n - 1, n)); expect(Math.abs(fanTilt(0, n))).toBeLessThanOrEqual(30.01); }
  });
  it('the solved pose gives each DOM tap target the drawn card: roll .66 × arc, portrait card 31% vw, centred fan', () => {
    const W = 393, H = 852, vh = 1, vw = vh * W / H;
    const p = solveFan(5, W, H, vw, vh, 64);
    expect(p[0]!.w).toBeCloseTo(0.31 * W, 0);
    expect(p[2]!.cx).toBeCloseTo(W / 2, 0);
    expect(p[0]!.deg).toBeCloseTo(0.66 * fanTilt(0, 5), 1);
    expect(p[0]!.cx).toBeCloseTo(W - p[4]!.cx, 0);
    // every card's tap target is the full card (≥ 60 px wide), and neighbours' visible strips stay ≥ 44 px apart at the centres
    for (let i = 1; i < 5; i++) { expect(p[i]!.w).toBeGreaterThanOrEqual(60); expect(Math.hypot(p[i]!.cx - p[i - 1]!.cx, p[i]!.cy - p[i - 1]!.cy)).toBeGreaterThanOrEqual(44); }
  });
});

describe('face textures', () => {
  it('256×358 faces; the resident budget holds a full hand + table and stays far under 54 faces', () => {
    expect([TEX_W, TEX_H]).toEqual([256, 358]);
    expect(FACE_BUDGET_BYTES / FACE_BYTES).toBeGreaterThanOrEqual(10);
    expect(FACE_BUDGET_BYTES).toBeLessThan(54 * FACE_BYTES / 4);
  });
});
