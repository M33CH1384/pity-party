/**
 * Demetrius (2026-10-26): every hand starts from a fresh, full, reshuffled deck. Pitty Pat and Tonk: after a hand
 * ends, the next deal holds the whole deck exactly once (hands + stock + discards/upcard), nothing carried from
 * the previous hand's shelves/spreads/piles, a different deal order each hand, and identical on replay.
 */
import { describe, expect, it } from 'vitest';
import { type Card, buildDeck, getBot, pittyPatRules, seededRng, tonkRules } from '../src';

type Any = { over: boolean; handNo: number; phase: string; hands: Card[][]; stock: Card[]; discards: Card[]; upcard?: Card | null; shelves?: Card[][]; spreads?: { cards: Card[] }[] };
const MODES = [
  { id: 'pitty-pat', R: pittyPatRules, opts: { pauseBetweenHands: true, targetPoints: 3 }, deck: () => buildDeck({ jokers: 0 }) },
  { id: 'tonk', R: tonkRules, opts: { pauseBetweenHands: true, gameTarget: 5 }, deck: () => buildDeck({ jokers: 0 }) },
  { id: 'tonk', R: tonkRules, opts: { pauseBetweenHands: true, gameTarget: 5, wilds: 'jokers' }, deck: () => buildDeck({ jokers: 2 }) },
] as const;

/** Bots play to the end; returns the state at each fresh deal (first state of every hand). */
function deals(m: (typeof MODES)[number], seats: number, seed: string) {
  const R = m.R as unknown as { newGame(o: unknown, n: number, s: string): Any; toAct(s: Any): number[]; legalMoves(s: Any, seat: number): unknown[]; view(s: Any, seat: number): unknown; applyMove(s: Any, seat: number, mv: unknown): Any };
  const bot = getBot(m.id);
  let s = R.newGame(m.opts, seats, seed);
  const out: { state: Any; prev: Any | null }[] = [{ state: s, prev: null }];
  let last = s;
  for (let i = 0; !s.over && i < 200_000; i++) {
    const seat = R.toAct(s)[0]!;
    const next = R.applyMove(s, seat, bot.choose(R.view(s, seat), R.legalMoves(s, seat), 'normal', seededRng(`${seed}:${i}`)));
    if (s.phase === 'handOver' && next.phase !== 'handOver' && !next.over) out.push({ state: next, prev: last });
    if (next.phase === 'handOver') last = next;
    s = next;
  }
  return out;
}
/** Every card in play: hands, stock, piles, plus anything already laid this hand (e.g. a Pitty Pat dealt pair). */
const dealt = (s: Any) => [...s.hands.flat(), ...s.stock, ...s.discards, ...(s.upcard ? [s.upcard] : []), ...(s.shelves ?? []).flat(), ...(s.spreads ?? []).flatMap((x) => x.cards)];

describe('fresh full deck every hand', () => {
  for (const m of MODES) for (const seats of [2, 3, 4]) for (const seed of ['fd-c', 'fd-d']) {
    it(`${m.id}${'wilds' in m.opts ? '+jokers' : ''} · ${seats} seats · ${seed}`, () => {
      const ds = deals(m, seats, seed);
      expect(ds.length).toBeGreaterThan(1);
      const deck = m.deck().map((c) => c.id).sort();
      let prevOrder = '';
      for (const { state, prev } of ds) {
        const ids = dealt(state).map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length); // no duplicates
        expect([...ids].sort()).toEqual(deck); // the whole deck, nothing else
        // whole deck exactly once ⇒ nothing carried over from the previous hand's piles/melds/shelves
        if (prev) for (const k of ['spreads', 'shelves'] as const) for (const c of (prev[k] ?? []).flatMap((x) => ('cards' in (x as object) ? (x as { cards: Card[] }).cards : (x as Card[])))) expect(ids.filter((id) => id === c.id)).toHaveLength(1);
        if (prev) expect(prev.phase).toBe('handOver'); // a hand really ended before this deal
        const order = [...state.hands.flat(), ...state.stock].map((c) => c.id).join();
        expect(order).not.toBe(prevOrder);
        prevOrder = order;
      }
      expect(deals(m, seats, seed).map((d) => dealt(d.state).map((c) => c.id).join())).toEqual(ds.map((d) => dealt(d.state).map((c) => c.id).join()));
    }, 60_000);
  }
});
