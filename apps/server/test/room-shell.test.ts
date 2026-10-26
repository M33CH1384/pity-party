/**
 * Table shell on the registry (placeholder mode): reconnect, spectators, rejoin state, the legacy act refusal.
 * Replaces the Spades-path reconnect / rejoin-broadcast coverage removed in 2.2b part 2.
 */
import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '@pp/protocol';
import { FakeEnv } from './harness';

type State = Extract<ServerMsg, { t: 'state' }>;
const st = (env: FakeEnv, cid: string) => env.last(cid, 'state') as State;

function twoHumans() {
  const env = new FakeEnv();
  const a = env.join('a', 'Ann'); env.send('a', { t: 'sit', seat: 0 });
  const b = env.join('b', 'Bo'); env.send('b', { t: 'sit', seat: 1 });
  env.send('a', { t: 'addBot', seat: 2 });
  env.send('a', { t: 'addBot', seat: 3 });
  return { env, a, b };
}

describe('registry table shell', () => {
  it('new tables default to the placeholder mode', () => {
    const env = new FakeEnv();
    env.join('a', 'Ann');
    expect(st(env, 'a').room.modeId).toBe('placeholder');
    expect(env.room.data.modeId).toBe('placeholder');
  });

  it('reconnecting with the seat token mid-game rejoins the same seat and gets state right after welcome', () => {
    const { env, b } = twoHumans();
    env.send('a', { t: 'start' });
    env.room.close('b');
    env.clear();
    const again = env.join('b2', 'Bo', b.token);
    expect(again.pid).toBe(b.pid);
    const msgs = env.msgs('b2').map((m) => m.t);
    expect(msgs.indexOf('state')).toBeGreaterThan(msgs.indexOf('welcome'));
    const s = st(env, 'b2');
    expect(s.seat).toBe(1);
    expect(s.mode?.modeId).toBe('placeholder');
    expect(s.spectator).toBeUndefined();
  });

  it('a spectator mid-game gets the redacted mode view and no legal moves', () => {
    const { env } = twoHumans();
    env.send('a', { t: 'start' });
    env.join('c', 'Watcher');
    const s = st(env, 'c');
    expect(s.seat).toBeNull();
    expect(s.spectator).toBe(true);
    expect(s.mode!.legal).toEqual([]);
    expect(JSON.stringify(s.mode!.view)).not.toContain('"hand":[{');
    env.send('c', { t: 'move', move: { card: 'x' } });
    expect(env.errors('c').at(-1)!.code).toBe('NOT_SEATED');
  });

  it('the legacy Spades act message is refused', () => {
    const { env } = twoHumans();
    env.send('a', { t: 'start' });
    env.send('a', { t: 'act', id: 'x1', action: { type: 'bid', bid: 3 } } as never);
    expect(env.last('a', 'ack')).toBeUndefined();
    expect(env.errors('a').at(-1)!.code).toBe('BAD_MESSAGE');
  });

  it('survives a restart (JSON round-trip) mid-game', () => {
    const { env, a, b } = twoHumans();
    env.send('a', { t: 'start' });
    const seq = env.room.data.seq;
    env.restart([['a', a.pid], ['b', b.pid]]);
    expect(env.room.data.mg?.modeId).toBe('placeholder');
    expect(env.room.data.seq).toBe(seq);
    expect(env.room.data.phase).toBe('playing');
  });
});
