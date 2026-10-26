/** Milestone 4: the online room lifecycle on a registry mode (placeholder / High Card). */
import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '@pp/protocol';
import { FakeEnv } from './harness';

type State = Extract<ServerMsg, { t: 'state' }>;
const st = (env: FakeEnv, cid: string) => env.last(cid, 'state') as State;

function lobby() {
  const env = new FakeEnv();
  const host = env.join('a', 'Host'); env.send('a', { t: 'sit', seat: 0 });
  const guest = env.join('b', 'Guest'); env.send('b', { t: 'sit', seat: 1 });
  env.send('a', { t: 'mode', modeId: 'placeholder', options: { handSize: 3 } });
  return { env, host, guest };
}
function playOut(env: FakeEnv, cids: string[]) {
  for (let g = 0; g < 200; g++) {
    const c = cids.find((x) => (st(env, x).mode?.legal.length ?? 0) > 0);
    if (!c) return;
    const s = st(env, c);
    env.send(c, { t: 'move', move: s.mode!.legal[0], seq: s.room.seq });
  }
}

describe('registry room lifecycle (milestone 4)', () => {
  it('the open-table listing carries the registry mode id, seats, status and spectators', () => {
    const { env } = lobby();
    expect(env.room.listing()).toMatchObject({ code: 'ABCDE', host: 'Host', mode: 'placeholder', status: 'waiting', humans: 2, spectators: 0 });
    env.send('a', { t: 'addBot', seat: 2 }); env.send('a', { t: 'start' });
    env.join('w', 'Watcher');
    expect(env.room.listing()).toMatchObject({ mode: 'placeholder', status: 'playing', spectators: 1 });
    env.send('a', { t: 'tableOpts', private: true });
    expect(env.room.listing()).toBeNull();
  });

  it('a spectator sees the table, chats (tagged), and cannot move', () => {
    const { env } = lobby();
    env.send('a', { t: 'start' });
    env.join('w', 'Watcher');
    const s = st(env, 'w');
    expect(s.seat).toBeNull();
    expect(s.mode!.legal).toEqual([]);
    env.send('w', { t: 'chat', text: 'nice hand' });
    const line = (env.last('a', 'chat') as Extract<ServerMsg, { t: 'chat' }>).line;
    expect(line).toMatchObject({ name: 'Watcher', text: 'nice hand', spectator: true });
    env.send('w', { t: 'move', move: st(env, 'a').mode!.legal[0] ?? 'x', seq: s.room.seq });
    expect(env.errors('w').length).toBeGreaterThan(0);
  });

  it('players chat in the room; everyone connected gets the line', () => {
    const { env } = lobby();
    env.send('b', { t: 'chat', text: 'hey all' });
    for (const c of ['a', 'b']) expect((env.last(c, 'chat') as Extract<ServerMsg, { t: 'chat' }>).line).toMatchObject({ name: 'Guest', text: 'hey all' });
  });

  it('reconnect by token mid-game keeps the seat; rematch after over deals again', () => {
    const { env, guest } = lobby();
    env.send('a', { t: 'start' });
    env.room.close('b');
    env.join('b2', 'Guest', guest.token);
    expect(st(env, 'b2').seat).toBe(1);
    playOut(env, ['a', 'b2']);
    expect(st(env, 'a').room.phase).toBe('over');
    env.send('a', { t: 'rematch' });
    expect(st(env, 'b2').room.phase).toBe('playing');
  });

  it('host kick in the lobby frees the seat and the kicked player cannot rejoin this game', () => {
    const { env, guest } = lobby();
    env.send('a', { t: 'kick', seat: 1 });
    expect(env.closed).toContain('b');
    expect(st(env, 'a').room.seats[1]!.kind).not.toBe('human');
    env.room.open('b3');
    env.room.message('b3', JSON.stringify({ t: 'hello', name: 'Guest', token: guest.token }));
    expect(env.last('b3', 'welcome')).toBeUndefined();
    expect(env.closed).toContain('b3');
  });

  it('host who leaves passes host to the next member; the new host can start', () => {
    const { env, guest } = lobby();
    env.send('a', { t: 'leave' });
    const s = st(env, 'b');
    expect(s.room.hostId).toBe(guest.pid);
    env.send('b', { t: 'addBot', seat: 0 });
    env.send('b', { t: 'start' });
    expect(st(env, 'b').room.phase).toBe('playing');
  });
});
