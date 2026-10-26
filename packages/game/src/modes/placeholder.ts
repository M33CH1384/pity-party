/**
 * Placeholder mode ("High Card"): exists only so the shell can boot and be
 * tested end to end before Pitty Pat lands. Each seat plays one card per round
 * in turn order; the highest rank (Ace high) takes the round, earlier play wins ties.
 * Most rounds wins; the winner gets +1 per other seat, each other seat −1.
 */
import { type Card, buildDeck } from '../cards';
import type { OptionDef } from '../options';
import { validateOptions } from '../options';
import { type BotStrategy, type Results, type RuleSet, RuleError } from '../registry';
import { deal, seededRng, shuffle } from '../rng';

export interface HcState {
  seats: number;
  hands: Card[][];
  turn: number;
  /** plays this round, in order */
  table: { seat: number; card: Card }[];
  wins: number[];
  rounds: number;
  roundsTotal: number;
}
export type HcMove = { t: 'play'; cardId: string };
export interface HcView { seat: number | 'spectator'; hand: Card[]; handSizes: number[]; table: HcState['table']; wins: number[]; turn: number | null }

export const PLACEHOLDER_OPTIONS: readonly OptionDef[] = [
  { key: 'handSize', label: 'Cards each', type: 'int', default: 3, min: 1, max: 5, source: 'placeholder', verified: true },
];

const high = (c: Card) => (c.rank === 1 ? 14 : c.rank);

export const placeholderRules: RuleSet<HcState, HcMove, HcView> = {
  modeId: 'placeholder',
  title: 'High Card (placeholder)',
  minSeats: 2,
  maxSeats: 5,
  optionsSchema: PLACEHOLDER_OPTIONS,
  newGame(options, seats, seed) {
    if (seats < 2 || seats > 5) throw new RuleError('BAD_SEATS', 'High Card seats 2–5');
    const o = validateOptions(PLACEHOLDER_OPTIONS, options);
    const n = o.handSize as number;
    const { hands } = deal(shuffle(buildDeck(), seededRng(seed)), seats, n);
    return { seats, hands, turn: 0, table: [], wins: Array(seats).fill(0), rounds: 0, roundsTotal: n };
  },
  toAct(s) { return s.rounds >= s.roundsTotal ? [] : [s.turn]; },
  legalMoves(s, seat) {
    if (s.rounds >= s.roundsTotal || seat !== s.turn) return [];
    return s.hands[seat]!.map((c) => ({ t: 'play' as const, cardId: c.id }));
  },
  applyMove(s, seat, move) {
    if (s.rounds >= s.roundsTotal) throw new RuleError('OVER', 'Game is over');
    if (seat !== s.turn) throw new RuleError('NOT_YOUR_TURN', 'Not your turn');
    const hand = s.hands[seat]!;
    const card = hand.find((c) => c.id === move.cardId);
    if (move.t !== 'play' || !card) throw new RuleError('BAD_MOVE', 'You do not hold that card');
    const hands = s.hands.map((h, i) => (i === seat ? h.filter((c) => c !== card) : h));
    const table = [...s.table, { seat, card }];
    if (table.length < s.seats) return { ...s, hands, table, turn: (seat + 1) % s.seats };
    let best = table[0]!;
    for (const p of table) if (high(p.card) > high(best.card)) best = p;
    const wins = s.wins.map((w, i) => (i === best.seat ? w + 1 : w));
    return { ...s, hands, table: [], wins, rounds: s.rounds + 1, turn: best.seat };
  },
  view(s, seat) {
    return {
      seat,
      hand: typeof seat === 'number' ? s.hands[seat]!.slice() : [],
      handSizes: s.hands.map((h) => h.length),
      table: s.table.slice(),
      wins: s.wins.slice(),
      turn: s.rounds >= s.roundsTotal ? null : s.turn,
    };
  },
  results(s): Results {
    const done = s.rounds >= s.roundsTotal;
    const placements = [...s.wins.keys()].sort((a, b) => s.wins[b]! - s.wins[a]! || a - b);
    const top = s.wins[placements[0]!]!;
    const solo = s.wins.filter((w) => w === top).length === 1;
    const deltas = done && solo ? s.wins.map((_, i) => (i === placements[0] ? s.seats - 1 : -1)) : Array(s.seats).fill(0);
    return { done, placements, deltas, recap: { wins: s.wins.slice() } };
  },
};

export const placeholderBot: BotStrategy<HcMove, HcView> = {
  modeId: 'placeholder',
  choose(view, legal, tier, rng) {
    if (!legal.length) throw new Error('no legal move');
    if (tier === 'easy') return legal[Math.floor(rng() * legal.length)]!;
    // normal/hard: play the highest card (simple, tell-free: uses only own hand)
    const byId = new Map(view.hand.map((c) => [c.id, c]));
    return legal.reduce((a, b) => (high(byId.get(b.cardId)!) > high(byId.get(a.cardId)!) ? b : a));
  },
};
