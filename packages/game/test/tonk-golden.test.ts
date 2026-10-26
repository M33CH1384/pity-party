/**
 * Fixed-seed reference games for Tonk (M8b), one per main option preset: seed → full move log → results.
 * The stand-in bot plays every seat with an RNG keyed like the server's (seed:bot:moveNo:seat). A rules or bot
 * change that alters any game fails here on purpose: check the diff, then regenerate deliberately with
 * `UPDATE_GOLDEN=1 npx vitest run packages/game/test/tonk-golden.test.ts`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type TkMove, getBot, seededRng, tonkRules as R } from '../src';

export const PRESETS: Record<string, { seats: number; seed: string; options: Record<string, unknown> }> = {
  defaults: { seats: 4, seed: 'tk-defaults', options: {} },
  'fixedHands-7cards': { seats: 3, seed: 'tk-fixed', options: { gameEnd: 'fixedHands', gameHands: 6, handSize: '7' } },
  'jokers-aceHigh': { seats: 4, seed: 'tk-jokers', options: { wilds: 'jokers', aces: 'lowOrHigh', gameTarget: 8 } },
  'deuces-50or11': { seats: 2, seed: 'tk-deuces', options: { wilds: 'deuces', instantWin: '50-or-11', gameTarget: 6 } },
  'house-lock-slap': { seats: 4, seed: 'tk-house', options: { hitLock: true, slap: true, spreadBeforeDrop: true, noDiscardPickup: true, caughtPenalty: '1', caughtLowestCollects: false, gameTarget: 6 } },
  'stockVoid-coins-pause': { seats: 5, seed: 'tk-coins', options: { stockOut: 'void', coinStakes: true, stake: 2, pauseBetweenHands: true, gameTarget: 6 } },
};

const fmt = (m: TkMove) => m.t + ('cardIds' in m ? `:${m.cardIds.join('+')}` : '') + ('cardId' in m ? `:${m.cardId}` : '') + ('spreadId' in m ? `@${m.spreadId}` : '');

export function playGolden(p: (typeof PRESETS)[string]) {
  const bot = getBot('tonk');
  let s = R.newGame(p.options, p.seats, p.seed);
  const moves: string[] = [];
  while (!s.over) {
    const seat = R.toAct(s)[0]!;
    const move = bot.choose(R.view(s, seat), R.legalMoves(s, seat), 'normal', seededRng(`${p.seed}:bot:${moves.length}:${seat}`)) as TkMove;
    moves.push(`${seat}:${fmt(move)}`);
    s = R.applyMove(s, seat, move);
  }
  const r = R.results(s);
  return { preset: p, moves: moves.length, moveLog: moves.join(' '), results: { placements: r.placements, deltas: r.deltas, recap: r.recap } };
}

describe('Tonk golden games', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    it(`${name}: replays move-for-move and ends with the recorded results`, () => {
      const file = join(__dirname, 'golden', `tonk-${name}.json`);
      const got = playGolden(p);
      if (process.env.UPDATE_GOLDEN || !existsSync(file)) writeFileSync(file, `${JSON.stringify(got, null, 1)}\n`);
      expect(got).toEqual(JSON.parse(readFileSync(file, 'utf8')));
      expect(got.results.deltas.reduce((a: number, b: number) => a + b, 0)).toBe(0);
      const pts = (got.results.recap as { points: number[] }).points;
      expect(pts.reduce((a, b) => a + b, 0)).toBe(0);
    });
  }
});
