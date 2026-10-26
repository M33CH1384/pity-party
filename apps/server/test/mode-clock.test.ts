import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '@pp/protocol';
import { FakeEnv } from './harness';

type State = Extract<ServerMsg, { t: 'state' }>;
const st = (env: FakeEnv, cid: string) => env.last(cid, 'state') as State;
const chat = (env: FakeEnv) => env.room.data.chat.map((l) => l.text);

/** 1 human (seat 0) vs 1 bot, 5 cards: the human is to act at the start or right after the bot. */
function oneHuman(handSize = 5) {
  const env = new FakeEnv();
  env.join('a', 'Ann');
  env.send('a', { t: 'sit', seat: 0 });
  env.send('a', { t: 'config', rules: { ...env.room.data.rules, playerCount: 2 } as never });
  env.send('a', { t: 'addBot', seat: 1 });
  env.send('a', { t: 'mode', modeId: 'placeholder', options: { handSize } });
  env.send('a', { t: 'start' });
  return env;
}
const handLen = (env: FakeEnv) => (env.room.data.mg!.state as { hands: unknown[][] }).hands[0]!.length;

describe('registry-mode turn clock + AFK', () => {
  it('starts a 30s clock on a human turn and auto-moves for them when it runs out', () => {
    const env = oneHuman();
    expect(env.room.data.phase).toBe('playing');
    expect(st(env, 'a').mode!.legal.length).toBeGreaterThan(0);
    const dl = env.room.data.deadline!;
    expect(dl - env.t).toBe(30_000);
    const before = handLen(env);
    env.advance(29_000);
    expect(handLen(env)).toBe(before);
    env.advance(1_500);
    expect(handLen(env)).toBe(before - 1);
    expect(chat(env)).toContain('Ann ran out of time');
    expect(env.room.data.members[st(env, 'a').room.members[0]!.playerId]!.timeouts).toBe(1);
  });

  it('a real move resets the timeout count', () => {
    const env = oneHuman();
    env.advance(31_000);
    const pid = Object.keys(env.room.data.members)[0]!;
    expect(env.room.data.members[pid]!.timeouts).toBe(1);
    const s = st(env, 'a');
    env.send('a', { t: 'move', move: s.mode!.legal[0], seq: s.room.seq });
    expect(env.room.data.members[pid]!.timeouts).toBe(0);
  });

  it('after the AFK limit (3) the seat goes to a bot and the game finishes without them', () => {
    const env = oneHuman(5);
    env.advance(3 * 31_000);
    const room = st(env, 'a').room;
    expect(room.seats[0]).toMatchObject({ kind: 'bot', was: 'Ann' });
    expect(chat(env)).toContain('Ann is away — a bot takes the seat');
    expect(env.room.data.phase).toBe('over');
    expect(st(env, 'a').mode!.results.done).toBe(true);
  });

  it('a disconnected human does not stall the game', () => {
    const env = new FakeEnv();
    env.join('a', 'Ann'); env.join('b', 'Bo');
    env.send('a', { t: 'sit', seat: 0 }); env.send('b', { t: 'sit', seat: 1 });
    env.send('a', { t: 'config', rules: { ...env.room.data.rules, playerCount: 2 } as never });
    env.send('a', { t: 'mode', modeId: 'placeholder', options: { handSize: 2 } });
    env.send('a', { t: 'start' });
    env.room.close('b');
    // Ann plays whenever it's her turn; Bo is gone and gets auto-moved
    for (let i = 0; i < 20 && env.room.data.phase === 'playing'; i++) {
      const s = st(env, 'a');
      if (s.mode!.legal.length) env.send('a', { t: 'move', move: s.mode!.legal[0], seq: s.room.seq });
      else env.advance(31_000);
    }
    expect(env.room.data.phase).toBe('over');
    expect(chat(env)).toContain('Bo ran out of time');
  });

  it('nobody connected: the clock freezes and no auto-move happens', () => {
    const env = oneHuman();
    const before = handLen(env);
    env.room.close('a');
    env.advance(10 * 60_000);
    expect(handLen(env)).toBe(before);
    expect(env.room.data.deadline).toBeNull();
  });
});
