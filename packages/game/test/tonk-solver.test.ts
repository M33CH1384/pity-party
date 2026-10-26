/** M8b: Tonk meld solver — least deadwood over disjoint spreads, exact against brute force. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { type Card, bestMelds, buildDeck, meldOf, minDeadwood, seededRng, shuffle, tkCount } from '../src';

const DECK = buildDeck({ jokers: 2 });
const C = (id: string): Card => DECK.find((c) => c.id === id)!;
const LOW = { wilds: 'none', aces: 'low' } as const;

/** Independent brute force: try every assignment of cards to (meld group 1..k | left). */
function brute(hand: Card[], o: Parameters<typeof minDeadwood>[1]): number {
  let best = tkCount(hand);
  const n = hand.length;
  const assign = (i: number, groups: Card[][], left: Card[]) => {
    if (i === n) {
      if (groups.every((g) => meldOf(g, o))) best = Math.min(best, tkCount(left));
      return;
    }
    const c = hand[i]!;
    assign(i + 1, groups, [...left, c]);
    for (let g = 0; g < groups.length; g++) assign(i + 1, groups.map((x, j) => (j === g ? [...x, c] : x)), left);
    if (groups.length < 2) assign(i + 1, [...groups, [c]], left);
  };
  assign(0, [], []);
  return best;
}

describe('bestMelds', () => {
  it('lays books and runs to leave the least count', () => {
    const p = bestMelds(['7C', '7D', '7H', '8H', '9H', 'KS'].map(C), LOW);
    // 7C 7D 7H book leaves 8H 9H KS (27); 7H 8H 9H run leaves 7C 7D KS (24) → run wins
    expect(p.deadwood).toBe(24);
    expect(p.melds).toEqual([['7H', '8H', '9H']]);
    expect(p.left.map((c) => c.id).sort()).toEqual(['7C', '7D', 'KS']);
  });
  it('two disjoint melds; nothing left = Tonk-ready', () => {
    const p = bestMelds(['4S', '5S', '6S', 'QC', 'QD', 'QH'].map(C), LOW);
    expect(p.deadwood).toBe(0);
    expect(p.left).toEqual([]);
    expect(p.melds).toHaveLength(2);
  });
  it('wilds help; no melds → the whole hand is deadwood', () => {
    expect(minDeadwood(['4H', 'JK1', '6H', 'KD'].map(C), { wilds: 'jokers', aces: 'low' })).toBe(10);
    expect(minDeadwood(['4H', '9C', 'KD'].map(C), LOW)).toBe(23);
  });
  it('matches an independent brute force on random hands (all wild/ace options)', () => {
    fc.assert(fc.property(fc.string({ maxLength: 6 }), fc.integer({ min: 3, max: 8 }), fc.constantFrom('none', 'jokers', 'deuces'), fc.constantFrom('low', 'lowOrHigh'), (seed, n, wilds, aces) => {
      const o = { wilds, aces } as Parameters<typeof minDeadwood>[1];
      const deck = buildDeck({ jokers: wilds === 'jokers' ? 2 : 0 });
      const hand = shuffle(deck, seededRng(seed)).slice(0, n);
      const p = bestMelds(hand, o);
      expect(p.deadwood).toBe(brute(hand, o));
      // the plan is real: disjoint legal melds + left = the hand
      const used = p.melds.flat();
      expect(new Set(used).size).toBe(used.length);
      for (const m of p.melds) expect(meldOf(m.map((id) => hand.find((c) => c.id === id)!), o)).not.toBeNull();
      expect([...used, ...p.left.map((c) => c.id)].sort()).toEqual(hand.map((c) => c.id).sort());
    }), { numRuns: 150 });
  }, 120_000);
});
