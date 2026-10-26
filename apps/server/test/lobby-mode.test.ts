/**
 * 3c: the host changes the game in the lobby, and the table follows each mode's seat range
 * from the registry. A 3-seat-only test mode is registered here (file-local) next to the
 * placeholder (2–5 seats, capped at the table's 4).
 */
import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '@pp/protocol';
import { type ModeId, getBot, getRules, registerMode } from '@pp/game';
import { FakeEnv } from './harness';
import { tableSeatRange } from '../src/room';

type State = Extract<ServerMsg, { t: 'state' }>;
const st = (env: FakeEnv, cid: string) => env.last(cid, 'state') as State;

const TRIO = 'test-trio' as ModeId;
registerMode({ ...getRules('placeholder'), modeId: TRIO, title: 'Trio', minSeats: 3, maxSeats: 3 }, { ...getBot('placeholder'), modeId: TRIO });

function lobby() {
  const env = new FakeEnv();
  env.join('a', 'Ann'); env.send('a', { t: 'sit', seat: 0 });
  env.join('b', 'Bo'); env.send('b', { t: 'sit', seat: 3 });
  return env;
}

describe('lobby: mode change + per-mode seat limits', () => {
  it('table seat range = registry range capped at 4 seats', () => {
    expect(tableSeatRange('placeholder')).toEqual({ min: 2, max: 4 });
    expect(tableSeatRange(TRIO)).toEqual({ min: 3, max: 3 });
  });

  it('the host switches the game before start; options are validated and broadcast to everyone', () => {
    const env = lobby();
    env.send('a', { t: 'mode', modeId: TRIO, options: { bogus: 1 } });
    expect(st(env, 'b').room.modeId).toBe(TRIO);
    expect(st(env, 'b').room.modeOptions).toEqual(st(env, 'a').room.modeOptions);
    expect(st(env, 'b').room.modeOptions).not.toHaveProperty('bogus');
  });

  it('switching to a narrower mode fits the seats and stands up anyone beyond them', () => {
    const env = lobby();
    env.send('a', { t: 'mode', modeId: TRIO });
    const s = st(env, 'b');
    expect(s.room.rules.playerCount).toBe(3);
    expect(s.seat).toBeNull();
    expect(env.room.data.seats[3]).toEqual({ kind: 'empty' });
    expect(st(env, 'a').seat).toBe(0);
  });

  it('seat count outside the mode range is refused; inside it is accepted', () => {
    const env = lobby();
    env.send('a', { t: 'mode', modeId: TRIO });
    env.send('a', { t: 'config', rules: { playerCount: 2, turnTimerSec: 30 } });
    expect(env.errors('a').at(-1)!.code).toBe('BAD_RULES');
    expect(st(env, 'a').room.rules.playerCount).toBe(3);
    env.send('a', { t: 'mode', modeId: 'placeholder' });
    env.send('a', { t: 'config', rules: { playerCount: 2, turnTimerSec: 30 } });
    expect(st(env, 'a').room.rules.playerCount).toBe(2);
  });

  it('only the host, and only before the game starts', () => {
    const env = lobby();
    env.send('b', { t: 'mode', modeId: TRIO });
    expect(env.errors('b').at(-1)!.code).toBe('NOT_HOST');
    env.send('a', { t: 'start' });
    env.send('a', { t: 'mode', modeId: TRIO });
    expect(env.errors('a').at(-1)!.code).toBe('IN_GAME');
    expect(env.room.data.modeId).toBe('placeholder');
  });

  it('unknown modes are refused; the turn timer reaches every player', () => {
    const env = lobby();
    env.send('a', { t: 'mode', modeId: 'nope' });
    expect(env.errors('a').at(-1)!.code).toBe('BAD_MODE');
    env.send('a', { t: 'config', rules: { playerCount: 4, turnTimerSec: 45 } });
    expect(st(env, 'b').room.rules.turnTimerSec).toBe(45);
  });
});
