/** Mode B — Tonk engine core (M8a): options, melds, turn flow, payouts, ending, and fast-check properties. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  type Card, type TkMove, type TkState, RuleError, TK_LIMITS, TONK_OPTIONS, buildDeck, defaultsOf, getBot, getRules, hitOnto,
  listModes, meldOf, seededRng, spreadsIn, tkCount, tonkRules as R,
} from '../src';

const DECK = buildDeck({ jokers: 2 });
const C = (id: string): Card => DECK.find((c) => c.id === id)!;
const ids = (cs: readonly Card[]) => cs.map((c) => c.id);
const LOW = { wilds: 'none', aces: 'low' } as const;

function total(s: TkState) {
  return s.hands.flat().length + s.stock.length + s.discards.length + s.spreads.reduce((n, sp) => n + sp.cards.length, 0);
}
const deckSize = (s: TkState) => (s.opts.wilds === 'jokers' ? 54 : 52);

/** A hand mid-game with chosen cards: hands, the top discard, then the rest of the deck as stock. */
function rig(hands: string[][], top: string, opts: Record<string, unknown> = {}, phase: TkState['phase'] = 'start', turn = 0): TkState {
  const base = R.newGame({ instantWin: 'off', ...opts }, hands.length, 'rig');
  const deck = buildDeck({ jokers: base.opts.wilds === 'jokers' ? 2 : 0 });
  const used = new Set([...hands.flat(), top]);
  return { ...base, hands: hands.map((h) => h.map(C)), discards: [C(top)], stock: deck.filter((c) => !used.has(c.id)), spreads: [], turn, phase, history: [], log: [] };
}
const play = (s: TkState, seat: number, m: TkMove) => R.applyMove(s, seat, m);

function runGame(opts: Record<string, unknown>, seats: number, seed: string, check?: (s: TkState) => void): TkState {
  let s = R.newGame(opts, seats, seed);
  const rng = seededRng(`${seed}:fuzz`);
  let steps = 0;
  check?.(s);
  while (!s.over) {
    const seat = R.toAct(s)[0]!;
    const legal = R.legalMoves(s, seat);
    expect(legal.length).toBeGreaterThan(0);
    s = R.applyMove(s, seat, legal[Math.floor(rng() * legal.length)]!);
    check?.(s);
    if (++steps > TK_LIMITS.maxHands * (TK_LIMITS.maxHandMoves + 10)) throw new Error('did not terminate');
  }
  return s;
}

describe('registry + options', () => {
  it('registered with its bot tiers and listed (M9b)', () => {
    expect(getRules('tonk')).toBe(R);
    expect(getBot('tonk').modeId).toBe('tonk');
    expect(listModes().map((m) => m.modeId)).toContain('tonk');
  });
  it('defaults are the documented ones; [UNVERIFIED] rules are unverified options', () => {
    expect(defaultsOf(TONK_OPTIONS)).toMatchObject({ handSize: '5', instantWin: '49-50', aces: 'low', allowDrop: true, caughtPenalty: '2', hitLock: false, slap: false, wilds: 'none', spreadBeforeDrop: false, noDiscardPickup: false, stockOut: 'lowestWins', caughtLowestCollects: true, gameEnd: 'firstToPoints', gameTarget: 10, coinStakes: false, stake: 1, pauseBetweenHands: false });
    const un = TONK_OPTIONS.filter((o) => !o.verified).map((o) => o.key);
    expect(un).toEqual(expect.arrayContaining(['handSize', 'hitLock', 'slap', 'wilds', 'spreadBeforeDrop', 'noDiscardPickup', 'gameTarget', 'caughtLowestCollects', 'gameEnd', 'coinStakes']));
  });
  it('seats 2–5', () => {
    expect(() => R.newGame({}, 1, 's')).toThrow(RuleError);
    expect(() => R.newGame({}, 6, 's')).toThrow(RuleError);
    for (const n of [2, 3, 4, 5]) expect(R.newGame({ instantWin: 'off' }, n, 's').hands.every((h) => h.length === 5)).toBe(true);
  });
});

describe('setup', () => {
  it('deals handSize each, one card up as the discard, rest is stock; seeded + deterministic', () => {
    for (const handSize of ['5', '7']) {
      const s = R.newGame({ handSize, instantWin: 'off' }, 4, 'deal');
      expect(s.hands.map((h) => h.length)).toEqual([4, 4, 4, 4].map(() => Number(handSize)));
      expect(s.discards).toHaveLength(1);
      expect(total(s)).toBe(52);
      expect(s.turn).toBe(0);
      expect(s.phase).toBe('start');
    }
    expect(R.newGame({}, 4, 'x')).toEqual(R.newGame({}, 4, 'x'));
    expect(R.newGame({ wilds: 'jokers', instantWin: 'off' }, 4, 'j').stock.length + 4 * 5 + 1).toBe(54);
  });
  it('instant win: a dealt 49/50 wins +2 from each; off does nothing', () => {
    let seed: string | null = null;
    for (let i = 0; i < 20000 && !seed; i++) { const g = R.newGame({}, 4, `iw${i}`); if (g.history[0]?.how === 'instant') seed = `iw${i}`; }
    expect(seed).not.toBeNull();
    const g = R.newGame({}, 4, seed!);
    const h = g.history[0]!;
    expect([49, 50]).toContain(h.counts[h.winner!]);
    expect(h.deltas[h.winner!]).toBe(6);
    expect(h.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(R.newGame({ instantWin: 'off' }, 4, seed!).history).toHaveLength(0);
  });
  it('instant win 50-or-11: a dealt count ≤ 11 also wins', () => {
    let found = false;
    for (let i = 0; i < 3000 && !found; i++) { const g = R.newGame({ instantWin: '50-or-11' }, 4, `low${i}`); const h = g.history[0]; if (h?.how === 'instant' && h.counts[h.winner!]! <= 11) found = true; }
    expect(found).toBe(true);
  });
});

describe('melds', () => {
  it('books (3–4 same rank) and runs (3+ same suit in order)', () => {
    expect(meldOf(['7C', '7D', '7H'].map(C), LOW)?.kind).toBe('book');
    expect(meldOf(['7C', '7D', '7H', '7S'].map(C), LOW)?.kind).toBe('book');
    expect(meldOf(['4H', '5H', '6H'].map(C), LOW)).toMatchObject({ kind: 'run', suit: 'H', lo: 4, hi: 6 });
    expect(meldOf(['4H', '6H', '5H', '7H'].map(C), LOW)).toMatchObject({ lo: 4, hi: 7 });
    expect(meldOf(['4H', '5H'].map(C), LOW)).toBeNull();
    expect(meldOf(['4H', '5H', '7H'].map(C), LOW)).toBeNull();
    expect(meldOf(['4H', '5D', '6H'].map(C), LOW)).toBeNull();
    expect(meldOf(['7C', '7D', '8H'].map(C), LOW)).toBeNull();
  });
  it('aces: low only by default (A-2-3 ok, Q-K-A no); high-or-low option, never a wrap', () => {
    expect(meldOf(['AS', '2S', '3S'].map(C), LOW)).toMatchObject({ lo: 1, hi: 3 });
    expect(meldOf(['QS', 'KS', 'AS'].map(C), LOW)).toBeNull();
    const HI = { wilds: 'none', aces: 'lowOrHigh' } as const;
    expect(meldOf(['QS', 'KS', 'AS'].map(C), HI)).toMatchObject({ lo: 12, hi: 14 });
    expect(meldOf(['KS', 'AS', '2S'].map(C), HI)).toBeNull();
  });
  it('wilds: jokers or deuces fill gaps and extend; at least one natural card', () => {
    const J = { wilds: 'jokers', aces: 'low' } as const, D = { wilds: 'deuces', aces: 'low' } as const;
    expect(meldOf(['4H', 'JK1', '6H'].map(C), J)).toMatchObject({ kind: 'run', lo: 4, hi: 6 });
    expect(meldOf(['9C', '9D', 'JK1'].map(C), J)?.kind).toBe('book');
    expect(meldOf(['JK1', 'JK2', '5D'].map(C), J)).not.toBeNull();
    expect(meldOf(['4H', '2C', '6H'].map(C), D)).toMatchObject({ lo: 4, hi: 6 });
    expect(meldOf(['4H', '2C', '6H'].map(C), LOW)).toBeNull();
    expect(meldOf(['QH', 'KH', 'JK1'].map(C), J)).toMatchObject({ lo: 11, hi: 13 }); // extends down past K
  });
  it('hits: books take the rank (or a wild); runs extend at either end only', () => {
    const run = { ...meldOf(['4H', '5H', '6H'].map(C), LOW)!, id: 1, owner: 0 };
    expect(hitOnto(run, C('7H'), LOW)).toMatchObject({ lo: 4, hi: 7 });
    expect(hitOnto(run, C('3H'), LOW)).toMatchObject({ lo: 3, hi: 6 });
    expect(hitOnto(run, C('8H'), LOW)).toBeNull();
    expect(hitOnto(run, C('7S'), LOW)).toBeNull();
    const book = { ...meldOf(['7C', '7D', '7H'].map(C), LOW)!, id: 2, owner: 1 };
    expect(hitOnto(book, C('7S'), LOW)?.cards).toHaveLength(4);
    expect(hitOnto(book, C('8S'), LOW)).toBeNull();
    const top = { ...meldOf(['JS', 'QS', 'KS'].map(C), LOW)!, id: 3, owner: 0 };
    expect(hitOnto(top, C('AS'), LOW)).toBeNull(); // past K invalid with aces low
    expect(hitOnto(top, C('AS'), { wilds: 'none', aces: 'lowOrHigh' })).toMatchObject({ hi: 14 });
  });
  it('spreadsIn lists every legal spread inside a hand', () => {
    const got = spreadsIn(['7C', '7D', '7H', '8H', '9H'].map(C), LOW).map((x) => x.sort().join());
    expect(got).toContain(['7C', '7D', '7H'].sort().join());
    expect(got).toContain(['7H', '8H', '9H'].sort().join());
    expect(got).toHaveLength(2);
  });
});

describe('turn flow', () => {
  it('start: drop / draw stock / take the top discard; then spread, hit, discard', () => {
    let s = rig([['7C', '7D', '7H', 'KS', '2D'], ['3C', '4C', '9D', 'QH', 'JD']], '5S');
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'drop' }, { t: 'drawStock' }, { t: 'drawDiscard' }]);
    expect(R.legalMoves(s, 1)).toEqual([]);
    expect(() => play(s, 1, { t: 'drawStock' })).toThrow(RuleError);
    s = play(s, 0, { t: 'drawDiscard' });
    expect(s.phase).toBe('meld');
    expect(s.pickedUp?.id).toBe('5S');
    const legal = R.legalMoves(s, 0);
    expect(legal).toContainEqual({ t: 'spread', cardIds: ['7C', '7D', '7H'] });
    s = play(s, 0, { t: 'spread', cardIds: ['7C', '7D', '7H'] });
    expect(s.spreads).toHaveLength(1);
    expect(s.spreads[0]!.owner).toBe(0);
    s = play(s, 0, { t: 'discard', cardId: 'KS' });
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('start');
    expect(total(s)).toBe(52);
    s = play(s, 1, { t: 'drawStock' });
    expect(R.legalMoves(s, 1).some((m) => m.t === 'hit')).toBe(false);
  });
  it('hit any spread (own or another\'s); spreading/hitting your last card = Tonk (+2 from each)', () => {
    let s = rig([['7S', '4D'], ['3C', '4C', '9D', 'QH', 'JD'], ['5C', '5D', '9S', 'QS', 'JS']], '2S', {}, 'meld');
    s = { ...s, spreads: [{ ...meldOf(['7C', '7D', '7H'].map(C), LOW)!, id: 9, owner: 1 }], stock: s.stock.filter((c) => !['7C', '7D', '7H'].includes(c.id)) };
    s = play(s, 0, { t: 'hit', cardId: '7S', spreadId: 9 });
    expect(s.spreads[0]!.cards).toHaveLength(4);
    s = { ...s, spreads: [...s.spreads, { ...meldOf(['4H', '4S', '4C'].map(C), LOW)!, id: 10, owner: 2 }], hands: [[C('4D')], s.hands[1]!, s.hands[2]!.filter((c) => c.id !== '4C')] };
    s = play(s, 0, { t: 'hit', cardId: '4D', spreadId: 10 });
    expect(s.history[0]).toMatchObject({ winner: 0, how: 'tonk', deltas: [4, -2, -2] });
  });
  it('discarding the last card = out (+1 from each)', () => {
    let s = rig([['KS'], ['3C', '4C', '9D', 'QH', 'JD']], '2S', {}, 'meld');
    s = play(s, 0, { t: 'discard', cardId: 'KS' });
    expect(s.history[0]).toMatchObject({ winner: 0, how: 'out', deltas: [1, -1] });
  });
  it('noDiscardPickup: can\'t discard the card just taken from the pile', () => {
    let s = rig([['KS', '9D'], ['3C', '4C', '9C', 'QH', 'JD']], '5S', { noDiscardPickup: true });
    s = play(s, 0, { t: 'drawDiscard' });
    expect(R.legalMoves(s, 0)).not.toContainEqual({ t: 'discard', cardId: '5S' });
    let d = rig([['KS', '9D'], ['3C', '4C', '9C', 'QH', 'JD']], '5S');
    d = play(d, 0, { t: 'drawDiscard' });
    expect(R.legalMoves(d, 0)).toContainEqual({ t: 'discard', cardId: '5S' });
  });
});

describe('drop + payouts', () => {
  it('drop, strictly lowest: +1 from each', () => {
    const s = play(rig([['AC', '2D'], ['3C', '4C'], ['KS', 'QS']], '9S'), 0, { t: 'drop' });
    expect(s.history[0]).toMatchObject({ winner: 0, how: 'drop', dropper: 0, deltas: [2, -1, -1], counts: [3, 7, 20] });
  });
  it('caught (a tie counts): dropper pays caughtPenalty to each ≤, the lowest also collects 1 from the rest', () => {
    const hands = [['5C', '2D'], ['3C', '4C'], ['AS', '2S'], ['KS', 'QS']];
    const s = play(rig(hands, '9S'), 0, { t: 'drop' }); // counts 7, 7, 3, 20
    expect(s.history[0]).toMatchObject({ how: 'caught', winner: 2, dropper: 0 });
    // dropper −2 to seat 1, −2 to seat 2 → −4; the lowest (2) also gets +1 from the rest (1 and 3; the dropper already paid)
    expect(s.history[0]!.deltas).toEqual([-4, 1, 4, -1]);
    const one = play(rig(hands, '9S', { caughtPenalty: '1', caughtLowestCollects: false }), 0, { t: 'drop' });
    expect(one.history[0]!.deltas).toEqual([-2, 1, 1, 0]);
  });
  it('allowDrop off / spreadBeforeDrop: no drop', () => {
    expect(R.legalMoves(rig([['AC'], ['3C']], '9S', { allowDrop: false }), 0)).not.toContainEqual({ t: 'drop' });
    const s = rig([['AC'], ['3C']], '9S', { spreadBeforeDrop: true });
    expect(R.legalMoves(s, 0)).not.toContainEqual({ t: 'drop' });
    const withSpread = { ...s, spreads: [{ ...meldOf(['7C', '7D', '7H'].map(C), LOW)!, id: 1, owner: 0 }] };
    expect(R.legalMoves(withSpread, 0)).toContainEqual({ t: 'drop' });
  });
  it('stock out: lowest count wins +1 from each; tied lowest voids; option void', () => {
    const base = rig([['AC', 'KD'], ['3C', 'QC']], '9S', {}, 'meld');
    const last = { ...base, stock: [] };
    const s = play(last, 0, { t: 'discard', cardId: 'KD' });
    expect(s.history[0]).toMatchObject({ winner: 0, how: 'stockOut', deltas: [1, -1] });
    const tie = play({ ...rig([['3D', 'KD'], ['AC', '2C']], '9S', {}, 'meld'), stock: [] }, 0, { t: 'discard', cardId: 'KD' });
    expect(tie.history[0]).toMatchObject({ winner: null, how: 'void' });
    const v = play({ ...rig([['AC', 'KD'], ['3C', 'QC']], '9S', { stockOut: 'void' }, 'meld'), stock: [] }, 0, { t: 'discard', cardId: 'KD' });
    expect(v.history[0]).toMatchObject({ winner: null, how: 'void' });
  });
});

describe('house options', () => {
  it('hitLock: the player you hit can\'t spread or drop on their next turn', () => {
    let s = rig([['7S', '4D', '9C'], ['3C', '3D', '3H', 'QH', 'JD']], '2S', { hitLock: true }, 'meld');
    s = { ...s, spreads: [{ ...meldOf(['7C', '7D', '7H'].map(C), LOW)!, id: 5, owner: 1 }] };
    s = play(play(s, 0, { t: 'hit', cardId: '7S', spreadId: 5 }), 0, { t: 'discard', cardId: '9C' });
    expect(s.turn).toBe(1);
    expect(s.lockedNow).toBe(true);
    expect(R.legalMoves(s, 1)).not.toContainEqual({ t: 'drop' });
    s = play(s, 1, { t: 'drawStock' });
    expect(R.legalMoves(s, 1).some((m) => m.t === 'spread')).toBe(false);
    s = play(s, 1, { t: 'discard', cardId: 'QH' });
    expect(s.lockedNow).toBe(false);
  });
  it('slap: another player may take a playable discard onto a spread, then sheds a card; play resumes left of the discarder', () => {
    let s = rig([['8H', 'KD'], ['3C', 'QC', 'JD'], ['5C', '9D', 'QS']], '2S', { slap: true }, 'meld');
    s = { ...s, spreads: [{ ...meldOf(['5H', '6H', '7H'].map(C), LOW)!, id: 3, owner: 2 }], stock: s.stock.filter((c) => !['5H', '6H', '7H'].includes(c.id)) };
    s = play(s, 0, { t: 'discard', cardId: '8H' });
    expect(s.phase).toBe('slap');
    expect(R.toAct(s)).toEqual([1]);
    expect(R.legalMoves(s, 1)).toEqual([{ t: 'slap', spreadId: 3 }, { t: 'waive' }]);
    s = play(s, 1, { t: 'waive' });
    expect(R.toAct(s)).toEqual([2]);
    s = play(s, 2, { t: 'slap', spreadId: 3 });
    expect(s.spreads[0]!.hi).toBe(8);
    expect(s.phase).toBe('slapShed');
    s = play(s, 2, { t: 'discard', cardId: 'QS' });
    expect(s.hands[2]!).toHaveLength(2);
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('start');
    expect(total(s)).toBe(52);
  });
  it('pauseBetweenHands: the hand result stays up until the winner deals on', () => {
    let s = rig([['KS'], ['3C', '4C']], '2S', { pauseBetweenHands: true }, 'meld');
    s = play(s, 0, { t: 'discard', cardId: 'KS' });
    expect(s.phase).toBe('handOver');
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'nextHand' }]);
    s = play(s, 0, { t: 'nextHand' });
    expect(s.handNo).toBe(1);
  });
});

describe('ending + results', () => {
  it('default: first to 10 points; points are the score; no coins unless coinStakes', () => {
    const g = runGame({}, 3, 'end');
    expect(Math.max(...g.points)).toBeGreaterThanOrEqual(10);
    expect(g.points.reduce((a, b) => a + b, 0)).toBe(0);
    const r = R.results(g);
    expect(r.placements[0]).toBe(g.points.indexOf(Math.max(...g.points)));
    expect(r.deltas).toEqual([0, 0, 0]);
    const c = runGame({ coinStakes: true, stake: 2 }, 3, 'end');
    expect(R.results(c).deltas).toEqual(c.points.map((p) => p * 2));
  });
  it('fixedHands: after N hands', () => {
    expect(runGame({ gameEnd: 'fixedHands', gameHands: 3 }, 4, 'fx').history).toHaveLength(3);
  });
  it('recap: points, hand by hand, tonks / drops / caught — public only', () => {
    const g = runGame({ gameEnd: 'fixedHands', gameHands: 4 }, 4, 'rc');
    const rc = R.results(g).recap as import('../src').TkRecap;
    expect(rc).toMatchObject({ v: 1, points: g.points, coinStakes: false });
    expect(rc.hands).toHaveLength(4);
    expect(JSON.stringify(rc)).not.toMatch(/"id":"/);
  });
});

const optArb = fc.record({
  handSize: fc.constantFrom('5', '7'), instantWin: fc.constantFrom('49-50', '50-or-11', 'off'), aces: fc.constantFrom('low', 'lowOrHigh'),
  allowDrop: fc.boolean(), caughtPenalty: fc.constantFrom('1', '2'), hitLock: fc.boolean(), slap: fc.boolean(),
  wilds: fc.constantFrom('none', 'jokers', 'deuces'), spreadBeforeDrop: fc.boolean(), noDiscardPickup: fc.boolean(),
  stockOut: fc.constantFrom('lowestWins', 'void'), caughtLowestCollects: fc.boolean(), gameEnd: fc.constantFrom('firstToPoints', 'fixedHands'),
  gameTarget: fc.integer({ min: 5, max: 12 }), gameHands: fc.integer({ min: 1, max: 6 }), coinStakes: fc.boolean(), stake: fc.integer({ min: 0, max: 3 }),
  pauseBetweenHands: fc.boolean(),
});

describe('properties (fast-check)', () => {
  it('random legal play always terminates; cards conserved; points zero-sum; results consistent', () => {
    fc.assert(fc.property(optArb, fc.integer({ min: 2, max: 5 }), fc.string({ maxLength: 8 }), (opts, seats, seed) => {
      const g = runGame(opts, seats, seed, (s) => {
        if (s.phase === 'handOver') return;
        expect(total(s)).toBe(deckSize(s));
        expect(new Set([...s.hands.flat(), ...s.stock, ...s.discards, ...s.spreads.flatMap((x) => x.cards)].map((c) => c.id)).size).toBe(deckSize(s));
        expect(s.points.reduce((a, b) => a + b, 0)).toBe(0);
        for (const sp of s.spreads) expect(sp.cards.length).toBeGreaterThanOrEqual(3);
      });
      const r = R.results(g);
      expect(r.done).toBe(true);
      expect([...r.placements].sort()).toEqual([...Array(seats).keys()]);
      expect(r.deltas.reduce((a, b) => a + b, 0)).toBe(0);
      expect(g.history.length).toBeLessThanOrEqual(TK_LIMITS.maxHands);
    }), { numRuns: 80 });
  }, 180_000);
  it('deterministic replay', () => {
    fc.assert(fc.property(optArb, fc.integer({ min: 2, max: 5 }), fc.string({ maxLength: 8 }), (opts, seats, seed) => {
      expect(runGame(opts, seats, seed)).toEqual(runGame(opts, seats, seed));
    }), { numRuns: 15 });
  }, 180_000);
  it('views never leak another hand or the stock; spectators see no hand', () => {
    fc.assert(fc.property(optArb, fc.integer({ min: 2, max: 5 }), fc.string({ maxLength: 8 }), (opts, seats, seed) => {
      runGame({ ...opts, gameEnd: 'fixedHands', gameHands: 2 }, seats, seed, (s) => {
        if (s.over) return;
        for (let me = 0; me < seats; me++) {
          const json = JSON.stringify(R.view(s, me));
          for (let o = 0; o < seats; o++) if (o !== me) for (const c of s.hands[o]!) {
            const public_ = s.spreads.some((sp) => sp.cards.some((x) => x.id === c.id)) || s.pickedUp?.id === c.id || s.log.some((e) => JSON.stringify(e).includes(`"${c.id}"`));
            if (!public_) expect(json).not.toContain(`"${c.id}"`);
          }
          for (const c of s.stock) expect(json).not.toContain(`"${c.id}"`);
        }
        expect(R.view(s, 'spectator').hand).toEqual([]);
      });
    }), { numRuns: 30 });
  }, 180_000);
  it('every legal move applies; illegal moves and wrong seats are refused', () => {
    fc.assert(fc.property(optArb, fc.integer({ min: 2, max: 4 }), fc.string({ maxLength: 6 }), (opts, seats, seed) => {
      let s = R.newGame({ ...opts, gameEnd: 'fixedHands', gameHands: 1 }, seats, seed);
      for (let k = 0; k < 40 && !s.over; k++) {
        const seat = R.toAct(s)[0]!;
        const legal = R.legalMoves(s, seat);
        for (const m of legal) expect(() => R.applyMove(s, seat, m)).not.toThrow();
        expect(() => R.applyMove(s, (seat + 1) % seats, legal[0]!)).toThrow(RuleError);
        expect(() => R.applyMove(s, seat, { t: 'discard', cardId: 'nope' })).toThrow(RuleError);
        s = R.applyMove(s, seat, legal[k % legal.length]!);
      }
    }), { numRuns: 40 });
  }, 180_000);
  it('the stand-in bot only plays legal moves to the end', () => {
    const B = getBot('tonk');
    for (let g = 0; g < 10; g++) {
      let s = R.newGame({}, 4, `bot${g}`);
      for (let k = 0; !s.over; k++) {
        const seat = R.toAct(s)[0]!;
        const legal = R.legalMoves(s, seat);
        const m = B.choose(R.view(s, seat), legal, 'normal', seededRng(`${g}:${k}`)) as TkMove;
        expect(legal).toContainEqual(m);
        s = R.applyMove(s, seat, m);
      }
      expect(tkCount([])).toBe(0);
    }
  }, 120_000);
});
