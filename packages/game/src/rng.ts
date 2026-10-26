/** Deterministic RNG so every game replays from (seed, moves). */
export type Rng = () => number;

function hashSeed(seed: string | number): number {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** mulberry32 */
export function seededRng(seed: string | number): Rng {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Deal `perSeat` cards to each of `seats` players one at a time (dealer's left first), rest = stock. */
export function deal<T>(deck: readonly T[], seats: number, perSeat: number): { hands: T[][]; stock: T[] } {
  if (seats * perSeat > deck.length) throw new Error('not enough cards to deal');
  const hands: T[][] = Array.from({ length: seats }, () => []);
  let k = 0;
  for (let r = 0; r < perSeat; r++) for (let s = 0; s < seats; s++) hands[s]!.push(deck[k++]!);
  return { hands, stock: deck.slice(k) };
}
