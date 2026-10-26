/**
 * Milestone 8b: a full Tonk game through the server's engine adapter (engine.ts → @pp/game registry), in a real
 * Room with 2 humans + 2 bots. Tonk is registered but unlisted: tables refuse it unless the deployment names it in
 * PREVIEW_MODES (production leaves that unset).
 */
import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '@pp/protocol';
import { type TkRecap, type TkView } from '@pp/game';
import { isMode, modeApply, modeBotMove, modeResults, modeToAct, newModeGame } from '../src/engine';
import { FakeEnv } from './harness';

type State = Extract<ServerMsg, { t: 'state' }>;
const st = (env: FakeEnv, cid: string) => env.last(cid, 'state') as State;

function table(options: Record<string, unknown> = {}) {
  const env = new FakeEnv();
  env.previewModes = ['tonk'];
  for (const [i, cid] of ['a', 'b'].entries()) { env.join(cid, `P${i}`); env.send(cid, { t: 'sit', seat: i }); }
  env.send('a', { t: 'addBot', seat: 2 }); env.send('a', { t: 'addBot', seat: 3 });
  env.send('a', { t: 'mode', modeId: 'tonk', options });
  return env;
}
/** Humans: next hand / spread / hit first, draw from the stock, else the first legal move (a discard). */
function playHumans(env: FakeEnv, cids: string[]): number {
  let moves = 0;
  for (let guard = 0; guard < 100_000; guard++) {
    const mover = cids.find((cid) => (st(env, cid).mode?.legal.length ?? 0) > 0);
    if (!mover) break;
    const s = st(env, mover);
    const legal = s.mode!.legal as { t: string }[];
    const pick = ['nextHand', 'spread', 'hit', 'drawStock', 'waive'].map((t) => legal.find((m) => m.t === t)).find(Boolean) ?? legal[0];
    env.send(mover, { t: 'move', move: pick, seq: s.room.seq });
    moves++;
  }
  return moves;
}

describe('Tonk through the room (engine adapter)', () => {
  it('unlisted: refused without PREVIEW_MODES, allowed with it', () => {
    expect(isMode('tonk')).toBe(false);
    expect(isMode('tonk', ['tonk'])).toBe(true);
    const env = new FakeEnv();
    env.join('a', 'Host');
    env.send('a', { t: 'mode', modeId: 'tonk' });
    expect(env.errors('a').at(-1)!.code).toBe('BAD_MODE');
  });

  it('plays a full game: 2 humans + 2 bots, hidden hands, points zero-sum, stats record written', () => {
    const env = table({ gameTarget: 6, pauseBetweenHands: true });
    expect(st(env, 'a').room).toMatchObject({ modeId: 'tonk', modeOptions: { gameTarget: 6, pauseBetweenHands: true, gameEnd: 'firstToPoints', coinStakes: false } });
    env.send('a', { t: 'start' });
    const s0 = st(env, 'a');
    expect(s0.room.phase).toBe('playing');
    const v0 = s0.mode!.view as TkView;
    expect(v0.hand).toHaveLength(5);
    const bJson = JSON.stringify(st(env, 'b').mode!.view);
    for (const c of v0.hand) expect(bJson).not.toContain(`"${c.id}"`);
    expect(playHumans(env, ['a', 'b'])).toBeGreaterThan(0);
    const s = st(env, 'a');
    expect(s.room.phase).toBe('over');
    expect(s.mode!.results.done).toBe(true);
    expect(s.mode!.results.deltas).toEqual([0, 0, 0, 0]); // points only: no coins move by default
    expect(env.records).toHaveLength(1);
    const rec = env.records[0]!;
    expect(rec).toMatchObject({ modeId: 'tonk', options: { gameTarget: 6 } });
    expect(rec.seats.map((x) => x.bot)).toEqual([false, false, true, true]);
    const recap = rec.recap as TkRecap;
    expect(recap.v).toBe(1);
    expect(recap.coinStakes).toBe(false);
    expect(recap.points.reduce((x, y) => x + y, 0)).toBe(0);
    expect(Math.max(...recap.points)).toBeGreaterThanOrEqual(6);
    expect(rec.placements[0]).toBe(recap.points.indexOf(Math.max(...recap.points)));
    expect(recap.hands.length).toBeGreaterThan(0);
    for (const h of recap.hands) {
      expect(['instant', 'tonk', 'out', 'drop', 'caught', 'stockOut', 'void']).toContain(h.how);
      expect(h.deltas).toHaveLength(4);
      expect(h.deltas.reduce((x, y) => x + y, 0)).toBe(0);
    }
    for (const k of ['tonks', 'drops', 'caught'] as const) expect(recap[k]).toHaveLength(4);
    expect(JSON.stringify(recap)).not.toMatch(/"id":"/);
  });

  it('coins on: results move points × stake play coins, zero-sum', () => {
    const env = table({ gameTarget: 5, coinStakes: true, stake: 2 });
    env.send('a', { t: 'start' });
    playHumans(env, ['a', 'b']);
    const r = st(env, 'a').mode!.results;
    expect(r.done).toBe(true);
    const pts = (r.recap as TkRecap).points;
    expect(r.deltas).toEqual(pts.map((p) => p * 2));
    expect(r.deltas.reduce((x, y) => x + y, 0)).toBe(0);
  });

  it('engine adapter alone: newModeGame → bots to the end is deterministic per seed', () => {
    const run = () => {
      const g = newModeGame('tonk', {}, 4, 'adapter-seed');
      for (let i = 0; i < 200_000 && modeToAct(g).length; i++) { const seat = modeToAct(g)[0]!; modeApply(g, seat, modeBotMove(g, seat, 'normal')); }
      return modeResults(g);
    };
    const a = run();
    expect(a.done).toBe(true);
    expect(run()).toEqual(a);
  });
});
