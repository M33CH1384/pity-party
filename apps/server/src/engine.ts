/**
 * Engine adapter: the room's only door into game rules for registry modes.
 * Everything here goes through the @pp/game registry (rule sets + bots), so the
 * room never imports a mode's internals.
 */
import { type BotTier, type ModeId, type OptionValues, type Results, RuleError, getBot, getRules, listModes, seededRng, validateOptions } from '@pp/game';

export interface ModeGame {
  modeId: ModeId;
  options: OptionValues;
  seed: string;
  /** moves applied so far (also the bot RNG cursor, so a restart replays the same bot choices) */
  moves: number;
  state: unknown;
}

/**
 * A mode a table may pick: listed in the registry, or registered-but-unlisted and named in `preview`
 * (env PREVIEW_MODES, e.g. "pitty-pat" on a local `wrangler dev`; unset in production, so an engine
 * that is built but has no table view yet can't be opened there).
 */
export function isMode(id: string, preview: readonly string[] = []): id is ModeId {
  if (listModes().some((m) => m.modeId === id)) return true;
  if (!preview.includes(id)) return false;
  try { getRules(id as ModeId); return true; } catch { return false; }
}

export function modeSeatRange(id: ModeId): { min: number; max: number } {
  const r = getRules(id);
  return { min: r.minSeats, max: r.maxSeats };
}

export function cleanModeOptions(id: ModeId, input: unknown): OptionValues {
  return validateOptions(getRules(id).optionsSchema, input);
}

export function newModeGame(id: ModeId, options: OptionValues, seats: number, seed: string): ModeGame {
  const o = cleanModeOptions(id, options);
  return { modeId: id, options: o, seed, moves: 0, state: getRules(id).newGame(o, seats, seed) };
}

export const modeToAct = (g: ModeGame): number[] => getRules(g.modeId).toAct(g.state);
export const modeLegal = (g: ModeGame, seat: number): unknown[] => getRules(g.modeId).legalMoves(g.state, seat);
export const modeView = (g: ModeGame, seat: number | 'spectator'): unknown => getRules(g.modeId).view(g.state, seat);
export const modeResults = (g: ModeGame): Results => getRules(g.modeId).results(g.state);

/** Apply a move; throws RuleError when illegal. Moves are matched against the legal list by value. */
export function modeApply(g: ModeGame, seat: number, move: unknown): void {
  const key = JSON.stringify(move);
  if (!modeLegal(g, seat).some((m) => JSON.stringify(m) === key)) throw new RuleError('ILLEGAL', 'That move is not legal now');
  g.state = getRules(g.modeId).applyMove(g.state, seat, move);
  g.moves++;
}

/** A bot's move for `seat`, chosen from its own view only (tell-free). Deterministic per (seed, move count). */
export function modeBotMove(g: ModeGame, seat: number, tier: BotTier): unknown {
  const legal = modeLegal(g, seat);
  return getBot(g.modeId).choose(modeView(g, seat), legal, tier, seededRng(`${g.seed}:bot:${g.moves}:${seat}`));
}

export function tierForLevel(level: string): BotTier {
  return level === 'novice' || level === 'easy' ? 'easy' : level === 'pro' || level === 'shark' ? 'hard' : 'normal';
}
