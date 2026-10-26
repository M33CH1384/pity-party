/** Offline registry game vs bots: pure state machine around @pp/game (no React), so tests drive it directly. */
import { type ModeId, type OptionValues, type Results, getBot, getRules, seededRng } from '@pp/game';

export interface LocalGame { modeId: ModeId; options: OptionValues; seats: number; seed: string; state: unknown; moves: number }

export function newLocalGame(modeId: ModeId, options: OptionValues, seats: number, seed: string): LocalGame {
  return { modeId, options, seats, seed, state: getRules(modeId).newGame(options, seats, seed), moves: 0 };
}
export const localToAct = (g: LocalGame): number[] => getRules(g.modeId).toAct(g.state);
export const localLegal = (g: LocalGame, seat: number): unknown[] => getRules(g.modeId).legalMoves(g.state, seat);
export const localView = (g: LocalGame, seat: number | 'spectator'): unknown => getRules(g.modeId).view(g.state, seat);
export const localResults = (g: LocalGame): Results => getRules(g.modeId).results(g.state);
export function localApply(g: LocalGame, seat: number, move: unknown): LocalGame {
  return { ...g, state: getRules(g.modeId).applyMove(g.state, seat, move), moves: g.moves + 1 };
}
/** The bot seat to act now (seat 0 is the human), or null. */
export function botToAct(g: LocalGame, human = 0): number | null {
  return localToAct(g).find((s) => s !== human) ?? null;
}
/** One bot move, seeded by game seed + move count so a game replays the same. */
export function localBotMove(g: LocalGame, seat: number): LocalGame {
  const legal = localLegal(g, seat);
  const move = getBot(g.modeId).choose(localView(g, seat), legal, 'normal', seededRng(`${g.seed}:bot:${g.moves}:${seat}`));
  return localApply(g, seat, move);
}
