/**
 * Fixed-seed reference games for Pitty Pat, one per main option preset: seed → full move log → results.
 * The placeholder bot plays every seat with an RNG keyed like the server's (seed:bot:moveNo:seat), so these
 * are the exact games a bot table would play. A rules change that alters any game fails here on purpose:
 * check the diff, then regenerate with `UPDATE_GOLDEN=1 npx vitest run packages/game/test/pitty-pat-golden.test.ts`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type PpMove, getBot, pittyPatRules as R, seededRng } from '../src';

export const PRESETS: Record<string, { seats: number; seed: string; options: Record<string, unknown> }> = {
  defaults: { seats: 4, seed: 'golden-defaults', options: {} },
  'may-untilMatch': { seats: 3, seed: 'golden-may', options: { mustPair: 'may', flipsPerTurn: 'untilMatch' } },
  'trips-steal': { seats: 4, seed: 'golden-trips', options: { tripsAsOne: true, deadCardSteal: true, stealResume: 'firstPlayer' } },
  'handsWon-7cards': { seats: 5, seed: 'golden-hw', options: { scoring: 'handsWon', handSize: '7', gameTarget: 3 } },
  'pity-void-pause': { seats: 2, seed: 'golden-pity', options: { pityPayouts: true, pityStyle: 'perPair', stockEmpty: 'void', pauseBetweenHands: true, ante: 2, stack: 8 } },
};

export function playGolden(p: (typeof PRESETS)[string]) {
  const bot = getBot('pitty-pat');
  let s = R.newGame(p.options, p.seats, p.seed);
  const moves: { seat: number; move: PpMove }[] = [];
  while (!s.over) {
    const seat = R.toAct(s)[0]!;
    const legal = R.legalMoves(s, seat);
    const move = bot.choose(R.view(s, seat), legal, 'easy', seededRng(`${p.seed}:bot:${moves.length}:${seat}`)) as PpMove;
    moves.push({ seat, move });
    s = R.applyMove(s, seat, move);
  }
  const r = R.results(s);
  return { preset: p, moves: moves.length, moveLog: moves.map((m) => `${m.seat}:${m.move.t}${'cardIds' in m.move ? `:${m.move.cardIds.join('+')}` : 'cardId' in m.move ? `:${m.move.cardId}` : ''}`).join(' '), results: { placements: r.placements, deltas: r.deltas, recap: r.recap } };
}

describe('Pitty Pat golden games', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    it(`${name}: replays move-for-move and ends with the recorded results`, () => {
      const file = join(__dirname, 'golden', `pitty-pat-${name}.json`);
      const got = playGolden(p);
      if (process.env.UPDATE_GOLDEN || !existsSync(file)) writeFileSync(file, `${JSON.stringify(got, null, 1)}\n`);
      expect(got).toEqual(JSON.parse(readFileSync(file, 'utf8')));
      expect(got.results.deltas.reduce((a: number, b: number) => a + b, 0)).toBe(0);
    });
  }
});
