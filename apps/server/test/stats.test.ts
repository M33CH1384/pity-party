import { describe, expect, it } from 'vitest';
import { makeD1 } from './d1';
import { type GameRecord, eloUpdate, expected, isRated, placementsOf, saveRecord } from '../src/stats/record';
import { personalStats } from '../src/stats/boards';

describe('who counts for Elo', () => {
  const rules = { playerCount: 4, partnerships: true };
  const st = {} as GameRecord['players'][number]['stats'];
  const rec = (seats: GameRecord['seats']): GameRecord => ({
    id: 'x', room: 'R', mode: 'joker', kind: 'team', endedAt: 0, hands: 1, final: [1, 0], winners: [0], names: [], seats,
    players: seats.filter((s) => s.kind === 'user' && s.uid).map((s, i) => ({ seat: i, uid: s.uid!, side: s.side, won: true, partner: null, teamName: null, stats: st })),
  });
  it('requires signed-in players on two sides; guests and same-side partners do not rate', () => {
    const user = (side: number, uid: string, seatKind: GameRecord['seats'][number]['kind'] = 'user'): GameRecord['seats'][number] => ({ name: uid, side, kind: seatKind, ...(seatKind === 'user' ? { uid } : {}) });
    expect(isRated(rec([user(0, 'a'), user(1, 'b'), { name: 'c', side: 0, kind: 'bot' }, { name: 'd', side: 1, kind: 'bot' }]), rules)).toBe(true);
    expect(isRated(rec([user(0, 'a'), { name: 'g', side: 1, kind: 'guest' }, { name: 'c', side: 0, kind: 'bot' }, { name: 'd', side: 1, kind: 'bot' }]), rules)).toBe(false);
    expect(isRated(rec([user(0, 'a'), user(0, 'b'), { name: 'c', side: 1, kind: 'bot' }, { name: 'd', side: 1, kind: 'bot' }]), rules)).toBe(false);
    expect(isRated(rec([{ name: 'a', side: 0, kind: 'bot' }, { name: 'b', side: 1, kind: 'bot' }, { name: 'c', side: 0, kind: 'bot' }, { name: 'd', side: 1, kind: 'bot' }]), rules)).toBe(false);
  });
  it('a rated game writes Elo, and saving it again leaves that Elo alone', async () => {
    const db = await makeD1();
    for (const id of ['a', 'b']) await db.prepare('INSERT INTO users (id, username, username_key, created_at) VALUES (?, ?, ?, 1)').bind(id, id.toUpperCase(), id).run();
    const seats: GameRecord['seats'] = [{ name: 'A', side: 0, kind: 'user', uid: 'a' }, { name: 'B', side: 1, kind: 'user', uid: 'b' }];
    const players = seats.map((s, i) => ({ seat: i, uid: s.uid!, side: s.side, won: s.side === 0, partner: null, teamName: null, stats: st }));
    const game: GameRecord = { id: 'rated-1', room: 'R', mode: 'joker', kind: 'team', endedAt: 5, hands: 1, final: [500, 200], winners: [0], names: [], seats, players };
    expect(isRated(game, { playerCount: 2, partnerships: true })).toBe(true);
    await saveRecord(db, game, true);
    const first = await db.prepare("SELECT elo, games FROM ratings WHERE user_id = 'a' AND kind = 'team'").first<{ elo: number; games: number }>();
    expect(first!.games).toBe(1);
    expect(first!.elo).not.toBe(1200);
    await saveRecord(db, game, true);
    expect(await db.prepare("SELECT elo, games FROM ratings WHERE user_id = 'a' AND kind = 'team'").first()).toEqual(first);
  });
});

describe('Elo', () => {
  const base = (seats: GameRecord['seats'], players: GameRecord['players'], final: number[], winners: number[]): GameRecord =>
    ({ id: 'x', room: 'R', mode: 'joker', kind: 'team', endedAt: 0, hands: 1, final, winners, names: [], seats, players });
  const st = {} as GameRecord['players'][number]['stats'];
  it('team: winners gain what losers lose; upsets pay more', () => {
    const seats: GameRecord['seats'] = [{ name: 'A', side: 0, kind: 'user', uid: 'a' }, { name: 'B', side: 1, kind: 'user', uid: 'b' }, { name: 'C', side: 0, kind: 'user', uid: 'c' }, { name: 'D', side: 1, kind: 'user', uid: 'd' }];
    const players = seats.map((s, i) => ({ seat: i, uid: s.uid!, side: s.side, won: s.side === 0, partner: null, teamName: null, stats: st }));
    const even = eloUpdate(base(seats, players, [500, 200], [0]), [1, 2], {});
    expect(even.a!.after).toBe(1220);
    expect(even.b!.after).toBe(1180);
    const upset = eloUpdate(base(seats, players, [500, 200], [0]), [1, 2], { a: { elo: 1000, games: 50 }, c: { elo: 1000, games: 50 }, b: { elo: 1400, games: 50 }, d: { elo: 1400, games: 50 } });
    expect(upset.a!.after - 1000).toBeGreaterThan(20);
    expect(expected(1200, 1200)).toBe(0.5);
  });
  it('cutthroat: placements against every opponent; shot-out winners place first', () => {
    expect(placementsOf([300, 100, 200], [1])).toEqual([2, 1, 3]);
    expect(placementsOf([300, 300, 100], [0, 1])).toEqual([1, 1, 3]);
    const seats: GameRecord['seats'] = [0, 1, 2, 3].map((i) => ({ name: `P${i}`, side: i, kind: 'user', uid: `p${i}` }));
    const players = seats.map((s, i) => ({ seat: i, uid: s.uid!, side: i, won: i === 0, partner: null, teamName: null, stats: st }));
    const r = eloUpdate({ ...base(seats, players, [400, 300, 200, 100], [0]), kind: 'cutthroat' }, [1, 2, 3, 4], {});
    expect(r.p0!.after).toBeGreaterThan(r.p1!.after);
    expect(r.p1!.after).toBeGreaterThan(1200);
    expect(r.p2!.after).toBeLessThan(1200);
    expect(r.p3!.after).toBeLessThan(r.p2!.after);
  });
});
