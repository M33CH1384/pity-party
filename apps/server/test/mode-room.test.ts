import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '@pp/protocol';
import { FakeEnv } from './harness';

type State = Extract<ServerMsg, { t: 'state' }>;
type HcView = { hand: { id: string }[]; handSizes: number[]; wins: number[]; turn: number | null };

function table(players = 2, bots = 2) {
  const env = new FakeEnv();
  const cids = ['a', 'b', 'c', 'd'].slice(0, players);
  const ps = cids.map((cid, i) => { const p = env.join(cid, `P${i}`); env.send(cid, { t: 'sit', seat: i }); return { cid, ...p }; });
  for (let s = players; s < players + bots; s++) env.send('a', { t: 'addBot', seat: s });
  env.send('a', { t: 'mode', modeId: 'placeholder', options: { handSize: 3 } });
  return { env, ps };
}
const st = (env: FakeEnv, cid: string) => env.last(cid, 'state') as State;

/** Each human on turn plays their first legal move (the server's own legal list), until nobody human is to act. */
function playHumans(env: FakeEnv, cids: string[]): number {
  let moves = 0;
  for (let guard = 0; guard < 200; guard++) {
    const mover = cids.find((cid) => { const m = st(env, cid).mode!; return m.legal.length > 0; });
    if (!mover) break;
    const s = st(env, mover);
    env.send(mover, { t: 'move', move: s.mode!.legal[0], seq: s.room.seq });
    moves++;
  }
  return moves;
}

describe('registry-mode rooms (placeholder via @pp/game)', () => {
  it('host sets the mode; guests cannot; unknown modes are rejected', () => {
    const env = new FakeEnv();
    env.join('a', 'Host'); env.join('b', 'Guest');
    env.send('b', { t: 'mode', modeId: 'placeholder' });
    env.send('a', { t: 'mode', modeId: 'nope' });
    expect(env.errors('b').at(-1)!.code).toBe('NOT_HOST');
    expect(env.errors('a').at(-1)!.code).toBe('BAD_MODE');
    env.send('a', { t: 'mode', modeId: 'placeholder', options: { handSize: 99, junk: true } });
    expect(st(env, 'a').room).toMatchObject({ modeId: 'placeholder', modeOptions: { handSize: 5 } });
  });

  it('plays a full game with 2 humans + 2 bots through the registry, ending in over with a winner line', () => {
    const { env, ps } = table(2, 2);
    env.send('a', { t: 'start' });
    let s = st(env, 'a');
    expect(s.room.phase).toBe('playing');
    expect(s.view).toBeNull();
    expect((s.mode!.view as HcView).hand).toHaveLength(3);
    const moves = playHumans(env, ps.map((p) => p.cid));
    expect(moves).toBe(6); // 3 rounds × 2 humans; bots moved on their own
    s = st(env, 'a');
    expect(s.room.phase).toBe('over');
    expect(s.mode!.results.done).toBe(true);
    expect(s.mode!.results.deltas.reduce((x, y) => x + y, 0)).toBe(0);
    expect((s.mode!.view as HcView).wins.reduce((x, y) => x + y, 0)).toBe(3);
    // one generic stats record per finished game: seats, placements, coin changes, recap
    expect(env.records).toHaveLength(1);
    const rec = env.records[0]!;
    expect(rec).toMatchObject({ room: 'ABCDE', modeId: 'placeholder', options: { handSize: 3 } });
    expect(rec.seats.map((x) => x.bot)).toEqual([false, false, true, true]);
    expect(rec.seats[0]!.name).toBe('P0');
    expect(rec.deltas).toEqual(s.mode!.results.deltas);
    expect(rec.placements).toEqual(s.mode!.results.placements);
    // rematch deals a fresh game
    env.send('a', { t: 'rematch' });
    expect(st(env, 'a').room.phase).toBe('playing');
    expect((st(env, 'a').mode!.view as HcView).hand).toHaveLength(3);
  });

  it('rejects out-of-turn, illegal and spectator moves; legacy act is refused', () => {
    const { env } = table(2, 2);
    env.send('a', { t: 'start' });
    const sa = st(env, 'a'), sb = st(env, 'b');
    const offTurn = sa.mode!.legal.length ? 'b' : 'a';
    const myHand = (st(env, offTurn).mode!.view as HcView).hand;
    env.send(offTurn, { t: 'move', move: { t: 'play', cardId: myHand[0]!.id }, seq: sa.room.seq });
    expect(env.errors(offTurn).at(-1)!.code).toBe('ILLEGAL');
    const onTurn = offTurn === 'a' ? 'b' : 'a';
    env.send(onTurn, { t: 'move', move: { t: 'play', cardId: 'ZZ' }, seq: sb.room.seq });
    expect(env.errors(onTurn).at(-1)!.code).toBe('ILLEGAL');
    env.send(onTurn, { t: 'act', action: { type: 'bid', seat: 0, bid: 3 } as never, seq: sb.room.seq });
    expect(env.errors(onTurn).at(-1)!.code).toBe('WRONG_MODE');
    env.join('w', 'Watcher');
    env.send('w', { t: 'move', move: { t: 'play', cardId: 'AS' } });
    expect(env.errors('w').at(-1)!.code).toBe('NOT_SEATED');
  });

  it('spectators get the mode view with no hand and no legal moves', () => {
    const { env } = table(2, 2);
    env.send('a', { t: 'start' });
    env.join('w', 'Watcher');
    const w = st(env, 'w');
    expect(w.spectator).toBe(true);
    expect((w.mode!.view as HcView).hand).toEqual([]);
    expect((w.mode!.view as HcView).handSizes.every((n) => n > 0)).toBe(true);
    expect(w.mode!.legal).toEqual([]);
    // no player's hand ever leaks to the watcher
    const secret = (st(env, 'a').mode!.view as HcView).hand.map((c) => c.id);
    expect(JSON.stringify(env.raw.filter((m) => m.t === 'state').slice(-1))).not.toContain(`"hand":[{"id":"${secret[0]}"`);
  });

  it('reconnect (same token) gets the same seat and hand back; a DO restart keeps the game', () => {
    const { env, ps } = table(2, 2);
    env.send('a', { t: 'start' });
    const before = (st(env, 'a').mode!.view as HcView).hand.map((c) => c.id);
    env.room.close('a');
    env.join('a2', 'P0', ps[0]!.token);
    const back = st(env, 'a2');
    expect(back.seat).toBe(0);
    expect((back.mode!.view as HcView).hand.map((c) => c.id)).toEqual(before);
    env.restart([['a2', ps[0]!.pid], ['b', ps[1]!.pid]]);
    env.send('a2', { t: 'chat', text: 'still here' });
    expect((st(env, 'a2').mode!.view as HcView).hand.map((c) => c.id)).toEqual(before);
    expect(playHumans(env, ['a2', 'b'])).toBe(6);
    expect(st(env, 'b').room.phase).toBe('over');
  });

  it('a human who leaves mid-game is replaced by a bot that finishes their hand', () => {
    const { env } = table(2, 2);
    env.send('a', { t: 'start' });
    env.send('b', { t: 'leave' });
    expect(st(env, 'a').room.seats[1]).toMatchObject({ kind: 'bot' });
    playHumans(env, ['a']);
    expect(st(env, 'a').room.phase).toBe('over');
  });

  it('mode is locked while a game is in progress', () => {
    const { env } = table(2, 2);
    env.send('a', { t: 'start' });
    env.send('a', { t: 'mode', modeId: 'placeholder' });
    expect(env.errors('a').at(-1)!.code).toBe('IN_GAME');
  });
});
