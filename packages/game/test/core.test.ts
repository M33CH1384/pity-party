import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildDeck, countValue, deal, seededRng, shuffle } from '../src';

describe('cards + rng', () => {
  it('builds 52 unique cards, plus jokers and multiple decks', () => {
    expect(new Set(buildDeck().map((c) => c.id)).size).toBe(52);
    const big = buildDeck({ decks: 2, jokers: 2 });
    expect(big).toHaveLength(108);
    expect(new Set(big.map((c) => c.id)).size).toBe(108);
  });
  it('count values: A=1, faces 10, joker 0', () => {
    const d = buildDeck({ jokers: 1 });
    expect(countValue(d.find((c) => c.id === 'AS')!)).toBe(1);
    expect(countValue(d.find((c) => c.id === 'KH')!)).toBe(10);
    expect(countValue(d.find((c) => c.id === '7C')!)).toBe(7);
    expect(countValue(d.find((c) => c.rank === 0)!)).toBe(0);
  });
  it('seeded shuffle is deterministic and a permutation', () => {
    fc.assert(fc.property(fc.string(), (seed) => {
      const a = shuffle(buildDeck(), seededRng(seed)).map((c) => c.id);
      const b = shuffle(buildDeck(), seededRng(seed)).map((c) => c.id);
      expect(a).toEqual(b);
      expect([...a].sort()).toEqual(buildDeck().map((c) => c.id).sort());
    }), { numRuns: 50 });
  });
  it('deals one at a time and conserves cards', () => {
    const { hands, stock } = deal([1, 2, 3, 4, 5, 6, 7], 3, 2);
    expect(hands).toEqual([[1, 4], [2, 5], [3, 6]]);
    expect(stock).toEqual([7]);
    expect(() => deal([1, 2], 3, 1)).toThrow();
  });
});
