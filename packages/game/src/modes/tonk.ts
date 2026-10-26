/**
 * Mode B — Tonk (spreads), Pagat base. docs/plan/RULES.md "Mode B" is the spec; every [UNVERIFIED] rule is a
 * setup option (TONK_OPTIONS) with the documented default. Milestone 8a: the engine core (registered, unlisted).
 *
 * One game = a series of hands. Each hand: deal `handSize` from the dealer's left, turn one card up as the
 * discard pile, rest is the stock. A turn:
 *   START  → drop (show your count) | draw from the stock | take the top discard
 *   MELD   → spread (book 3+ same rank / run 3+ same suit in sequence)* , hit (add to any spread)* → discard
 * Empty your hand by spreading/hitting = Tonk (+2 from each); by discarding the last card = out (+1 from each).
 * Drop: strictly lowest count wins +1 from each; caught (anyone ≤ dropper) → dropper pays caughtPenalty to each
 * player at or below them, and (caughtLowestCollects) the lowest also collects 1 from the rest.
 * Stock empty after a turn → lowest count +1 from each (a tie for lowest voids the hand), or void (option).
 * Dealt 49/50 (instantWin) → +2 from each; two or more such hands → redeal.
 *
 * POINTS are the score (zero-sum payouts, 1 stake = 1 point). Coins are optional (coinStakes): at game end each
 * point moves `stake` PLAY coins. Never real money.
 * Pure and deterministic: every shuffle comes from seededRng(`${seed}:hand…:deal…`).
 */
import { type Card, type Suit, buildDeck, countValue } from '../cards';
import { type OptionValues, validateOptions } from '../options';
import { type BotStrategy, type Results, type RuleSet, RuleError } from '../registry';
import { deal, seededRng, shuffle } from '../rng';
import { TONK_OPTIONS } from './schemas';
import { bestMelds, minDeadwood } from './tonkSolver';

export interface TkOptions {
  handSize: number;
  instantWin: '49-50' | '50-or-11' | 'off';
  aces: 'low' | 'lowOrHigh';
  allowDrop: boolean;
  caughtPenalty: number;
  hitLock: boolean;
  slap: boolean;
  wilds: 'none' | 'jokers' | 'deuces';
  spreadBeforeDrop: boolean;
  noDiscardPickup: boolean;
  stockOut: 'lowestWins' | 'void';
  caughtLowestCollects: boolean;
  gameEnd: 'firstToPoints' | 'fixedHands';
  gameTarget: number;
  gameHands: number;
  coinStakes: boolean;
  stake: number;
  pauseBetweenHands: boolean;
}

export interface Spread {
  id: number;
  owner: number;
  kind: 'book' | 'run';
  /** book: the rank; run: the suit + covered values lo..hi (ace high = 14) */
  rank?: number;
  suit?: Suit;
  lo?: number;
  hi?: number;
  /** run: in order lo..hi (wilds stand where they sit) */
  cards: Card[];
}

export type TkMove =
  | { t: 'drop' }
  | { t: 'drawStock' }
  | { t: 'drawDiscard' }
  | { t: 'spread'; cardIds: string[] }
  | { t: 'hit'; cardId: string; spreadId: number }
  | { t: 'discard'; cardId: string }
  | { t: 'slap'; spreadId: number }
  | { t: 'waive' }
  | { t: 'nextHand' };

export type TkEvent =
  | { e: 'deal'; hand: number; dealer: number; up: Card }
  | { e: 'redeal'; why: 'instantTie' }
  | { e: 'draw'; seat: number; from: 'stock' | 'discard'; card?: Card }
  | { e: 'spread'; seat: number; spreadId: number; cards: Card[] }
  | { e: 'hit'; seat: number; spreadId: number; card: Card }
  | { e: 'discard'; seat: number; card: Card }
  | { e: 'slap'; seat: number; spreadId: number; card: Card }
  | { e: 'waive'; seat: number }
  | { e: 'drop'; seat: number; count: number }
  | { e: 'end'; how: TkHandEnd['how']; winner: number | null };

export interface TkHandEnd {
  hand: number;
  winner: number | null;
  how: 'instant' | 'tonk' | 'out' | 'drop' | 'caught' | 'stockOut' | 'void';
  /** the dropper on drop/caught */
  dropper: number | null;
  /** hand counts shown at the end (cards left in hand, spreads excluded) */
  counts: number[];
  /** points change per seat this hand (zero-sum) */
  deltas: number[];
}

export interface TkState {
  opts: TkOptions;
  seed: string;
  seats: number;
  points: number[];
  handNo: number;
  dealer: number;
  redeals: number;
  over: boolean;
  history: TkHandEnd[];
  hands: Card[][];
  stock: Card[];
  /** face-up pile, top = last */
  discards: Card[];
  spreads: Spread[];
  nextSpreadId: number;
  turn: number;
  phase: 'start' | 'meld' | 'slap' | 'slapShed' | 'handOver';
  /** public: the discard taken this turn (noDiscardPickup) */
  pickedUp: Card | null;
  /** hitLock: seat's next turn is locked (no spread, no drop) */
  lockNext: boolean[];
  /** the current turn is locked */
  lockedNow: boolean;
  slapQueue: number[];
  /** who discarded the card being slapped (play resumes to their left) */
  slapFrom: number | null;
  ackSeat: number | null;
  handMoves: number;
  log: TkEvent[];
  /** recap tallies */
  tonks: number[];
  drops: number[];
  caught: number[];
}

export interface TkView {
  seat: number | 'spectator';
  hand: Card[];
  handCounts: number[];
  spreads: Spread[];
  discardTop: Card | null;
  discardCount: number;
  stockCount: number;
  /** MAIN SCORE */
  points: number[];
  gameTarget: number;
  handNo: number;
  dealer: number;
  turn: number | null;
  phase: TkState['phase'] | 'over';
  pickedUp: Card | null;
  lockedNow: boolean;
  lockNext: boolean[];
  lastHand: TkHandEnd | null;
  log: TkEvent[];
  options: TkOptions;
}

export const TK_LIMITS = { maxHands: 200, maxHandMoves: 600, maxRedeals: 5, logKeep: 40 } as const;

export function tkOptions(input: unknown): TkOptions {
  const o = validateOptions(TONK_OPTIONS, input) as OptionValues;
  return {
    handSize: Number(o.handSize), instantWin: o.instantWin as TkOptions['instantWin'], aces: o.aces as TkOptions['aces'],
    allowDrop: o.allowDrop as boolean, caughtPenalty: Number(o.caughtPenalty), hitLock: o.hitLock as boolean, slap: o.slap as boolean,
    wilds: o.wilds as TkOptions['wilds'], spreadBeforeDrop: o.spreadBeforeDrop as boolean, noDiscardPickup: o.noDiscardPickup as boolean,
    stockOut: o.stockOut as TkOptions['stockOut'], caughtLowestCollects: o.caughtLowestCollects as boolean,
    gameEnd: o.gameEnd as TkOptions['gameEnd'], gameTarget: o.gameTarget as number, gameHands: o.gameHands as number,
    coinStakes: o.coinStakes as boolean, stake: o.stake as number, pauseBetweenHands: o.pauseBetweenHands as boolean,
  };
}

const bad = (code: string, msg: string): never => { throw new RuleError(code, msg); };

/* ------------------------------------------------------------------ melds */
export const isWildCard = (c: Card, o: Pick<TkOptions, 'wilds'>): boolean => (o.wilds === 'jokers' ? c.rank === 0 : o.wilds === 'deuces' ? c.rank === 2 : false);
export const tkCount = (cards: readonly Card[]): number => cards.reduce((n, c) => n + countValue(c), 0);

/** Lay `cards` into a run of one suit: naturals at their values, wilds fill gaps, extra wilds extend up then down. */
function layRun(nat: Card[], wild: Card[], aceVal: 1 | 14, maxV: number): Spread | null {
  const suit = nat[0]!.suit;
  if (!suit || nat.some((c) => c.suit !== suit)) return null;
  const val = (c: Card) => (c.rank === 1 ? aceVal : c.rank);
  const vs = nat.map(val).sort((a, b) => a - b);
  for (let i = 1; i < vs.length; i++) if (vs[i] === vs[i - 1]) return null;
  let lo = vs[0]!, hi = vs[vs.length - 1]!;
  const gaps = hi - lo + 1 - nat.length;
  let extra = wild.length - gaps;
  if (extra < 0) return null;
  while (extra > 0 && hi < maxV) { hi++; extra--; }
  while (extra > 0 && lo > 1) { lo--; extra--; }
  if (extra > 0) return null;
  const byVal = new Map(nat.map((c) => [val(c), c]));
  const ws = [...wild];
  const cards: Card[] = [];
  for (let v = lo; v <= hi; v++) cards.push(byVal.get(v) ?? ws.shift()!);
  return { id: -1, owner: -1, kind: 'run', suit, lo, hi, cards };
}

/** A legal spread from exactly these cards, or null. Needs at least one natural card. */
export function meldOf(cards: readonly Card[], o: Pick<TkOptions, 'wilds' | 'aces'>): Spread | null {
  if (cards.length < 3) return null;
  const nat = cards.filter((c) => !isWildCard(c, o));
  const wild = cards.filter((c) => isWildCard(c, o));
  if (!nat.length) return null;
  if (nat.every((c) => c.rank === nat[0]!.rank)) return { id: -1, owner: -1, kind: 'book', rank: nat[0]!.rank, cards: [...nat, ...wild] };
  const hasAce = nat.some((c) => c.rank === 1);
  const low = layRun(nat, wild, 1, o.aces === 'lowOrHigh' && !hasAce ? 14 : 13);
  if (low) return low;
  if (o.aces === 'lowOrHigh' && hasAce) return layRun(nat, wild, 14, 14);
  return null;
}

/** The spread after hitting `card` onto it, or null when it doesn't fit (no rearranging, no wrap). */
export function hitOnto(sp: Spread, card: Card, o: Pick<TkOptions, 'wilds' | 'aces'>): Spread | null {
  const wild = isWildCard(card, o);
  if (sp.kind === 'book') return wild || card.rank === sp.rank ? { ...sp, cards: [...sp.cards, card] } : null;
  const lo = sp.lo!, hi = sp.hi!;
  const maxV = o.aces === 'lowOrHigh' && lo > 1 ? 14 : 13;
  if (wild) {
    if (hi < maxV) return { ...sp, hi: hi + 1, cards: [...sp.cards, card] };
    if (lo > 1) return { ...sp, lo: lo - 1, cards: [card, ...sp.cards] };
    return null;
  }
  if (card.suit !== sp.suit) return null;
  const lows = card.rank === 1 ? [1] : [card.rank];
  const highs = card.rank === 1 ? (o.aces === 'lowOrHigh' && lo > 1 ? [14] : []) : [card.rank];
  if (lows.includes(lo - 1)) return { ...sp, lo: lo - 1, cards: [card, ...sp.cards] };
  if (highs.includes(hi + 1)) return { ...sp, hi: hi + 1, cards: [...sp.cards, card] };
  return null;
}

/** Every distinct legal spread (as card-id lists) inside a hand. Hands stay ≤ 8 cards, so subsets are cheap. */
export function spreadsIn(hand: readonly Card[], o: Pick<TkOptions, 'wilds' | 'aces'>): string[][] {
  const out: string[][] = [];
  const n = hand.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    let bits = 0;
    for (let m = mask; m; m &= m - 1) bits++;
    if (bits < 3) continue;
    const cs = hand.filter((_, i) => mask & (1 << i));
    if (meldOf(cs, o)) out.push(cs.map((c) => c.id));
  }
  return out;
}

/* ------------------------------------------------------------------ hand lifecycle */
function pushLog(s: TkState, e: TkEvent) { s.log = [...s.log, e].slice(-TK_LIMITS.logKeep); }
const left = (s: TkState, seat: number) => (seat + 1) % s.seats;
const counts = (s: TkState) => s.hands.map((h) => tkCount(h));
/** every other seat pays `n` to `to` */
function eachPays(seats: number, to: number, n: number): number[] {
  return Array.from({ length: seats }, (_, i) => (i === to ? n * (seats - 1) : -n));
}

function startHand(s: TkState): TkState {
  const o = s.opts;
  const rng = seededRng(`${s.seed}:hand${s.handNo}:deal${s.redeals}`);
  const deck = buildDeck({ jokers: o.wilds === 'jokers' ? 2 : 0 });
  const dealt = deal(shuffle(deck, rng), s.seats, o.handSize);
  const order = Array.from({ length: s.seats }, (_, k) => (s.dealer + 1 + k) % s.seats);
  const hands: Card[][] = Array.from({ length: s.seats }, () => []);
  order.forEach((seat, k) => { hands[seat] = dealt.hands[k]!; });
  const up = dealt.stock[0]!;
  const out: TkState = {
    ...s, hands, stock: dealt.stock.slice(1), discards: [up], spreads: [], nextSpreadId: 1, turn: order[0]!, phase: 'start',
    pickedUp: null, lockNext: Array(s.seats).fill(false), lockedNow: false, slapQueue: [], slapFrom: null, ackSeat: null, handMoves: 0, log: [],
  };
  pushLog(out, { e: 'deal', hand: s.handNo, dealer: s.dealer, up });
  if (o.instantWin !== 'off') {
    const hit = (c: number) => c === 49 || c === 50 || (o.instantWin === '50-or-11' && c <= 11);
    const winners = order.filter((seat) => hit(tkCount(hands[seat]!)));
    if (winners.length > 1 && s.redeals < TK_LIMITS.maxRedeals) {
      const back: TkState = { ...out, redeals: s.redeals + 1 };
      pushLog(back, { e: 'redeal', why: 'instantTie' });
      return startHand(back);
    }
    if (winners.length) return endHand(out, winners[0]!, 'instant', eachPays(s.seats, winners[0]!, 2), null);
  }
  return out;
}

function endHand(s: TkState, winner: number | null, how: TkHandEnd['how'], deltas: number[], dropper: number | null): TkState {
  const rec: TkHandEnd = { hand: s.handNo, winner, how, dropper, counts: counts(s), deltas };
  const points = s.points.map((p, i) => p + deltas[i]!);
  const tonks = s.tonks.map((t, i) => t + (i === winner && (how === 'tonk' || how === 'instant') ? 1 : 0));
  const drops = s.drops.map((t, i) => t + (i === dropper ? 1 : 0));
  const caught = s.caught.map((t, i) => t + (i === dropper && how === 'caught' ? 1 : 0));
  const ns: TkState = { ...s, points, tonks, drops, caught, history: [...s.history, rec], slapQueue: [], slapFrom: null };
  pushLog(ns, { e: 'end', how, winner });
  const o = s.opts;
  const played = ns.history.length;
  const end = o.gameEnd === 'fixedHands' ? played >= o.gameHands : points.some((p) => p >= o.gameTarget);
  if (end || played >= TK_LIMITS.maxHands) return { ...ns, over: true, phase: 'handOver', ackSeat: null };
  const next: TkState = { ...ns, handNo: ns.handNo + 1, redeals: 0 };
  if (o.pauseBetweenHands) {
    const ack = winner ?? left(next, next.dealer);
    return { ...next, phase: 'handOver', ackSeat: ack, turn: ack };
  }
  return startHand({ ...next, dealer: left(next, next.dealer) });
}

/** Turn over: stock empty → stock-out showdown; else the next seat starts (locked if they were hit). */
function endTurn(s: TkState, from: number): TkState {
  if (s.handMoves >= TK_LIMITS.maxHandMoves) return endHand(s, null, 'void', Array(s.seats).fill(0), null);
  if (!s.stock.length) {
    if (s.opts.stockOut === 'void') return endHand(s, null, 'void', Array(s.seats).fill(0), null);
    const cs = counts(s);
    const min = Math.min(...cs);
    const low = cs.flatMap((c, i) => (c === min ? [i] : []));
    if (low.length > 1) return endHand(s, null, 'void', Array(s.seats).fill(0), null);
    return endHand(s, low[0]!, 'stockOut', eachPays(s.seats, low[0]!, 1), null);
  }
  const t = left(s, from);
  const lockNext = s.lockNext.slice();
  const lockedNow = lockNext[t]!;
  lockNext[t] = false;
  return { ...s, turn: t, phase: 'start', pickedUp: null, lockNext, lockedNow, slapQueue: [], slapFrom: null };
}

function showdown(s: TkState, d: number): TkState {
  const o = s.opts;
  const cs = counts(s);
  pushLog(s, { e: 'drop', seat: d, count: cs[d]! });
  const order = Array.from({ length: s.seats - 1 }, (_, k) => (d + 1 + k) % s.seats);
  const catchers = order.filter((i) => cs[i]! <= cs[d]!);
  if (!catchers.length) return endHand(s, d, 'drop', eachPays(s.seats, d, 1), d);
  const deltas = Array(s.seats).fill(0) as number[];
  for (const i of catchers) { deltas[i]! += o.caughtPenalty; deltas[d]! -= o.caughtPenalty; }
  const min = Math.min(...order.map((i) => cs[i]!));
  const lowest = order.find((i) => cs[i] === min)!;
  if (o.caughtLowestCollects) for (const i of order) if (i !== lowest) { deltas[i]! -= 1; deltas[lowest]! += 1; }
  return endHand(s, lowest, 'caught', deltas, d);
}

/* ------------------------------------------------------------------ rules */
const toActOf = (s: TkState): number[] => (s.over ? [] : s.phase === 'slap' ? [s.slapQueue[0]!] : s.phase === 'handOver' ? [s.ackSeat!] : [s.turn]);

const canDrop = (s: TkState, seat: number) => s.opts.allowDrop && !s.lockedNow && (!s.opts.spreadBeforeDrop || s.spreads.some((sp) => sp.owner === seat));
const slapTargets = (s: TkState, card: Card) => s.spreads.filter((sp) => hitOnto(sp, card, s.opts));

function legal(s: TkState, seat: number): TkMove[] {
  if (!toActOf(s).includes(seat)) return [];
  const o = s.opts;
  const hand = s.hands[seat]!;
  switch (s.phase) {
    case 'handOver': return [{ t: 'nextHand' }];
    case 'slap': {
      const top = s.discards[s.discards.length - 1]!;
      return [...slapTargets(s, top).map((sp) => ({ t: 'slap', spreadId: sp.id }) as TkMove), { t: 'waive' }];
    }
    case 'slapShed': return hand.map((c) => ({ t: 'discard', cardId: c.id }));
    case 'start': {
      const out: TkMove[] = [];
      if (canDrop(s, seat)) out.push({ t: 'drop' });
      if (s.stock.length) out.push({ t: 'drawStock' });
      if (s.discards.length) out.push({ t: 'drawDiscard' });
      return out;
    }
    case 'meld': {
      const out: TkMove[] = [];
      if (!s.lockedNow) for (const ids of spreadsIn(hand, o)) out.push({ t: 'spread', cardIds: ids });
      for (const c of hand) for (const sp of s.spreads) if (hitOnto(sp, c, o)) out.push({ t: 'hit', cardId: c.id, spreadId: sp.id });
      const sheds = hand.filter((c) => !(o.noDiscardPickup && s.pickedUp && c.id === s.pickedUp.id));
      for (const c of sheds.length ? sheds : hand) out.push({ t: 'discard', cardId: c.id });
      return out;
    }
  }
}

function afterDiscard(s: TkState, seat: number, card: Card, slapped: boolean): TkState {
  if (!s.hands[seat]!.length) return endHand(s, seat, 'out', eachPays(s.seats, seat, 1), null);
  const from = slapped ? s.slapFrom! : seat;
  if (s.opts.slap && !slapped) {
    const q = Array.from({ length: s.seats - 1 }, (_, k) => (seat + 1 + k) % s.seats).filter(() => slapTargets(s, card).length > 0);
    if (q.length) return { ...s, phase: 'slap', slapQueue: q, slapFrom: seat };
  }
  return endTurn(s, from);
}

function hitSpread(s: TkState, seat: number, card: Card, spreadId: number): TkState {
  const sp = s.spreads.find((x) => x.id === spreadId) ?? bad('NO_SPREAD', 'no such spread');
  const next = hitOnto(sp, card, s.opts) ?? bad('BAD_HIT', 'that card does not fit the spread');
  const lockNext = s.lockNext.slice();
  if (s.opts.hitLock && sp.owner !== seat) lockNext[sp.owner] = true;
  return { ...s, lockNext, spreads: s.spreads.map((x) => (x.id === spreadId ? next : x)) };
}

export const tonkRules: RuleSet<TkState, TkMove, TkView> = {
  modeId: 'tonk',
  title: 'Tonk',
  minSeats: 2,
  maxSeats: 5,
  optionsSchema: TONK_OPTIONS,
  newGame(options, seats, seed) {
    if (!Number.isInteger(seats) || seats < 2 || seats > 5) throw new RuleError('BAD_SEATS', 'Tonk seats 2–5');
    const opts = tkOptions(options);
    const z = () => Array(seats).fill(0) as number[];
    const base: TkState = {
      opts, seed, seats, points: z(), handNo: 0, dealer: seats - 1, redeals: 0, over: false, history: [],
      hands: Array.from({ length: seats }, () => []), stock: [], discards: [], spreads: [], nextSpreadId: 1, turn: 0, phase: 'start',
      pickedUp: null, lockNext: Array(seats).fill(false), lockedNow: false, slapQueue: [], slapFrom: null, ackSeat: null, handMoves: 0, log: [],
      tonks: z(), drops: z(), caught: z(),
    };
    return startHand(base);
  },
  toAct: (s) => toActOf(s),
  legalMoves: legal,
  applyMove(s0, seat, move) {
    if (s0.over) bad('GAME_OVER', 'the game is over');
    if (!toActOf(s0).includes(seat)) bad('NOT_YOUR_TURN', 'not your turn');
    const m = move as TkMove;
    if (!m || typeof m !== 'object' || !legal(s0, seat).some((l) => JSON.stringify(l) === JSON.stringify(m))) bad('ILLEGAL', 'illegal move');
    let s: TkState = { ...s0, handMoves: s0.handMoves + 1, hands: s0.hands.map((h) => h.slice()) };
    const hand = s.hands[seat]!;
    const take = (id: string) => { const i = hand.findIndex((c) => c.id === id); return hand.splice(i, 1)[0]!; };
    switch (m.t) {
      case 'nextHand': return startHand({ ...s, phase: 'start', ackSeat: null, dealer: left(s, s.dealer) });
      case 'drop': return showdown(s, seat);
      case 'drawStock': {
        const c = s.stock[0]!;
        hand.push(c);
        s = { ...s, stock: s.stock.slice(1), phase: 'meld', pickedUp: null };
        pushLog(s, { e: 'draw', seat, from: 'stock' });
        return s;
      }
      case 'drawDiscard': {
        const c = s.discards[s.discards.length - 1]!;
        hand.push(c);
        s = { ...s, discards: s.discards.slice(0, -1), phase: 'meld', pickedUp: c };
        pushLog(s, { e: 'draw', seat, from: 'discard', card: c });
        return s;
      }
      case 'spread': {
        const cards = m.cardIds.map(take);
        const sp = meldOf(cards, s.opts)!;
        s = { ...s, spreads: [...s.spreads, { ...sp, id: s.nextSpreadId, owner: seat }], nextSpreadId: s.nextSpreadId + 1 };
        pushLog(s, { e: 'spread', seat, spreadId: s.nextSpreadId - 1, cards });
        return hand.length ? s : endHand(s, seat, 'tonk', eachPays(s.seats, seat, 2), null);
      }
      case 'hit': {
        const c = take(m.cardId);
        s = hitSpread(s, seat, c, m.spreadId);
        pushLog(s, { e: 'hit', seat, spreadId: m.spreadId, card: c });
        return hand.length ? s : endHand(s, seat, 'tonk', eachPays(s.seats, seat, 2), null);
      }
      case 'discard': {
        const c = take(m.cardId);
        const slapped = s.phase === 'slapShed';
        s = { ...s, discards: [...s.discards, c] };
        pushLog(s, { e: 'discard', seat, card: c });
        return afterDiscard(s, seat, c, slapped);
      }
      case 'slap': {
        const c = s.discards[s.discards.length - 1]!;
        s = hitSpread({ ...s, discards: s.discards.slice(0, -1) }, seat, c, m.spreadId);
        pushLog(s, { e: 'slap', seat, spreadId: m.spreadId, card: c });
        return { ...s, phase: 'slapShed', turn: seat, slapQueue: [] };
      }
      case 'waive': {
        pushLog(s, { e: 'waive', seat });
        const q = s.slapQueue.slice(1);
        return q.length ? { ...s, slapQueue: q } : endTurn(s, s.slapFrom!);
      }
    }
  },
  view(s, seat): TkView {
    const mine = typeof seat === 'number' ? seat : null;
    return {
      seat,
      hand: mine !== null ? s.hands[mine]!.slice() : [],
      handCounts: s.hands.map((h) => h.length),
      spreads: s.spreads.map((sp) => ({ ...sp, cards: sp.cards.slice() })),
      discardTop: s.discards[s.discards.length - 1] ?? null,
      discardCount: s.discards.length,
      stockCount: s.stock.length,
      points: s.points.slice(),
      gameTarget: s.opts.gameTarget,
      handNo: s.handNo,
      dealer: s.dealer,
      turn: s.over ? null : toActOf(s)[0] ?? null,
      phase: s.over ? 'over' : s.phase,
      pickedUp: s.pickedUp,
      lockedNow: s.lockedNow,
      lockNext: s.lockNext.slice(),
      lastHand: s.history[s.history.length - 1] ?? null,
      log: s.log.slice(),
      options: { ...s.opts },
    };
  },
  results(s): Results {
    const seats = [...Array(s.seats).keys()];
    const placements = seats.sort((a, b) => s.points[b]! - s.points[a]! || a - b);
    const deltas = s.over && s.opts.coinStakes ? s.points.map((p) => p * s.opts.stake) : Array(s.seats).fill(0) as number[];
    return { done: s.over, placements, deltas: deltas.map((d) => d + 0), recap: tkRecap(s) };
  },
};

/** Per-game stats record (mode_games.recap_json): public only. points = MAIN SCORE. */
export interface TkRecap {
  v: 1;
  points: number[];
  coinStakes: boolean;
  hands: { n: number; winner: number | null; how: TkHandEnd['how']; dropper: number | null; deltas: number[] }[];
  tonks: number[];
  drops: number[];
  caught: number[];
}
export function tkRecap(s: TkState): TkRecap {
  return {
    v: 1, points: s.points.slice(), coinStakes: s.opts.coinStakes,
    hands: s.history.map((h) => ({ n: h.hand, winner: h.winner, how: h.how, dropper: h.dropper, deltas: h.deltas.slice() })),
    tonks: s.tonks.slice(), drops: s.drops.slice(), caught: s.caught.slice(),
  };
}

/**
 * Stand-in bot until milestone 9 (tiers), solver-driven (tonkSolver): next hand; slap when it can; drop when the
 * hand counts ≤ 5; take the top discard only if it lowers the best deadwood, else draw from the stock; lay the
 * solver's spreads; hit; shed the card whose loss leaves the least deadwood (highest count on ties). Tell-free.
 */
export const tonkBot: BotStrategy<TkMove, TkView> = {
  modeId: 'tonk',
  choose(view, legalMoves, _tier, rng) {
    if (!legalMoves.length) throw new Error('no legal move');
    const o = view.options;
    const find = <T extends TkMove['t']>(t: T) => legalMoves.filter((m): m is Extract<TkMove, { t: T }> => m.t === t);
    const nh = find('nextHand')[0]; if (nh) return nh;
    const slap = find('slap')[0]; if (slap) return slap;
    if (find('drop').length && tkCount(view.hand) <= 5) return find('drop')[0]!;
    if (find('drawStock').length || find('drawDiscard').length) {
      const top = view.discardTop;
      if (top && find('drawDiscard').length && (!find('drawStock').length || minDeadwood([...view.hand, top], o) < minDeadwood(view.hand, o) + countValue(top))) return find('drawDiscard')[0]!;
      return find('drawStock')[0] ?? find('drawDiscard')[0]!;
    }
    const plan = bestMelds(view.hand, o);
    const key = (ids: string[]) => [...ids].sort().join();
    const want = new Set(plan.melds.map(key));
    const sp = find('spread').find((m) => want.has(key(m.cardIds)));
    if (sp) return sp;
    const hit = find('hit')[0]; if (hit) return hit;
    const dis = find('discard');
    if (dis.length) {
      const score = (id: string) => minDeadwood(view.hand.filter((c) => c.id !== id), o) * 100 - countValue(view.hand.find((c) => c.id === id)!);
      const lo = Math.min(...dis.map((d) => score(d.cardId)));
      const pool = dis.filter((d) => score(d.cardId) === lo);
      return pool[Math.floor(rng() * pool.length)]!;
    }
    return legalMoves[0]!;
  },
};
