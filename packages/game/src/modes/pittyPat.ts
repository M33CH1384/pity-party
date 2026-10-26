/**
 * Mode A — Pitty Pat (Belize pairs). docs/plan/RULES.md "Mode A" is the spec; every [UNVERIFIED] rule is a
 * setup option (PITTY_PAT_OPTIONS) and the defaults are the documented ones.
 *
 * One game = a series of hands. Each hand: deal `handSize` one at a time from the dealer's left, flip the
 * upcard, then clockwise turns:
 *   upcard matches a hand card → pair it (must, or may) → shed any card (it becomes the upcard) → next seat
 *   no match → flip the stock's top card onto the upcard → match? pair + shed : pass
 * First to empty their hand wins the hand. Stakes are PLAY COINS ONLY (never real money): with pot scoring
 * every active player antes, the winner takes the pot; players who can't cover the ante drop out.
 *
 * Pure and deterministic: every shuffle comes from seededRng(`${seed}:…`) keyed by hand/redeal/reshuffle
 * counters stored in the state, so (options, seats, seed, moves) always replays to the same game.
 */
import { type Card, type Rank, buildDeck } from '../cards';
import { type OptionValues, validateOptions } from '../options';
import { type BotStrategy, type Results, type RuleSet, RuleError } from '../registry';
import { deal, seededRng, shuffle } from '../rng';
import { PITTY_PAT_OPTIONS } from './schemas';

export interface PpOptions {
  handSize: number;
  mustPair: 'must' | 'may';
  flipsPerTurn: 'one' | 'untilMatch';
  tripsAsOne: boolean;
  deadCardSteal: boolean;
  dealtWinAuto: boolean;
  stockEmpty: 'reshuffle' | 'void';
  scoring: 'pot' | 'handsWon';
  stack: number;
  ante: number;
  pityPayouts: boolean;
  gameEnd: 'lastWithChips' | 'firstToWins' | 'fixedHands';
  gameTarget: number;
  dealtWinTie: 'turnOrder' | 'redeal';
  pityStyle: 'perHand' | 'perPair';
  dealtWin7: boolean;
  stealResume: 'stealerLeft' | 'firstPlayer';
  handsWonPayout: 'antePerOpponent' | 'none';
  handsWonEnd: 'firstToWins' | 'fixedHands';
  declineAction: 'flip' | 'pass';
  pauseBetweenHands: boolean;
}

export type PpMove =
  | { t: 'pair'; cardIds: string[] }
  | { t: 'discard'; cardId: string }
  | { t: 'flip' }
  | { t: 'pass' }
  | { t: 'steal'; cardIds: string[] }
  | { t: 'waive' }
  | { t: 'nextHand' };

/** Public event log entry (everything here was face-up at the table). */
export type PpEvent =
  | { e: 'deal'; hand: number; dealer: number; upcard: Card }
  | { e: 'pair'; seat: number; cards: Card[]; steal?: true }
  | { e: 'discard'; seat: number; card: Card }
  | { e: 'flip'; seat: number; card: Card }
  | { e: 'pass'; seat: number; upcard: Card }
  | { e: 'waive'; seat: number }
  | { e: 'reshuffle'; cards: number }
  | { e: 'out'; seat: number; how: HandEnd['how'] }
  | { e: 'void'; why: 'stockEmpty' | 'moveCap' }
  | { e: 'redeal'; why: 'dealtWinTie' };

export interface HandEnd {
  hand: number;
  winner: number | null;
  how: 'out' | 'dealt' | 'void';
  pot: number;
  /** coin change per seat this hand (pot scoring) */
  deltas: number[];
}

export interface PpState {
  opts: PpOptions;
  seed: string;
  seats: number;
  /** game-level */
  chips: number[];
  wins: number[];
  active: boolean[];
  handNo: number;
  dealer: number;
  redeals: number;
  over: boolean;
  history: HandEnd[];
  /** pairs laid per seat across finished hands (recap) */
  pairsTotal: number[];
  /** hand-level */
  hands: Card[][];
  shelves: Card[][];
  stock: Card[];
  /** face-up pile under the upcard, oldest first */
  discards: Card[];
  upcard: Card | null;
  pot: number;
  turn: number;
  phase: 'act' | 'shed' | 'steal' | 'handOver';
  /** steal: the seat whose turn the steal interrupted (stealResume = firstPlayer) */
  resumeAt: number | null;
  /** handOver (pauseBetweenHands): who confirms the next deal */
  ackSeat: number | null;
  /** flips this turn; matched = the current upcard came from this turn's flip */
  flips: number;
  /** steal window: seats still to answer, in turn order; and the seat whose turn follows */
  stealQueue: number[];
  reshuffles: number;
  handMoves: number;
  log: PpEvent[];
  dealtWin: boolean;
}

export interface PpView {
  seat: number | 'spectator';
  hand: Card[];
  handCounts: number[];
  shelves: Card[][];
  upcard: Card | null;
  stockCount: number;
  discardCount: number;
  chips: number[];
  wins: number[];
  active: boolean[];
  pot: number;
  handNo: number;
  dealer: number;
  turn: number | null;
  phase: PpState['phase'] | 'over';
  flips: number;
  lastHand: HandEnd | null;
  log: PpEvent[];
  options: PpOptions;
}

/** Bounds that keep every game finite (property-tested). */
export const PP_LIMITS = { maxHands: 200, maxHandMoves: 2000, maxFlipsPerTurn: 60, maxRedeals: 5, logKeep: 40 } as const;

export function ppOptions(input: unknown): PpOptions {
  const o = validateOptions(PITTY_PAT_OPTIONS, input) as OptionValues;
  return {
    handSize: Number(o.handSize), mustPair: o.mustPair as PpOptions['mustPair'], flipsPerTurn: o.flipsPerTurn as PpOptions['flipsPerTurn'],
    tripsAsOne: o.tripsAsOne as boolean, deadCardSteal: o.deadCardSteal as boolean, dealtWinAuto: o.dealtWinAuto as boolean,
    stockEmpty: o.stockEmpty as PpOptions['stockEmpty'], scoring: o.scoring as PpOptions['scoring'], stack: o.stack as number,
    ante: o.ante as number, pityPayouts: o.pityPayouts as boolean, gameEnd: o.gameEnd as PpOptions['gameEnd'],
    gameTarget: o.gameTarget as number, dealtWinTie: o.dealtWinTie as PpOptions['dealtWinTie'],
    pityStyle: o.pityStyle as PpOptions['pityStyle'], dealtWin7: o.dealtWin7 as boolean, stealResume: o.stealResume as PpOptions['stealResume'],
    handsWonPayout: o.handsWonPayout as PpOptions['handsWonPayout'], handsWonEnd: o.handsWonEnd as PpOptions['handsWonEnd'],
    declineAction: o.declineAction as PpOptions['declineAction'], pauseBetweenHands: o.pauseBetweenHands as boolean,
  };
}

const bad = (code: string, msg: string): never => { throw new RuleError(code, msg); };
const rankCounts = (cards: readonly Card[]) => { const m = new Map<Rank, number>(); for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1); return m; };
/** every rank an even number of times (and non-empty): the hand lays down as pairs */
const allPairs = (cards: readonly Card[]) => cards.length > 0 && [...rankCounts(cards).values()].every((n) => n % 2 === 0);
const nextActive = (s: Pick<PpState, 'active' | 'seats'>, from: number) => { for (let k = 1; k <= s.seats; k++) { const i = (from + k) % s.seats; if (s.active[i]) return i; } return from; };
const activeOrder = (s: Pick<PpState, 'active' | 'seats'>, first: number) => { const out: number[] = []; for (let k = 0; k < s.seats; k++) { const i = (first + k) % s.seats; if (s.active[i]) out.push(i); } return out; };
const pushLog = (s: PpState, ev: PpEvent) => { s.log = [...s.log, ev].slice(-PP_LIMITS.logKeep); };

/** The pair moves `seat` has against the upcard (tripsAsOne: two matching cards shed together with it). */
function pairMoves(hand: readonly Card[], up: Card | null, trips: boolean, t: 'pair' | 'steal'): PpMove[] {
  if (!up) return [];
  const m = hand.filter((c) => c.rank === up.rank);
  if (!m.length) return [];
  if (trips && m.length >= 2) return [{ t, cardIds: m.slice(0, 2).map((c) => c.id).sort() }];
  return m.map((c) => ({ t, cardIds: [c.id] }));
}

/* ------------------------------------------------------------------ hand lifecycle */
function startHand(s: PpState): PpState {
  const o = s.opts;
  // who plays: pot scoring needs the ante covered (a 0 ante keeps everyone in)
  const active = s.chips.map((c, i) => (o.scoring === 'pot' && o.ante > 0 ? c >= o.ante : true) && (s.handNo === 0 || s.active[i]!));
  const ns: PpState = { ...s, active };
  if (active.filter(Boolean).length < 2) return { ...ns, over: true };
  const order = activeOrder(ns, nextActive(ns, ns.dealer));
  const rng = seededRng(`${s.seed}:hand${s.handNo}:deal${s.redeals}`);
  const dealt = deal(shuffle(buildDeck(), rng), order.length, o.handSize);
  const hands: Card[][] = Array.from({ length: s.seats }, () => []);
  order.forEach((seat, k) => { hands[seat] = dealt.hands[k]!; });
  const upcard = dealt.stock[0]!;
  const antes = o.scoring === 'pot' ? o.ante : 0;
  const chips = s.chips.map((c, i) => (active[i] ? c - antes : c));
  const out: PpState = {
    ...ns, chips, hands, shelves: Array.from({ length: s.seats }, () => []), stock: dealt.stock.slice(1), discards: [], upcard,
    pot: antes * order.length, turn: order[0]!, phase: 'act', flips: 0, stealQueue: [], reshuffles: 0, handMoves: 0, dealtWin: false,
    resumeAt: null, ackSeat: null,
    log: [], // the log is per hand: last hand's outcome lives in history/lastHand
  };
  pushLog(out, { e: 'deal', hand: s.handNo, dealer: s.dealer, upcard });
  // CHECK_DEALT_WIN: dealt pairs + an upcard that pairs the odd card
  if (o.dealtWinAuto && (o.handSize !== 7 || o.dealtWin7)) {
    const winners = order.filter((seat) => allPairs([...hands[seat]!, upcard]));
    if (winners.length > 1 && o.dealtWinTie === 'redeal' && s.redeals < PP_LIMITS.maxRedeals) {
      const back: PpState = { ...out, chips: s.chips, redeals: s.redeals + 1 };
      pushLog(back, { e: 'redeal', why: 'dealtWinTie' });
      return startHand(back);
    }
    if (winners.length) {
      const w = winners[0]!;
      out.shelves = out.shelves.map((sh, i) => (i === w ? [...hands[w]!, upcard] : sh));
      out.hands = out.hands.map((h, i) => (i === w ? [] : h));
      out.upcard = null;
      out.dealtWin = true;
      return endHand(out, w, 'dealt');
    }
  }
  if (o.deadCardSteal) {
    const q = order.slice(1).filter((seat) => hands[seat]!.some((c) => c.rank === upcard.rank));
    if (q.length) return { ...out, phase: 'steal', stealQueue: q, resumeAt: order[0]! };
  }
  return out;
}

function endHand(s: PpState, winner: number | null, how: HandEnd['how']): PpState {
  const o = s.opts;
  const deltas = Array(s.seats).fill(0) as number[];
  let chips = s.chips.slice();
  const wins = s.wins.slice();
  if (winner === null) {
    // void: antes go back
    const each = o.scoring === 'pot' ? o.ante : 0;
    chips = chips.map((c, i) => (s.active[i] ? c + each : c));
  } else {
    wins[winner]!++;
    if (o.scoring === 'pot') {
      const each = o.ante;
      for (let i = 0; i < s.seats; i++) if (s.active[i]) deltas[i]! -= each;
      chips[winner]! += s.pot; deltas[winner]! += s.pot;
      if (o.pityPayouts && each > 0) {
        // house "pity": every other active player pays one more ante, two on a dealt win (never more than they hold)
        const mult = how === 'dealt' ? 2 : 1;
        const pairs = Math.floor(s.shelves[winner]!.length / 2);
        const extra = each * mult * (o.pityStyle === 'perPair' ? Math.max(1, pairs) : 1);
        for (let i = 0; i < s.seats; i++) if (s.active[i] && i !== winner) {
          const pay = Math.min(extra, chips[i]!);
          chips[i]! -= pay; deltas[i]! -= pay; chips[winner]! += pay; deltas[winner]! += pay;
        }
      }
    }
  }
  const rec: HandEnd = { hand: s.handNo, winner, how, pot: s.pot, deltas };
  const pairsTotal = s.pairsTotal.map((p, i) => p + Math.floor((s.shelves[i]?.length ?? 0) / 2));
  const ns: PpState = { ...s, chips, wins, pairsTotal, pot: 0, history: [...s.history, rec], phase: 'act', stealQueue: [] };
  pushLog(ns, winner === null ? { e: 'void', why: s.handMoves >= PP_LIMITS.maxHandMoves ? 'moveCap' : 'stockEmpty' } : { e: 'out', seat: winner, how });
  // GAME_OVER?
  const played = ns.history.length;
  const stillIn = ns.chips.map((c) => (o.scoring === 'pot' && o.ante > 0 ? c >= o.ante : true));
  const end = o.gameEnd === 'fixedHands' ? played >= o.gameTarget
    : o.scoring === 'handsWon' && o.gameEnd === 'lastWithChips' && o.handsWonEnd === 'fixedHands' ? played >= o.gameTarget
    : o.gameEnd === 'firstToWins' || o.scoring === 'handsWon' ? wins.some((w) => w >= o.gameTarget)
    : stillIn.filter((x, i) => x && ns.active[i]).length < 2;
  if (end || played >= PP_LIMITS.maxHands) return { ...ns, over: true };
  const next: PpState = { ...ns, active: ns.active.map((a, i) => a && stillIn[i]!), handNo: ns.handNo + 1, redeals: 0 };
  if (next.active.filter(Boolean).length < 2) return { ...next, over: true };
  if (o.pauseBetweenHands) {
    // the table shows this hand's result; the winner (or the next dealer on a void) deals on
    const ack = winner ?? nextActive(next, next.dealer);
    return { ...next, phase: 'handOver', ackSeat: ack, turn: ack };
  }
  return startHand({ ...next, dealer: nextActive(next, next.dealer) });
}

/** After a pair or a discard: out when the hand is empty, or (dealtWinAuto) when what's left lays down as pairs. */
function checkOut(s: PpState, seat: number): PpState | null {
  const h = s.hands[seat]!;
  if (h.length === 0) return endHand(s, seat, 'out');
  if (s.opts.dealtWinAuto && allPairs(h)) {
    const ns = { ...s, shelves: s.shelves.map((sh, i) => (i === seat ? [...sh, ...h] : sh)), hands: s.hands.map((x, i) => (i === seat ? [] : x)) };
    return endHand(ns, seat, 'out');
  }
  return null;
}

function doPair(s: PpState, seat: number, ids: string[], steal: boolean): PpState {
  const hand = s.hands[seat]!;
  const cards = ids.map((id) => hand.find((c) => c.id === id) ?? bad('BAD_MOVE', 'You do not hold that card'));
  const up = s.upcard!;
  const ns: PpState = {
    ...s, hands: s.hands.map((h, i) => (i === seat ? h.filter((c) => !ids.includes(c.id)) : h)),
    shelves: s.shelves.map((sh, i) => (i === seat ? [...sh, up, ...cards] : sh)), upcard: null, turn: seat, phase: 'shed', stealQueue: [],
  };
  pushLog(ns, { e: 'pair', seat, cards: [up, ...cards], ...(steal ? { steal: true as const } : {}) });
  return checkOut(ns, seat) ?? ns;
}

function doFlip(s: PpState, seat: number): PpState {
  let ns: PpState = { ...s };
  if (!ns.stock.length) {
    const pool = ns.discards;
    if (ns.opts.stockEmpty === 'void' || !pool.length) return endHand(ns, null, 'void');
    ns = { ...ns, stock: shuffle(pool, seededRng(`${s.seed}:hand${s.handNo}:deal${s.redeals}:re${s.reshuffles}`)), discards: [], reshuffles: s.reshuffles + 1 };
    pushLog(ns, { e: 'reshuffle', cards: pool.length });
  }
  const card = ns.stock[0]!;
  ns = { ...ns, stock: ns.stock.slice(1), discards: ns.upcard ? [...ns.discards, ns.upcard] : ns.discards, upcard: card, flips: ns.flips + 1 };
  pushLog(ns, { e: 'flip', seat, card });
  return ns;
}

const nextTurn = (s: PpState, from: number): PpState => ({ ...s, turn: nextActive(s, from), phase: 'act', flips: 0 });

/* ------------------------------------------------------------------ rule set */
const toActOf = (s: PpState): number[] => (s.over ? [] : s.phase === 'steal' ? [s.stealQueue[0]!] : s.phase === 'handOver' ? [s.ackSeat!] : [s.turn]);

function legal(s: PpState, seat: number): PpMove[] {
  if (s.over) return [];
  const o = s.opts;
  if (s.phase === 'handOver') return seat === s.ackSeat ? [{ t: 'nextHand' }] : [];
  if (s.phase === 'steal') {
    if (seat !== s.stealQueue[0]) return [];
    return [...pairMoves(s.hands[seat]!, s.upcard, o.tripsAsOne, 'steal'), { t: 'waive' }];
  }
  if (seat !== s.turn) return [];
  const hand = s.hands[seat]!;
  if (s.phase === 'shed') return hand.map((c) => ({ t: 'discard' as const, cardId: c.id }));
  const pairs = pairMoves(hand, s.upcard, o.tripsAsOne, 'pair');
  const canFlipMore = o.flipsPerTurn === 'untilMatch' && s.flips < PP_LIMITS.maxFlipsPerTurn;
  if (pairs.length) {
    if (o.mustPair === 'must') return pairs;
    // may: decline = flip (first look) or pass (after a flip; or flip on in until-match)
    const decline: PpMove = s.flips === 0 ? (o.declineAction === 'pass' ? { t: 'pass' } : { t: 'flip' }) : canFlipMore ? { t: 'flip' } : { t: 'pass' };
    return [...pairs, decline];
  }
  if (s.flips === 0) return [{ t: 'flip' }];
  return canFlipMore ? [{ t: 'flip' }] : [{ t: 'pass' }];
}

export const pittyPatRules: RuleSet<PpState, PpMove, PpView> = {
  modeId: 'pitty-pat',
  title: 'Pitty Pat',
  minSeats: 2,
  maxSeats: 5,
  optionsSchema: PITTY_PAT_OPTIONS,
  newGame(options, seats, seed) {
    if (!Number.isInteger(seats) || seats < 2 || seats > 5) throw new RuleError('BAD_SEATS', 'Pitty Pat seats 2–5');
    const opts = ppOptions(options);
    const base: PpState = {
      opts, seed, seats, chips: Array(seats).fill(opts.scoring === 'pot' ? opts.stack : 0), wins: Array(seats).fill(0), pairsTotal: Array(seats).fill(0), active: Array(seats).fill(true),
      handNo: 0, dealer: seats - 1, redeals: 0, over: false, history: [], hands: Array.from({ length: seats }, () => []), shelves: Array.from({ length: seats }, () => []), stock: [], discards: [], upcard: null,
      pot: 0, turn: 0, phase: 'act', flips: 0, stealQueue: [], reshuffles: 0, handMoves: 0, log: [], dealtWin: false, resumeAt: null, ackSeat: null,
    };
    return startHand(base);
  },
  toAct: (s) => toActOf(s),
  legalMoves: legal,
  applyMove(s, seat, move) {
    if (s.over) throw new RuleError('OVER', 'Game is over');
    const key = JSON.stringify(move);
    if (!legal(s, seat).some((m) => JSON.stringify(m) === key)) {
      if (!toActOf(s).includes(seat)) throw new RuleError('NOT_YOUR_TURN', 'Not your turn');
      throw new RuleError('ILLEGAL', 'That move is not legal now');
    }
    let ns: PpState = { ...s, handMoves: s.handMoves + 1 };
    switch (move.t) {
      case 'steal': return doPair(ns, seat, move.cardIds, true);
      case 'waive': {
        pushLog(ns, { e: 'waive', seat });
        const q = ns.stealQueue.slice(1);
        return { ...ns, stealQueue: q, phase: q.length ? 'steal' : 'act', ...(q.length ? {} : { resumeAt: null }) };
      }
      case 'pair': return doPair(ns, seat, move.cardIds, false);
      case 'discard': {
        const card = ns.hands[seat]!.find((c) => c.id === move.cardId)!;
        ns = { ...ns, hands: ns.hands.map((h, i) => (i === seat ? h.filter((c) => c !== card) : h)), discards: ns.upcard ? [...ns.discards, ns.upcard] : ns.discards, upcard: card };
        pushLog(ns, { e: 'discard', seat, card });
        if (ns.resumeAt !== null && ns.opts.stealResume === 'firstPlayer' && seat !== ns.resumeAt) {
          const back = ns.resumeAt;
          ns = { ...ns, resumeAt: null };
          return checkOut(ns, seat) ?? { ...ns, turn: back, phase: 'act', flips: 0 };
        }
        ns = { ...ns, resumeAt: null };
        return checkOut(ns, seat) ?? (ns.handMoves >= PP_LIMITS.maxHandMoves ? endHand(ns, null, 'void') : nextTurn(ns, seat));
      }
      case 'flip': return doFlip(ns, seat);
      case 'nextHand': return startHand({ ...ns, phase: 'act', ackSeat: null, dealer: nextActive(ns, ns.dealer) });
      case 'pass': {
        pushLog(ns, { e: 'pass', seat, upcard: ns.upcard! });
        return ns.handMoves >= PP_LIMITS.maxHandMoves ? endHand(ns, null, 'void') : nextTurn(ns, seat);
      }
    }
    return bad('BAD_MOVE', 'Unknown move');
  },
  view(s, seat) {
    return {
      seat,
      hand: typeof seat === 'number' ? (s.hands[seat] ?? []).slice() : [],
      handCounts: s.hands.map((h) => h.length),
      shelves: s.shelves.map((sh) => sh.slice()),
      upcard: s.upcard,
      stockCount: s.stock.length,
      discardCount: s.discards.length,
      chips: s.chips.slice(), wins: s.wins.slice(), active: s.active.slice(),
      pot: s.pot, handNo: s.handNo, dealer: s.dealer,
      turn: s.over ? null : toActOf(s)[0] ?? null,
      phase: s.over ? 'over' : s.phase,
      flips: s.flips,
      lastHand: s.history[s.history.length - 1] ?? null,
      log: s.log.slice(),
      options: { ...s.opts },
    };
  },
  results(s): Results {
    const o = s.opts;
    const seats = [...Array(s.seats).keys()];
    const score = (i: number) => (o.scoring === 'pot' ? s.chips[i]! : s.wins[i]!);
    const placements = seats.sort((a, b) => score(b) - score(a) || s.wins[b]! - s.wins[a]! || a - b);
    let deltas = Array(s.seats).fill(0) as number[];
    if (s.over) {
      if (o.scoring === 'pot') deltas = s.chips.map((c) => c - o.stack);
      else {
        const top = s.wins[placements[0]!]!;
        if (o.handsWonPayout === 'antePerOpponent' && s.wins.filter((w) => w === top).length === 1) deltas = s.wins.map((_, i) => (i === placements[0] ? o.ante * (s.seats - 1) : -o.ante));
      }
    }
    return { done: s.over, placements, deltas, recap: ppRecap(s) };
  },
};

/**
 * Per-game stats record (mode_games.recap_json) for Pitty Pat: small and public only.
 *   hands:  one row per hand — winner seat (null = void), how it ended, pot, coin change per seat
 *   pairs:  pairs laid per seat over the whole game
 *   wins / chips: final tallies; dealtWins: hands won on the deal
 */
export interface PpRecap {
  v: 1;
  hands: { n: number; winner: number | null; how: HandEnd['how']; pot: number; deltas: number[] }[];
  pairs: number[];
  wins: number[];
  chips: number[];
  dealtWins: number;
}
export function ppRecap(s: PpState): PpRecap {
  return {
    v: 1,
    hands: s.history.map((h) => ({ n: h.hand, winner: h.winner, how: h.how, pot: h.pot, deltas: h.deltas.slice() })),
    pairs: s.pairsTotal.slice(),
    wins: s.wins.slice(),
    chips: s.chips.slice(),
    dealtWins: s.history.filter((h) => h.how === 'dealt').length,
  };
}

/** Placeholder bot until milestone 7 (tiers): pair when it can, otherwise flip/pass; shed a random card. Tell-free: own view only. */
export const pittyPatBot: BotStrategy<PpMove, PpView> = {
  modeId: 'pitty-pat',
  choose(_view, legalMoves, _tier, rng) {
    if (!legalMoves.length) throw new Error('no legal move');
    const next = legalMoves.find((m) => m.t === 'nextHand');
    if (next) return next;
    const pair = legalMoves.find((m) => m.t === 'pair' || m.t === 'steal');
    if (pair) return pair;
    const sheds = legalMoves.filter((m) => m.t === 'discard');
    if (sheds.length) return sheds[Math.floor(rng() * sheds.length)]!;
    return legalMoves[0]!;
  },
};
