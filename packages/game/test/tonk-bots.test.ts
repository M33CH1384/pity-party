/** M9a: Tonk bot tiers — legal, terminating, tell-free, deterministic, ordered by strength, varied. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { type BotTier, type TkMove, type TkState, getBot, seededRng, shuffle, tonkRules as R } from '../src';

const bot = getBot('tonk');
function game(tiers: BotTier[], seed: string, opts: Record<string, unknown> = {}) {
  let s = R.newGame(opts, tiers.length, seed); let n = 0;
  while (!s.over) {
    const seat = R.toAct(s)[0]!;
    const legal = R.legalMoves(s, seat);
    const m = bot.choose(R.view(s, seat), legal, tiers[seat]!, seededRng(`${seed}:bot:${n++}:${seat}`)) as TkMove;
    expect(legal).toContainEqual(m);
    s = R.applyMove(s, seat, m);
  }
  return s;
}
/** Heads-up: share of games and of decided hands the `b` tier wins vs `a`, seats alternated. */
function headsUp(a: BotTier, b: BotTier, games: number) {
  let gw = 0, hw = 0, hands = 0;
  for (let i = 0; i < games; i++) {
    const sw = i % 2 === 1; const bs = sw ? 0 : 1;
    const s = game(sw ? [b, a] : [a, b], `hu-${a}-${b}-${i}`);
    if (s.points[bs]! > s.points[1 - bs]!) gw++;
    for (const h of s.history) if (h.winner !== null) { hands++; if (h.winner === bs) hw++; }
  }
  return { games: gw / games, hands: hw / hands };
}

const optArb = fc.record({
  wilds: fc.constantFrom('none', 'jokers', 'deuces'), aces: fc.constantFrom('low', 'lowOrHigh'), slap: fc.boolean(), hitLock: fc.boolean(),
  caughtPenalty: fc.constantFrom('1', '2'), caughtLowestCollects: fc.boolean(), spreadBeforeDrop: fc.boolean(), noDiscardPickup: fc.boolean(),
  allowDrop: fc.boolean(), stockOut: fc.constantFrom('lowest', 'void'), handSize: fc.constantFrom('5', '7'), gameTarget: fc.constantFrom(3, 5),
});

describe('Tonk bot tiers', () => {
  it('every tier plays only legal moves and every game ends, across options and seat counts', () => {
    fc.assert(fc.property(optArb, fc.integer({ min: 2, max: 5 }), fc.string({ maxLength: 6 }), fc.array(fc.constantFrom<BotTier>('easy', 'normal', 'hard'), { minLength: 5, maxLength: 5 }), (opts, seats, seed, tiers) => {
      const s = game(tiers.slice(0, seats), seed, opts);
      expect(s.over).toBe(true);
      expect(s.points.reduce((a, b) => a + b, 0)).toBe(0);
    }), { numRuns: 60 });
  }, 300_000);

  it('deterministic per seed', () => {
    const a = game(['easy', 'normal', 'hard'], 'det');
    expect(game(['easy', 'normal', 'hard'], 'det')).toEqual(a);
  });

  it('tell-free: swapping every hidden card (other hands + stock) leaves the bot view and its choice unchanged', () => {
    for (const tier of ['easy', 'normal', 'hard'] as const) {
      fc.assert(fc.property(fc.string({ maxLength: 6 }), fc.integer({ min: 0, max: 60 }), fc.constantFrom('none', 'jokers'), (seed, steps, wilds) => {
        let s: TkState = R.newGame({ wilds, slap: true, hitLock: true }, 4, seed);
        for (let i = 0; i < steps && !s.over; i++) { const seat = R.toAct(s)[0]!; s = R.applyMove(s, seat, bot.choose(R.view(s, seat), R.legalMoves(s, seat), 'normal', seededRng(`${seed}:${i}`)) as TkMove); }
        if (s.over) return;
        const me = R.toAct(s)[0]!;
        // reshuffle all hidden cards among the hidden slots (same hand sizes, same stock size)
        const hidden = [...s.hands.flatMap((h, i) => (i === me ? [] : h)), ...s.stock];
        const mixed = shuffle(hidden, seededRng(`${seed}:swap`));
        let k = 0;
        const t: TkState = { ...s, hands: s.hands.map((h, i) => (i === me ? h : h.map(() => mixed[k++]!))), stock: s.stock.map(() => mixed[k++]!) };
        expect(R.view(t, me)).toEqual(R.view(s, me));
        const pick = (x: TkState) => bot.choose(R.view(x, me), R.legalMoves(x, me), tier, seededRng('same'));
        expect(pick(t)).toEqual(pick(s));
      }), { numRuns: 40 });
    }
  }, 120_000);

  // 200 seeded heads-up games each (seats alternated). Measured: normal beats easy ~100% of games / ~84% of hands;
  // hard beats normal ~75% of games but only ~54% of hands — Tonk hands are short and luck-heavy, so the
  // hard-vs-normal edge is real but small per hand; assertions leave room for that.
  it('strength order: hard > normal > easy over many seeded heads-up games', () => {
    const ne = headsUp('easy', 'normal', 200);
    const hn = headsUp('normal', 'hard', 200);
    const he = headsUp('easy', 'hard', 200);
    expect(ne.games).toBeGreaterThan(0.85); expect(ne.hands).toBeGreaterThan(0.7);
    expect(he.games).toBeGreaterThan(0.85); expect(he.hands).toBeGreaterThan(0.7);
    expect(hn.games).toBeGreaterThan(0.6); expect(hn.hands).toBeGreaterThan(0.5);
  }, 300_000);

  it('variety: hands end by several routes (not just drops), at 4 seats with mixed tiers', () => {
    const how: Record<string, number> = {};
    for (let i = 0; i < 30; i++) for (const h of game(['easy', 'normal', 'hard', 'normal'], `var-${i}`).history) how[h.how] = (how[h.how] ?? 0) + 1;
    const total = Object.values(how).reduce((a, b) => a + b, 0);
    expect(Object.keys(how).length).toBeGreaterThanOrEqual(4);
    for (const k of ['drop', 'caught']) expect(how[k] ?? 0).toBeGreaterThan(0);
    expect((how.tonk ?? 0) + (how.out ?? 0)).toBeGreaterThan(0);
    expect((how.drop ?? 0) / total).toBeLessThan(0.9);
    console.log('4-seat routes', JSON.stringify(how));
  }, 120_000);
});
