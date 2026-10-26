import { describe, expect, it } from 'vitest';
import { makeD1 } from './d1';
import { saveModeGame } from '../src/stats/mode-games';
import { modeStatsFor } from '../src/stats/mode-stats';

const seats = (uids: (string | null)[]) => uids.map((uid, seat) => ({ seat, uid, name: uid ?? `Bot${seat}`, bot: !uid }));

describe('generic profile stats from mode_games (5a)', () => {
  it('games, wins, coin net, avg place and recent games per registry mode; other players untouched', async () => {
    const db = await makeD1();
    // u1 wins a High Card game (seat 0 first), places 3rd in another, and plays one Tonk game (2nd)
    await saveModeGame(db, { id: 'g1', room: 'AAAAA', modeId: 'placeholder', options: {}, endedAt: 100, seats: seats(['u1', 'u2', null]), placements: [0, 1, 2], deltas: [20, -10, -10], recap: null });
    await saveModeGame(db, { id: 'g2', room: 'BBBBB', modeId: 'placeholder', options: {}, endedAt: 200, seats: seats([null, 'u2', 'u1']), placements: [1, 0, 2], deltas: [-5, 10, -5], recap: null });
    await saveModeGame(db, { id: 'g3', room: 'CCCCC', modeId: 'tonk', options: {}, endedAt: 300, seats: seats(['u3', 'u1']), placements: [0, 1], deltas: [15, -15], recap: null });
    await saveModeGame(db, { id: 'g3', room: 'CCCCC', modeId: 'tonk', options: {}, endedAt: 300, seats: seats(['u3', 'u1']), placements: [0, 1], deltas: [15, -15], recap: null }); // idempotent
    const s = await modeStatsFor(db, 'u1');
    expect(s.total).toEqual({ games: 3, wins: 1, coins: 0 });
    expect(s.modes).toEqual([
      { modeId: 'placeholder', games: 2, wins: 1, coins: 15, avgPlace: 2, lastAt: 200 },
      { modeId: 'tonk', games: 1, wins: 0, coins: -15, avgPlace: 2, lastAt: 300 },
    ]);
    expect(s.recent.map((r) => [r.modeId, r.place, r.of, r.delta])).toEqual([['tonk', 2, 2, -15], ['placeholder', 3, 3, -5], ['placeholder', 1, 3, 20]]);
    expect((await modeStatsFor(db, 'u2')).total).toEqual({ games: 2, wins: 1, coins: 0 });
    expect((await modeStatsFor(db, 'nobody')).modes).toEqual([]);
    // a uid that is a prefix of another must not match it
    expect((await modeStatsFor(db, 'u')).total.games).toBe(0);
  });
});
