/**
 * Tonk meld solver (M8b): the best way to lay a hand down — a set of disjoint legal spreads (books/runs, wilds
 * per options) that leaves the LEAST count in hand (deadwood). Hands stay ≤ 8 cards, so an exhaustive search
 * over the legal spreads inside the hand is cheap and exact. Ties: fewer cards left, then the earliest spread
 * list in a fixed order, so the answer is deterministic. Used by bots (draw / spread / discard / drop choices).
 */
import type { Card } from '../cards';
import { type TkOptions, spreadsIn, tkCount } from './tonk';

export interface MeldPlan {
  /** spreads to lay, as card-id lists */
  melds: string[][];
  /** cards left in hand after laying them */
  left: Card[];
  /** count of `left` (A=1, faces 10, joker 0) */
  deadwood: number;
}

export function bestMelds(hand: readonly Card[], o: Pick<TkOptions, 'wilds' | 'aces'>): MeldPlan {
  const all = spreadsIn(hand, o).map((ids) => ({ ids, set: new Set(ids) }));
  let best: MeldPlan = { melds: [], left: hand.slice(), deadwood: tkCount(hand) };
  const go = (from: number, used: Set<string>, chosen: string[][]) => {
    const left = hand.filter((c) => !used.has(c.id));
    const dw = tkCount(left);
    if (dw < best.deadwood || (dw === best.deadwood && left.length < best.left.length)) best = { melds: chosen.map((m) => m.slice()), left, deadwood: dw };
    for (let i = from; i < all.length; i++) {
      const m = all[i]!;
      if (m.ids.some((id) => used.has(id))) continue;
      const next = new Set(used); for (const id of m.ids) next.add(id);
      chosen.push(m.ids); go(i + 1, next, chosen); chosen.pop();
    }
  };
  go(0, new Set(), []);
  return best;
}

/** Deadwood after the best lay-down: the count a player could get down to from this hand. */
export const minDeadwood = (hand: readonly Card[], o: Pick<TkOptions, 'wilds' | 'aces'>): number => bestMelds(hand, o).deadwood;
