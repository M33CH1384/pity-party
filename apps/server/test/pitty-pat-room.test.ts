/**
 * Milestone 6 PR 2: a full Pitty Pat game through the server's engine adapter (engine.ts → @pp/game registry),
 * in a real Room with 2 humans + 2 bots. Pitty Pat is registered but unlisted: tables refuse it unless the
 * deployment names it in PREVIEW_MODES (production leaves that unset).
 */
import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '@pp/protocol';
import { type PpRecap, type PpView } from '@pp/game';
import { isMode, modeApply, modeBotMove, modeResults, modeToAct, newModeGame } from '../src/engine';
import { FakeEnv } from './harness';

type State = Extract<ServerMsg, { t: 'state' }>;
const st = (env: FakeEnv, cid: string) => env.last(cid, 'state') as State;

function table(options: Record<string, unknown> = {}) {
  const env = new FakeEnv();
  env.previewModes = ['pitty-pat'];
  for (const [i, cid] of ['a', 'b'].entries()) { env.join(cid, `P${i}`); env.send(cid, { t: 'sit', seat: i }); }
  env.send('a', { t: 'addBot', seat: 2 }); env.send('a', { t: 'addBot', seat: 3 });
  env.send('a', { t: 'mode', modeId: 'pitty-pat', options });
  return env;
}
function playHumans(env: FakeEnv, cids: string[]): number {
  let moves = 0;
  for (let guard = 0; guard < 50_000; guard++) {
    const mover = cids.find((cid) => (st(env, cid).mode?.legal.length ?? 0) > 0);
    if (!mover) break;
    const s = st(env, mover);
    // humans play like the placeholder bot's first choice: pair first, else the first legal move
    const legal = s.mode!.legal as { t: string }[];
    env.send(mover, { t: 'move', move: legal.find((m) => m.t === 'pair' || m.t === 'steal' || m.t === 'nextHand') ?? legal[0], seq: s.room.seq });
    moves++;
  }
  return moves;
}

describe('Pitty Pat through the room (engine adapter)', () => {
  it('listed (M7b): a host can pick Pitty Pat with no PREVIEW_MODES; unknown modes are still refused', () => {
    expect(isMode('pitty-pat')).toBe(true);
    expect(isMode('nope', ['nope'])).toBe(false);
    const env = new FakeEnv();
    env.join('a', 'Host');
    env.send('a', { t: 'mode', modeId: 'pitty-pat' });
    expect(env.errors('a')).toHaveLength(0);
    expect(st(env, 'a').room.modeId).toBe('pitty-pat');
    env.send('a', { t: 'mode', modeId: 'nope' });
    expect(env.errors('a').at(-1)!.code).toBe('BAD_MODE');
  });

  it('plays a full game: 2 humans + 2 bots, hidden hands, ends over with a points record (default scoring) and the recap shape', () => {
    const env = table({ targetPoints: 3, pauseBetweenHands: true });
    expect(st(env, 'a').room).toMatchObject({ modeId: 'pitty-pat', modeOptions: { targetPoints: 3, pauseBetweenHands: true, mustPair: 'must', coinPot: false, gameEnd: 'firstToPoints' } });
    env.send('a', { t: 'start' });
    const s0 = st(env, 'a');
    expect(s0.room.phase).toBe('playing');
    const v0 = s0.mode!.view as PpView;
    expect(v0.hand.length).toBeGreaterThan(0);
    // b's view never carries a's cards
    const bJson = JSON.stringify(st(env, 'b').mode!.view);
    for (const c of v0.hand) expect(bJson).not.toContain(`"${c.id}"`);
    const moves = playHumans(env, ['a', 'b']);
    expect(moves).toBeGreaterThan(0);
    const s = st(env, 'a');
    expect(s.room.phase).toBe('over');
    expect(s.mode!.results.done).toBe(true);
    expect(s.mode!.results.deltas.reduce((x, y) => x + y, 0)).toBe(0);
    expect(env.records).toHaveLength(1);
    const rec = env.records[0]!;
    expect(rec).toMatchObject({ modeId: 'pitty-pat', options: { targetPoints: 3 } });
    expect(rec.seats.map((x) => x.bot)).toEqual([false, false, true, true]);
    const recap = rec.recap as PpRecap;
    expect(recap.v).toBe(2);
    expect(recap.coinPot).toBe(false);
    expect(Math.max(...recap.points)).toBe(3);
    expect(rec.placements[0]).toBe(recap.points.indexOf(3));
    expect(recap.hands.length).toBeGreaterThan(0);
    for (const h of recap.hands) { expect(['out', 'dealt', 'void']).toContain(h.how); expect(h.deltas).toHaveLength(4); }
    expect(recap.pairs).toHaveLength(4);
    expect(recap.chips).toEqual([0, 0, 0, 0]); // no coins in play by default
    expect(JSON.stringify(recap)).not.toMatch(/"id":"/);
  });

  it('engine adapter alone: newModeGame → bots to the end is deterministic per seed', () => {
    const run = () => {
      const g = newModeGame('pitty-pat', { stack: 3 }, 4, 'adapter-seed');
      for (let i = 0; i < 100_000 && modeToAct(g).length; i++) { const seat = modeToAct(g)[0]!; modeApply(g, seat, modeBotMove(g, seat, 'easy')); }
      return modeResults(g);
    };
    const a = run();
    expect(a.done).toBe(true);
    expect(run()).toEqual(a);
  });
});
