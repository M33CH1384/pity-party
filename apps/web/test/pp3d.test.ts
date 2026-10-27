// V10d: Pitty Pat felt layout (V10-3D-SPEC §3/§4) and the table-face texture budget
import { describe, expect, it } from 'vitest';
import { CARD_SCALE, opponents, pairX, PAIR_DX, ppLayout } from '../src/three3d/ppLayout';
import { FACE_BUDGET_BYTES, TABLE_FACE_BUDGET_BYTES, TABLE_FACE_BYTES, TT_H, TT_W } from '../src/three3d/cardTextures';

describe('V10d Pitty Pat 3D layout', () => {
  it('opponents run clockwise from the seat after mine, never include me', () => {
    expect(opponents(4, 0)).toEqual([1, 2, 3]);
    expect(opponents(4, 2)).toEqual([3, 0, 1]);
    expect(opponents(3, 1)).toEqual([2, 0]);
    expect(opponents(2, 1)).toEqual([0]);
  });
  it('portrait shelves: z −.60, x −.52/0/+.52 (4P), ±.30 (3P), 0 (2P)', () => {
    const xs = (n: number) => [...ppLayout(n, 0, 0.46, 0.02).seats.values()].map((s) => s.shelf);
    expect(xs(4)).toEqual([[-0.52, -0.6], [0, -0.6], [0.52, -0.6]]);
    expect(xs(3)).toEqual([[-0.3, -0.6], [0.3, -0.6]]);
    expect(xs(2)).toEqual([[0, -0.6]]);
  });
  it('landscape anchors: left (−1, −.12), across (.25, −.72), right (.95, −.5); 2P across at x 0', () => {
    const xs = (n: number) => [...ppLayout(n, 0, 2.17, -0.26).seats.values()].map((s) => s.shelf);
    expect(xs(4)).toEqual([[-1, -0.12], [0.25, -0.72], [0.95, -0.5]]);
    expect(xs(3)).toEqual([[-1, -0.12], [0.95, -0.5]]);
    expect(xs(2)).toEqual([[0, -0.72]]);
  });
  it('my seat never gets a shelf on the felt (own pairs stay DOM side); a spectator sees up to 3 shelves', () => {
    expect(ppLayout(4, 1, 0.46, 0.02).seats.has(1)).toBe(false);
    expect(ppLayout(4, null, 0.46, 0.02).seats.size).toBe(3);
  });
  it('table cards at 1.5; a pair sits ±.075 from its shelf centre', () => {
    expect(CARD_SCALE).toBe(1.5);
    expect([pairX(0, 2), pairX(1, 2), pairX(0, 1)]).toEqual([-PAIR_DX, PAIR_DX, 0]);
  });
  it('face texture budgets: hand 12 × 256×358 ≈ 4.4 MB, table 16 × 160×224 ≈ 2.3 MB', () => {
    expect([TT_W, TT_H]).toEqual([160, 224]);
    expect(TABLE_FACE_BYTES).toBe(143360);
    expect(TABLE_FACE_BUDGET_BYTES).toBeLessThanOrEqual(2.3e6);
    expect(FACE_BUDGET_BYTES + TABLE_FACE_BUDGET_BYTES).toBeLessThanOrEqual(6.7e6);
  });
});
