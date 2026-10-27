/**
 * V10d Pitty Pat felt layout (V10-3D-SPEC §3/§4): pure world positions (x, z on the felt) for 2–4 seats.
 * Portrait shelves at z −.60 (x −.52 / 0 / +.52 for 3 opponents, ±.30 for 2, 0 for 1); landscape / iPad anchors
 * left (−1.00, −.12), across (.25, −.72), right (.95, −.50). Table cards at scale 1.5 (spec fix, was 1.3).
 */
export const CARD_SCALE = 1.5;
/** card width in world units (base .17 ≈ the spec's 66 px at 390 portrait × the 1.5 felt scale) and h / w */
export const CW = 0.17 * CARD_SCALE, CASPECT = 896 / 640, CH = CW * CASPECT;
/** pair spread: each card sits ±PAIR_DX from its shelf centre (half-width = .075 + card / 2) */
export const PAIR_DX = 0.075;
export type XZ = [number, number];
export interface PPLayout { portrait: boolean; stock: XZ; up: XZ; seats: Map<number, { shelf: XZ; plate: XZ; backs: XZ }>; me: { plate: XZ } | null }

/** opponents clockwise from the seat after mine */
export function opponents(n: number, me: number | null): number[] {
  const m = me ?? n - 1; const out: number[] = [];
  for (let k = 1; k < n; k++) out.push((m + k) % n);
  return me === null ? [...out, m].slice(0, 3) : out;
}
export function ppLayout(n: number, me: number | null, aspect: number, cz: number): PPLayout {
  const portrait = aspect < 0.75;
  const opp = opponents(n, me);
  const seats = new Map<number, { shelf: XZ; plate: XZ; backs: XZ }>();
  let anchors: XZ[];
  if (portrait) {
    const xs = opp.length >= 3 ? [-0.52, 0, 0.52] : opp.length === 2 ? [-0.3, 0.3] : [0];
    anchors = xs.map((x) => [x, -0.6]);
  } else {
    const L: XZ = [-1.0, -0.12], A: XZ = [opp.length === 1 ? 0 : 0.25, -0.72], R: XZ = [0.95, -0.5];
    anchors = opp.length >= 3 ? [L, A, R] : opp.length === 2 ? [L, R] : [A];
  }
  opp.forEach((s, i) => {
    const [x, z] = anchors[i]!;
    // plate just beyond the shelf (toward the far rail); the backs between plate and shelf
    seats.set(s, { shelf: [x, z], plate: [x, z - (portrait ? 0.5 : 0.5)], backs: [x, z - (portrait ? 0.27 : 0.27)] });
  });
  const dx = portrait ? 0.2 : 0.2;
  return {
    portrait, seats,
    stock: [-dx, portrait ? cz - 0.08 : cz], up: [dx, portrait ? cz - 0.08 : cz],
    me: me === null ? null : { plate: portrait ? [-0.42, cz + 0.38] : [-0.86, 0.26] },
  };
}
/** where card i of a shelf's top pair lies */
export const pairX = (i: number, len: number) => (len < 2 ? 0 : (i === 0 ? -PAIR_DX : PAIR_DX));
