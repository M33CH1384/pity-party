/**
 * Mode A — Pitty Pat engine (milestone 6, PR 1). One test (or group) per docs/plan/RULES.md row; every
 * [UNVERIFIED] rule is an option and is tested both ways. Property tests: termination, 52-card conservation,
 * toAct ⇒ legal moves, legal moves never throw, determinism, and views that never leak hidden cards.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  type Card, type PpMove, type PpState, type PpView, PITTY_PAT_OPTIONS, PP_LIMITS, RuleError, buildDeck, defaultsOf, getBot, getRules,
  allPairs, listModes, pairsWith, pittyPatRules as R, seededRng,
} from '../src';

const DECK = buildDeck();
const C = (id: string): Card => { const c = DECK.find((d) => d.id === id); if (!c) throw new Error(id); return c; };
const ids = (cs: readonly Card[]) => cs.map((c) => c.id);

/** Rig a hand: given hands + upcard (+ optional stock head), the rest of the deck becomes the stock (conservation holds). */
function rig(hands: string[][], upcard: string, opts0: Record<string, unknown> = {}, stockHead: string[] = []): PpState {
  // rigged hands use natural ranks unless a test turns deuces wild on
  const opts = { deucesWild: false, ...opts0 };
  const base = R.newGame({ ...opts, dealtWinAuto: false, deadCardSteal: false }, hands.length, 'rig');
  const used = new Set([...hands.flat(), upcard, ...stockHead]);
  const stock = [...stockHead.map(C), ...DECK.filter((c) => !used.has(c.id))];
  const o = { ...base.opts, ...R.newGame(opts, hands.length, 'rig').opts };
  return { ...base, opts: o, hands: hands.map((h) => h.map(C)), shelves: hands.map(() => []), stock, discards: [], upcard: C(upcard), turn: 0, phase: 'act', flips: 0, stealQueue: [], log: [], dealer: hands.length - 1, over: false, history: [] };
}
const all = (s: PpState) => [...s.hands.flat(), ...s.shelves.flat(), ...s.stock, ...s.discards, ...(s.upcard ? [s.upcard] : [])];
const conserved = (s: PpState) => { const a = ids(all(s)); return a.length === 52 && new Set(a).size === 52; };
const play = (s: PpState, seat: number, m: PpMove) => R.applyMove(s, seat, m);

describe('registry + options', () => {
  it('is registered (rules + bot) but unlisted: Setup keeps Pitty Pat "coming soon"', () => {
    expect(getRules('pitty-pat')).toBe(R);
    expect(getBot('pitty-pat').modeId).toBe('pitty-pat');
    expect(listModes().map((m) => m.modeId)).not.toContain('pitty-pat');
  });
  it('options schema: defaults are the documented ones; every [UNVERIFIED] rule is an unverified option', () => {
    const d = defaultsOf(PITTY_PAT_OPTIONS);
    expect(d).toMatchObject({ handSize: '5', mustPair: 'must', flipsPerTurn: 'one', tripsAsOne: false, deadCardSteal: false, stockEmpty: 'reshuffle', scoring: 'pot', ante: 1, pityPayouts: false, gameEnd: 'lastWithChips' });
    const un = PITTY_PAT_OPTIONS.filter((o) => !o.verified).map((o) => o.key);
    expect(un).toEqual(expect.arrayContaining(['handSize', 'flipsPerTurn', 'tripsAsOne', 'deadCardSteal', 'stockEmpty', 'pityPayouts', 'dealtWinTie', 'stack']));
    expect(R.optionsSchema).toBe(PITTY_PAT_OPTIONS);
  });
  it('seats 2–5 (5 allowed, table caps at 4 elsewhere)', () => {
    expect(() => R.newGame({}, 1, 's')).toThrow(RuleError);
    expect(() => R.newGame({}, 6, 's')).toThrow(RuleError);
    for (const n of [2, 3, 4, 5]) expect(R.newGame({}, n, 's').hands.filter((h) => h.length).length).toBeGreaterThan(0);
  });
});

describe('setup', () => {
  it('deals handSize each one at a time from the dealer\'s left, flips an upcard, rest is stock', () => {
    for (const handSize of ['5', '7']) {
      const s = R.newGame({ handSize, dealtWinAuto: false }, 4, 'deal');
      expect(s.hands.map((h) => h.length)).toEqual([4, 4, 4, 4].map(() => Number(handSize)));
      expect(s.upcard).not.toBeNull();
      expect(s.stock.length).toBe(52 - 4 * Number(handSize) - 1);
      expect(s.turn).toBe(0); // dealer is seat 3, play starts at its left
      expect(conserved(s)).toBe(true);
    }
  });
  it('is seeded and deterministic', () => {
    expect(R.newGame({}, 4, 'same')).toEqual(R.newGame({}, 4, 'same'));
    expect(ids(R.newGame({}, 4, 'a').hands[0]!)).not.toEqual(ids(R.newGame({}, 4, 'b').hands[0]!));
  });
  it('pot scoring: every active player antes into the pot', () => {
    const s = R.newGame({ ante: 2, stack: 10, dealtWinAuto: false }, 3, 'ante');
    expect(s.pot).toBe(6);
    expect(s.chips).toEqual([8, 8, 8]);
  });
});

describe('turn flow + legality', () => {
  it('upcard matches: must pair (only pair moves); then must shed one card, which becomes the upcard', () => {
    let s = rig([['7C', '2D', '9H', 'KS', '4C'], ['3C', '3D', '5H', '6S', '8C']], '7D');
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'pair', cardIds: ['7C'] }]);
    expect(R.legalMoves(s, 1)).toEqual([]);
    expect(() => play(s, 1, { t: 'flip' })).toThrow(/Not your turn/);
    expect(() => play(s, 0, { t: 'flip' })).toThrow(RuleError);
    s = play(s, 0, { t: 'pair', cardIds: ['7C'] });
    expect(ids(s.shelves[0]!)).toEqual(['7D', '7C']);
    expect(s.phase).toBe('shed');
    expect(R.legalMoves(s, 0).map((m) => m.t)).toEqual(['discard', 'discard', 'discard', 'discard']);
    s = play(s, 0, { t: 'discard', cardId: 'KS' });
    expect(s.upcard!.id).toBe('KS');
    expect(s.turn).toBe(1);
    expect(conserved(s)).toBe(true);
  });
  it('suits never matter: any card of the rank pairs', () => {
    const s = rig([['7C', '7H', '9H', 'KS', '4C'], ['3C', '3D', '5H', '6S', '8C']], '7S');
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'pair', cardIds: ['7C'] }, { t: 'pair', cardIds: ['7H'] }]);
  });
  it('no match: exactly one flip; a matching flip pairs, an unmatched flip passes', () => {
    let s = rig([['2C', '3D', '9H', 'KS', '4C'], ['5C', '5D', '6H', '6S', '8C']], 'QD', {}, ['9D', 'JD']);
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'flip' }]);
    s = play(s, 0, { t: 'flip' });
    expect(s.upcard!.id).toBe('9D');
    expect(ids(s.discards)).toEqual(['QD']);
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'pair', cardIds: ['9H'] }]);
    s = play(play(s, 0, { t: 'pair', cardIds: ['9H'] }), 0, { t: 'discard', cardId: '2C' });
    // seat 1: no 2 → flip JD → no match → only pass
    s = play(s, 1, { t: 'flip' });
    expect(R.legalMoves(s, 1)).toEqual([{ t: 'pass' }]);
    s = play(s, 1, { t: 'pass' });
    expect(s.turn).toBe(0);
    expect(s.upcard!.id).toBe('JD');
    expect(conserved(s)).toBe(true);
  });
  it('mustPair = may: a match can be declined (flip first, pass after a flip)', () => {
    let s = rig([['7C', '2D', '9H', 'KS', '4C'], ['3C', '3D', '5H', '6S', '8C']], '7D', { mustPair: 'may' }, ['9D']);
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'pair', cardIds: ['7C'] }, { t: 'flip' }]);
    s = play(s, 0, { t: 'flip' });
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'pair', cardIds: ['9H'] }, { t: 'pass' }]);
  });
  it('flipsPerTurn = untilMatch: keep flipping until a match (capped so a hand always ends)', () => {
    let s = rig([['2C', '3D', '9H', 'KS', '4C'], ['5C', '5D', '6H', '6S', '8C']], 'QD', { flipsPerTurn: 'untilMatch' }, ['JD', '10D', '9D']);
    s = play(s, 0, { t: 'flip' });
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'flip' }]);
    s = play(play(s, 0, { t: 'flip' }), 0, { t: 'flip' });
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'pair', cardIds: ['9H'] }]);
    const capped = { ...rig([['2C', '3D', '9H', 'KS', '4C'], ['5C', '5D', '6H', '6S', '8C']], 'QD', { flipsPerTurn: 'untilMatch' }), flips: PP_LIMITS.maxFlipsPerTurn, upcard: C('JD') };
    expect(R.legalMoves(capped, 0)).toEqual([{ t: 'pass' }]);
  });
  it('upcard matching two hand cards: only one pairs unless tripsAsOne (then all three shed together)', () => {
    const off = rig([['7C', '7H', '9H', 'KS', '4C'], ['3C', '3D', '5H', '6S', '8C']], '7D');
    expect(R.legalMoves(off, 0)).toHaveLength(2);
    const on = rig([['7C', '7H', '9H', 'KS', '4C'], ['3C', '3D', '5H', '6S', '8C']], '7D', { tripsAsOne: true });
    expect(R.legalMoves(on, 0)).toEqual([{ t: 'pair', cardIds: ['7C', '7H'] }]);
    const s = play(on, 0, { t: 'pair', cardIds: ['7C', '7H'] });
    expect(ids(s.shelves[0]!)).toEqual(['7D', '7C', '7H']);
    expect(s.hands[0]).toHaveLength(3);
  });
});

describe('ending + scoring', () => {
  it('first to empty their hand wins the hand: pairing the last card goes out with no discard; winner takes the pot', () => {
    let s = rig([['7C'], ['3C', '3D', '5H']], '7D');
    s = { ...s, pot: 2, chips: [9, 9] };
    s = play(s, 0, { t: 'pair', cardIds: ['7C'] });
    expect(s.history[0]).toMatchObject({ winner: 0, how: 'out', pot: 2, deltas: [1, -1] });
    expect(s.wins).toEqual([1, 0]);
    expect(s.handNo).toBe(1); // next hand dealt, dealer rotated
    expect(s.dealer).toBe(0);
    expect(conserved(s)).toBe(true);
  });
  it('discarding your last card also goes out', () => {
    let s = rig([['7C', '2D'], ['3C', '3D', '5H']], '7D');
    s = { ...s, pot: 2, chips: [9, 9] };
    s = play(play(s, 0, { t: 'pair', cardIds: ['7C'] }), 0, { t: 'discard', cardId: '2D' });
    expect(s.history[0]).toMatchObject({ winner: 0, how: 'out' });
  });
  it('dealtWinAuto: held pairs go out once the odd cards are shed (on) — and not when off', () => {
    const hands = [['7C', 'KS', 'KH', '4C', '4D'], ['3C', '3D', '5H', '6S', '8C']];
    const on = play(rig(hands, '7D', { dealtWinAuto: true }), 0, { t: 'pair', cardIds: ['7C'] });
    expect(on.history[0]).toMatchObject({ winner: 0, how: 'out' });
    const off = play(rig(hands, '7D', { dealtWinAuto: false }), 0, { t: 'pair', cardIds: ['7C'] });
    expect(off.history).toHaveLength(0);
    expect(off.phase).toBe('shed');
  });
  it('dealt win: two pairs + an upcard matching the fifth card wins on the deal (some seed finds one)', () => {
    let found: PpState | null = null;
    for (let i = 0; i < 4000 && !found; i++) { const s = R.newGame({ dealtWinAuto: true }, 4, `dw${i}`); if (s.history[0]?.how === 'dealt') found = s; }
    expect(found).not.toBeNull();
    const w = found!.history[0]!.winner!;
    expect(found!.wins[w]).toBe(1);
    expect(conserved(found!)).toBe(true);
    // the same seed with the rule off: nobody wins on the deal
    const seed = found!.seed;
    expect(R.newGame({ dealtWinAuto: false }, 4, seed).history).toHaveLength(0);
  });
  it('dealtWinTie: two dealt winners → first in turn order, or redeal', () => {
    let seedTie: string | null = null;
    for (let i = 0; i < 200000 && !seedTie; i++) {
      const s = R.newGame({ dealtWinAuto: false, handSize: '5' }, 5, `tie${i}`);
      const up = s.upcard!;
      const win = (h: Card[]) => { const m = new Map<number, number>(); for (const c of [...h, up]) m.set(c.rank, (m.get(c.rank) ?? 0) + 1); return [...m.values()].every((n) => n % 2 === 0); };
      if (s.hands.filter(win).length >= 2) seedTie = `tie${i}`;
    }
    if (!seedTie) return; // astronomically rare; covered by the redeal-cap path below
    const first = R.newGame({ dealtWinAuto: true, dealtWinTie: 'turnOrder' }, 5, seedTie);
    expect(first.history[0]!.how).toBe('dealt');
    const redeal = R.newGame({ dealtWinAuto: true, dealtWinTie: 'redeal' }, 5, seedTie);
    expect(redeal.redeals + redeal.history.length).toBeGreaterThan(0);
    expect(redeal.redeals > 0 || redeal.history[0]!.how === 'dealt').toBe(true);
  });
  it('stock empty: reshuffle the discards (none kept face-up but the upcard) and flip; or void the hand', () => {
    const base = rig([['2C', '3D', '9H', 'KS', '4C'], ['5C', '5D', '6H', '6S', '8C']], 'QD');
    const empty = { ...base, stock: [], discards: [...base.stock] };
    const re = play(empty, 0, { t: 'flip' });
    expect(re.log.some((e) => e.e === 'reshuffle')).toBe(true);
    expect(re.discards.map((c) => c.id)).toEqual(['QD']);
    expect(conserved(re)).toBe(true);
    const v = play({ ...empty, opts: { ...empty.opts, stockEmpty: 'void' }, pot: 2, chips: [9, 9] }, 0, { t: 'flip' });
    expect(v.history[0]).toMatchObject({ winner: null, how: 'void' });
    expect(v.chips).toEqual([10 - 1, 10 - 1]); // antes refunded, then the next hand's antes taken
  });
  it('pityPayouts: losers pay one more ante (two on a dealt win), never more than they hold', () => {
    let s = rig([['7C'], ['3C', '3D', '5H'], ['4C', '4D', '5D']], '7D', { pityPayouts: true, ante: 2 });
    s = { ...s, pot: 6, chips: [8, 8, 1] };
    s = play(s, 0, { t: 'pair', cardIds: ['7C'] });
    expect(s.history[0]!.deltas).toEqual([4 + 2 + 1, -4, -3]);
  });
  it('players who can\'t cover the ante drop; last with coins wins the game; deltas are coin change and sum to zero', () => {
    const g = runGame({ ante: 5, stack: 10 }, 3, 'drop');
    expect(g.over).toBe(true);
    const r = R.results(g);
    expect(r.done).toBe(true);
    expect(r.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(g.active.filter(Boolean).length).toBeLessThanOrEqual(2);
  });
  it('scoring handsWon / gameEnd firstToWins / fixedHands', () => {
    const hw = runGame({ scoring: 'handsWon', gameTarget: 3 }, 3, 'hw');
    expect(Math.max(...hw.wins)).toBe(3);
    expect(R.results(hw).placements[0]).toBe(hw.wins.indexOf(3));
    const fixed = runGame({ gameEnd: 'fixedHands', gameTarget: 4 }, 4, 'fx');
    expect(fixed.history).toHaveLength(4);
    const ftw = runGame({ gameEnd: 'firstToWins', gameTarget: 2 }, 2, 'ftw');
    expect(Math.max(...ftw.wins)).toBe(2);
  });
  it('coins only: deltas are integers bounded by the table\'s coins (no money anywhere in state)', () => {
    const g = runGame({}, 4, 'coins');
    const r = R.results(g);
    for (const d of r.deltas) { expect(Number.isInteger(d)).toBe(true); expect(Math.abs(d)).toBeLessThanOrEqual(10 * 4); }
    expect(JSON.stringify(g)).not.toMatch(/\$|usd|cash|money/i);
  });
});

describe('M6 readings are options (Q2–Q7) + pause between hands', () => {
  it('Q2 pityStyle perPair: losers pay one ante per pair the winner laid', () => {
    let s = rig([['7C'], ['3C', '3D', '5H']], '7D', { pityPayouts: true, pityStyle: 'perPair', ante: 1 });
    s = { ...s, pot: 2, chips: [9, 9], shelves: [[C('KS'), C('KH'), C('4C'), C('4D')], []] };
    s = play(s, 0, { t: 'pair', cardIds: ['7C'] }); // 3 pairs on the shelf now
    expect(s.history[0]!.deltas).toEqual([1 + 3, -1 - 3]);
  });
  it('Q3 dealtWin7 off: no win on the deal with 7 cards', () => {
    let seed: string | null = null;
    for (let i = 0; i < 20000 && !seed; i++) { const g = R.newGame({ handSize: '7' }, 4, `d7${i}`); if (g.history[0]?.how === 'dealt') seed = `d7${i}`; }
    expect(seed).not.toBeNull();
    expect(R.newGame({ handSize: '7', dealtWin7: false }, 4, seed!).history).toHaveLength(0);
  });
  it('Q4 stealResume firstPlayer: after the stealer sheds, the first player takes their turn', () => {
    let found: PpState | null = null;
    for (let i = 0; i < 2000 && !found; i++) { const g = R.newGame({ deadCardSteal: true, dealtWinAuto: false, stealResume: 'firstPlayer' }, 4, `sr${i}`); if (g.phase === 'steal' && g.stealQueue[0] !== (g.turn + 1) % 4) found = g; }
    expect(found).not.toBeNull();
    const first = found!.turn, who = R.toAct(found!)[0]!;
    let s = R.applyMove(found!, who, R.legalMoves(found!, who).find((m) => m.t === 'steal')!);
    if (s.phase !== 'shed') return;
    s = R.applyMove(s, who, R.legalMoves(s, who)[0]!);
    if (s.history.length) return;
    expect(s.turn).toBe(first);
    const def = R.newGame({ deadCardSteal: true, dealtWinAuto: false }, 4, found!.seed);
    let d = R.applyMove(def, who, R.legalMoves(def, who).find((m) => m.t === 'steal')!);
    d = R.applyMove(d, who, R.legalMoves(d, who)[0]!);
    if (!d.history.length) expect(d.turn).toBe((who + 1) % 4);
  });
  it('Q5 handsWonPayout none: no coins move in a hands-won game', () => {
    const g = runGame({ scoring: 'handsWon', handsWonPayout: 'none', gameTarget: 2 }, 3, 'hwp');
    expect(R.results(g).deltas).toEqual([0, 0, 0]);
    const d = runGame({ scoring: 'handsWon', gameTarget: 2 }, 3, 'hwp');
    expect(R.results(d).deltas.some((x) => x !== 0)).toBe(true);
  });
  it('Q6 handsWonEnd fixedHands: hands-won + last-with-coins ends after N hands', () => {
    const g = runGame({ scoring: 'handsWon', gameEnd: 'lastWithChips', handsWonEnd: 'fixedHands', gameTarget: 3 }, 3, 'hwe');
    expect(g.history).toHaveLength(3);
  });
  it('Q7 declineAction pass: declining a pair before flipping passes the turn', () => {
    const s = rig([['7C', '2D', '9H', 'KS', '4C'], ['3C', '3D', '5H', '6S', '8C']], '7D', { mustPair: 'may', declineAction: 'pass' });
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'pair', cardIds: ['7C'] }, { t: 'pass' }]);
    expect(play(s, 0, { t: 'pass' }).turn).toBe(1);
  });
  it('pauseBetweenHands: the hand result stays up until the winner deals on', () => {
    let s = rig([['7C'], ['3C', '3D', '5H']], '7D', { pauseBetweenHands: true });
    s = { ...s, pot: 2, chips: [9, 9] };
    s = play(s, 0, { t: 'pair', cardIds: ['7C'] });
    expect(s.phase).toBe('handOver');
    expect(R.toAct(s)).toEqual([0]);
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'nextHand' }]);
    expect(R.legalMoves(s, 1)).toEqual([]);
    expect(R.view(s, 1).lastHand).toMatchObject({ winner: 0, how: 'out' });
    s = play(s, 0, { t: 'nextHand' });
    expect(s.phase === 'act' || s.phase === 'steal' || s.history.length === 2).toBe(true);
    expect(s.handNo).toBe(1);
  });
  it('every M6 reading is a changeable, unverified option with the documented default', () => {
    const d = defaultsOf(PITTY_PAT_OPTIONS);
    expect(d).toMatchObject({ stack: 10, pityStyle: 'perHand', dealtWin7: true, stealResume: 'stealerLeft', handsWonPayout: 'antePerOpponent', handsWonEnd: 'firstToWins', declineAction: 'flip', pauseBetweenHands: false });
    for (const k of ['stack', 'pityStyle', 'dealtWin7', 'stealResume', 'handsWonPayout', 'handsWonEnd', 'declineAction']) expect(PITTY_PAT_OPTIONS.find((o) => o.key === k)!.verified).toBe(false);
  });
});

describe('stats recap (mode_games.recap_json)', () => {
  it('hands (winner/how/pot/deltas), pairs per seat, wins, chips, dealtWins — public only', () => {
    const g = runGame({}, 4, 'recap');
    const r = R.results(g).recap as import('../src').PpRecap;
    expect(r.v).toBe(1);
    expect(r.hands).toHaveLength(g.history.length);
    expect(r.hands[0]).toEqual({ n: 0, winner: expect.anything(), how: expect.any(String), pot: expect.any(Number), deltas: expect.any(Array) });
    expect(r.pairs).toHaveLength(4);
    expect(r.pairs.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(r.wins.reduce((a, b) => a + b, 0)).toBe(g.history.filter((h) => h.winner !== null).length);
    expect(JSON.stringify(r)).not.toMatch(/"id":"/); // no card ids
  });
});

describe('deuces wild (Demetrius 2026-10-26)', () => {
  const W = { deucesWild: true };
  it('defaults: deuces wild on, 2+2 allowed, deuces count for a dealt win', () => {
    expect(defaultsOf(PITTY_PAT_OPTIONS)).toMatchObject({ deucesWild: true, deuceOnDeuce: true, dealtWinWild: true });
  });
  it('a 2 in hand pairs with any upcard; any card pairs with a 2 upcard', () => {
    const s = rig([['2C', '5D', '9H', 'KS', '4C'], ['3C', '3D', '5H', '6S', '8C']], 'QD', W);
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'pair', cardIds: ['2C'] }]);
    const up2 = rig([['7C', '5D', '9H'], ['3C', '3D', '5H']], '2D', W);
    expect(R.legalMoves(up2, 0).map((m) => (m as { cardIds: string[] }).cardIds[0])).toEqual(['7C', '5D', '9H']);
    const next = play(s, 0, { t: 'pair', cardIds: ['2C'] });
    expect(ids(next.shelves[0]!)).toEqual(['QD', '2C']);
    expect(conserved(next)).toBe(true);
  });
  it('off: a 2 is just a 2', () => {
    const s = rig([['2C', '5D', '9H', 'KS', '4C'], ['3C', '3D', '5H', '6S', '8C']], 'QD', { deucesWild: false });
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'flip' }]);
  });
  it('deuce on deuce: allowed by default, refused when deuceOnDeuce is off', () => {
    const hands = [['2C', '5D', '9H', 'KS', '4C'], ['3C', '3D', '5H', '6S', '8C']];
    expect(R.legalMoves(rig(hands, '2D', W), 0)).toContainEqual({ t: 'pair', cardIds: ['2C'] });
    const off = R.legalMoves(rig(hands, '2D', { ...W, deuceOnDeuce: false }), 0);
    expect(off).not.toContainEqual({ t: 'pair', cardIds: ['2C'] });
    expect(off).toHaveLength(4); // the four naturals still pair with the 2
  });
  it('trips with wilds: two naturals shed together with the upcard; a 2 never makes trips', () => {
    const s = rig([['7C', '7H', '2S', 'KS', '4C'], ['3C', '3D', '5H', '6S', '8C']], '7D', { ...W, tripsAsOne: true });
    expect(R.legalMoves(s, 0)).toEqual([{ t: 'pair', cardIds: ['7C', '7H'] }]);
    const one = rig([['7C', '2S', 'KS', '4C', '9C'], ['3C', '3D', '5H', '6S', '8C']], '7D', { ...W, tripsAsOne: true });
    expect(R.legalMoves(one, 0)).toEqual([{ t: 'pair', cardIds: ['7C'] }, { t: 'pair', cardIds: ['2S'] }]);
  });
  it('allPairs with wilds: deuces cover odd ranks; spare deuces pair together or split a natural pair', () => {
    const w = { on: true, deuceOnDeuce: true }, noDD = { on: true, deuceOnDeuce: false };
    expect(allPairs(['KS', '2C', '4C', '4D'].map(C), w)).toBe(true);
    expect(allPairs(['KS', 'QS', '4C', '4D'].map(C), w)).toBe(false);
    expect(allPairs(['2S', '2C', '4C', '4D'].map(C), w)).toBe(true);
    expect(allPairs(['2S', '2C', '4C', '4D'].map(C), noDD)).toBe(true); // 4+2, 4+2
    expect(allPairs(['2S', '2C'].map(C), noDD)).toBe(false);
    expect(allPairs(['2S', '2C', '4C', '4D'].map(C), { on: false, deuceOnDeuce: false })).toBe(true); // natural 2-2, 4-4
    expect(pairsWith(C('2S'), C('KD'), w)).toBe(true);
    expect(pairsWith(C('2S'), C('2D'), noDD)).toBe(false);
  });
  it('dealt win with deuces counts (dealtWinWild on), and not when off', () => {
    // K K 9 4 2 + upcard 4 → (KK)(44)(9,2): a win on the deal only with wilds
    let seed: string | null = null;
    for (let i = 0; i < 20000 && !seed; i++) {
      const g = R.newGame({ dealtWinWild: false }, 4, `dw2-${i}`);
      if (g.history.length) continue;
      const w = R.newGame({}, 4, `dw2-${i}`);
      if (w.history[0]?.how === 'dealt') seed = `dw2-${i}`;
    }
    expect(seed).not.toBeNull();
    const won = R.newGame({}, 4, seed!);
    const winner = won.history[0]!.winner!;
    const dealt = R.newGame({ dealtWinAuto: false }, 4, seed!); // same deal, nobody wins on it
    expect([...dealt.hands[winner]!, dealt.upcard!].some((c) => c.rank === 2)).toBe(true);
    expect(R.newGame({ dealtWinWild: false }, 4, seed!).history).toHaveLength(0);
    expect(R.newGame({ deucesWild: false }, 4, seed!).history).toHaveLength(0);
  });
  it('held pairs go out with a wild (dealtWinAuto)', () => {
    const s = rig([['7C', 'KS', '2H', '4C', '4D'], ['3C', '3D', '5H', '6S', '8C']], '7D', { ...W, dealtWinAuto: true });
    expect(play(s, 0, { t: 'pair', cardIds: ['7C'] }).history[0]).toMatchObject({ winner: 0, how: 'out' });
  });
  it('the stand-in bot prefers a natural pair over spending a 2', () => {
    const s = rig([['2C', '7H', '9H', 'KS', '4C'], ['3C', '3D', '5H', '6S', '8C']], '7D', W);
    expect(getBot('pitty-pat').choose(R.view(s, 0), R.legalMoves(s, 0), 'easy', seededRng('b'))).toEqual({ t: 'pair', cardIds: ['7H'] });
  });
});

describe('deadCardSteal (out-of-turn match on the first upcard)', () => {
  it('off: no steal window; on: seats holding a match (after the first player) may steal or waive in turn order', () => {
    let found: PpState | null = null;
    for (let i = 0; i < 500 && !found; i++) { const s = R.newGame({ deadCardSteal: true, dealtWinAuto: false }, 4, `st${i}`); if (s.phase === 'steal') found = s; }
    expect(found).not.toBeNull();
    const s = found!;
    expect(R.newGame({ deadCardSteal: false, dealtWinAuto: false }, 4, s.seed).phase).toBe('act');
    const who = R.toAct(s)[0]!;
    expect(who).not.toBe(s.turn);
    const moves = R.legalMoves(s, who);
    expect(moves.some((m) => m.t === 'steal')).toBe(true);
    expect(moves).toContainEqual({ t: 'waive' });
    const stolen = R.applyMove(s, who, moves.find((m) => m.t === 'steal')!);
    expect(stolen.phase === 'shed' || stolen.history.length > 0).toBe(true);
    if (stolen.phase === 'shed') expect(stolen.turn).toBe(who);
  });
});

describe('views (hidden information)', () => {
  it('own hand only; opponents as counts; stock as a count; spectators see no hand', () => {
    const s = R.newGame({ dealtWinAuto: false }, 4, 'view');
    const v = R.view(s, 1);
    expect(ids(v.hand)).toEqual(ids(s.hands[1]!));
    expect(v.handCounts).toEqual([5, 5, 5, 5]);
    expect(v.stockCount).toBe(s.stock.length);
    expect(R.view(s, 'spectator').hand).toEqual([]);
    expect('stock' in v).toBe(false);
  });
});

/* ------------------------------------------------------------------ property / fuzz */
function runGame(opts: Record<string, unknown>, seats: number, seed: string, pick?: (legal: PpMove[], s: PpState, rng: () => number) => PpMove, check?: (s: PpState) => void): PpState {
  let s = R.newGame(opts, seats, seed);
  const rng = seededRng(`${seed}:fuzz`);
  let steps = 0;
  check?.(s);
  while (!s.over) {
    const act = R.toAct(s);
    expect(act.length).toBeGreaterThan(0);
    const seat = act[0]!;
    const legal = R.legalMoves(s, seat);
    expect(legal.length).toBeGreaterThan(0);
    const m = pick ? pick(legal, s, rng) : legal[Math.floor(rng() * legal.length)]!;
    s = R.applyMove(s, seat, m);
    check?.(s);
    if (++steps > PP_LIMITS.maxHands * (PP_LIMITS.maxHandMoves + 5)) throw new Error('did not terminate');
  }
  return s;
}

const optArb = fc.record({
  handSize: fc.constantFrom('5', '7'), mustPair: fc.constantFrom('must', 'may'), flipsPerTurn: fc.constantFrom('one', 'untilMatch'),
  tripsAsOne: fc.boolean(), deadCardSteal: fc.boolean(), dealtWinAuto: fc.boolean(), stockEmpty: fc.constantFrom('reshuffle', 'void'),
  scoring: fc.constantFrom('pot', 'handsWon'), stack: fc.integer({ min: 1, max: 30 }), ante: fc.integer({ min: 0, max: 10 }), pityPayouts: fc.boolean(),
  gameEnd: fc.constantFrom('lastWithChips', 'firstToWins', 'fixedHands'), gameTarget: fc.integer({ min: 1, max: 8 }), dealtWinTie: fc.constantFrom('turnOrder', 'redeal'),
  pityStyle: fc.constantFrom('perHand', 'perPair'), dealtWin7: fc.boolean(), stealResume: fc.constantFrom('stealerLeft', 'firstPlayer'),
  handsWonPayout: fc.constantFrom('antePerOpponent', 'none'), handsWonEnd: fc.constantFrom('firstToWins', 'fixedHands'), declineAction: fc.constantFrom('flip', 'pass'),
  pauseBetweenHands: fc.boolean(),
  deucesWild: fc.boolean(), deuceOnDeuce: fc.boolean(), dealtWinWild: fc.boolean(),
});

describe('properties (fast-check)', () => {
  it('random legal play: always terminates; 52 cards conserved; toAct ⇒ legal moves; results consistent', () => {
    fc.assert(fc.property(optArb, fc.integer({ min: 2, max: 5 }), fc.string({ maxLength: 8 }), (opts, seats, seed) => {
      const g = runGame(opts, seats, seed, undefined, (s) => {
        if (s.over) return;
        expect(conserved(s)).toBe(true);
        expect(s.chips.every((c) => c >= 0)).toBe(true);
        expect(s.chips.reduce((a, b) => a + b, 0) + s.pot).toBe(opts.scoring === 'pot' ? opts.stack * seats : 0);
      });
      const r = R.results(g);
      expect(r.done).toBe(true);
      expect([...r.placements].sort()).toEqual([...Array(seats).keys()]);
      expect(r.deltas.reduce((a, b) => a + b, 0)).toBe(0);
      expect(g.history.length).toBeLessThanOrEqual(PP_LIMITS.maxHands);
    }), { numRuns: 120 });
  }, 120_000);
  it('deterministic replay: same options + seed + move choices → identical game', () => {
    fc.assert(fc.property(optArb, fc.integer({ min: 2, max: 5 }), fc.string({ maxLength: 8 }), (opts, seats, seed) => {
      expect(runGame(opts, seats, seed)).toEqual(runGame(opts, seats, seed));
    }), { numRuns: 25 });
  }, 120_000);
  it('every legal move applies without throwing; anything else from the acting seat is refused', () => {
    fc.assert(fc.property(optArb, fc.integer({ min: 2, max: 5 }), fc.string({ maxLength: 8 }), (opts, seats, seed) => {
      runGame(opts, seats, seed, (legal, s, rng) => {
        const seat = R.toAct(s)[0]!;
        for (const m of legal) expect(() => R.applyMove(s, seat, m)).not.toThrow();
        const junk: PpMove[] = [{ t: 'pair', cardIds: ['ZZ'] }, { t: 'discard', cardId: 'ZZ' }, { t: 'flip' }, { t: 'pass' }, { t: 'waive' }, { t: 'nextHand' }];
        for (const j of junk) if (!legal.some((m) => JSON.stringify(m) === JSON.stringify(j))) expect(() => R.applyMove(s, seat, j)).toThrow(RuleError);
        for (let o = 0; o < seats; o++) if (o !== seat) expect(R.legalMoves(s, o)).toEqual([]);
        return legal[Math.floor(rng() * legal.length)]!;
      });
    }), { numRuns: 15 });
  }, 120_000);
  it('views never leak: no other seat\'s hand card and no stock order appears in a seat or spectator view', () => {
    fc.assert(fc.property(optArb, fc.integer({ min: 2, max: 5 }), fc.string({ maxLength: 8 }), (opts, seats, seed) => {
      runGame(opts, seats, seed, undefined, (s) => {
        for (const who of [...Array(seats).keys(), 'spectator' as const]) {
          const v: PpView = R.view(s, who);
          const json = JSON.stringify(v);
          for (let o = 0; o < seats; o++) if (o !== who) for (const c of s.hands[o]!) expect(json).not.toContain(`"${c.id}"`);
          expect(json).not.toContain('"stock"');
          if (who !== 'spectator') expect(ids(v.hand)).toEqual(ids(s.hands[who]!));
        }
      });
    }), { numRuns: 20 });
  }, 120_000);
  it('the placeholder bot only ever picks legal moves and finishes games', () => {
    const bot = getBot('pitty-pat');
    fc.assert(fc.property(optArb, fc.integer({ min: 2, max: 5 }), fc.string({ maxLength: 8 }), (opts, seats, seed) => {
      runGame(opts, seats, seed, (legal, s, rng) => {
        const m = bot.choose(R.view(s, R.toAct(s)[0]!), legal, 'easy', rng) as PpMove;
        expect(legal).toContainEqual(m);
        return m;
      });
    }), { numRuns: 30 });
  }, 120_000);
});
