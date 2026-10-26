/**
 * The seam between the shell (rooms, lobby, table UI) and a game mode.
 * Shell code imports only this module; every mode is its own rule set.
 */
import type { OptionDef, OptionValues } from './options';

export type ModeId = 'placeholder' | 'pitty-pat' | 'tonk';
export type SeatView = number | 'spectator';

export interface Results {
  done: boolean;
  /** seat indices, best first (ties share a place via `places`) */
  placements: number[];
  /** coin/point change per seat for the finished hand or game (0 while not done) */
  deltas: number[];
  /** mode-specific recap payload for the hand recap UI */
  recap: unknown;
}

export interface RuleSet<S = unknown, M = unknown, V = unknown> {
  modeId: ModeId;
  title: string;
  minSeats: number;
  maxSeats: number;
  optionsSchema: readonly OptionDef[];
  /** Pure: same (options, seats, seed) → same state. */
  newGame(options: OptionValues, seats: number, seed: string): S;
  /** Seats that may act now (usually one; more for out-of-turn windows). */
  toAct(state: S): number[];
  /** Every legal move for `seat` now; empty when it is not their turn. */
  legalMoves(state: S, seat: number): M[];
  /** Pure; throws RuleError on an illegal move. */
  applyMove(state: S, seat: number, move: M): S;
  /** What `seat` may see: own hand only, opponents as counts, no stock order. */
  view(state: S, seat: SeatView): V;
  results(state: S): Results;
}

export type BotTier = 'easy' | 'normal' | 'hard';

/** Bots choose only from what the seat's view shows (tell-free) plus the legal list. */
export interface BotStrategy<M = unknown, V = unknown> {
  modeId: ModeId;
  choose(view: V, legal: readonly M[], tier: BotTier, rng: () => number): M;
}

export class RuleError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'RuleError'; }
}

const RULES = new Map<ModeId, RuleSet>();
const BOTS = new Map<ModeId, BotStrategy>();
const UNLISTED = new Set<ModeId>();

/**
 * `listed: false` registers an engine that is built and tested but not offered yet: `getRules` works (tests,
 * tooling), but `listModes` leaves it out, so the Setup picker keeps it "coming soon" and the server won't open
 * tables for it. Flip to listed when its table view ships.
 */
export function registerMode<S, M, V>(rules: RuleSet<S, M, V>, bot: BotStrategy<M, V>, opts: { listed?: boolean } = {}): void {
  if (rules.modeId !== bot.modeId) throw new Error('rule set and bot mode differ');
  RULES.set(rules.modeId, rules as unknown as RuleSet);
  BOTS.set(bot.modeId, bot as unknown as BotStrategy);
  if (opts.listed === false) UNLISTED.add(rules.modeId); else UNLISTED.delete(rules.modeId);
}
export function getRules(id: ModeId): RuleSet {
  const r = RULES.get(id);
  if (!r) throw new Error(`unknown mode ${id}`);
  return r;
}
export function getBot(id: ModeId): BotStrategy {
  const b = BOTS.get(id);
  if (!b) throw new Error(`no bot for mode ${id}`);
  return b;
}
export function listModes(): { modeId: ModeId; title: string }[] {
  return [...RULES.values()].filter((r) => !UNLISTED.has(r.modeId)).map((r) => ({ modeId: r.modeId, title: r.title }));
}
