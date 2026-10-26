import { describe, expect, it } from 'vitest';
import type { GameAction } from '@pp/protocol';
import { HAND_END_HOLD_MS } from '@pp/protocol';
import { BOT_NAMES } from '@pp/game';
import { BOT_WATCHDOG_MS, HOST_DISCONNECT_GRACE_MS } from '../src/room';
import { FakeEnv } from './harness';

/** a bot seat got a name from the shared pool, unique at the table and not a human's name */
function expectPoolBot(seats: readonly unknown[], i: number) {
  const ss = seats as { kind: string; name?: string; playerId?: string }[];
  const name = ss[i]!.name!;
  expect(BOT_NAMES).toContain(name);
  expect(ss.filter((x, k) => k !== i && x.kind === 'bot').map((x) => x.name)).not.toContain(name);
}

const FAST = { botMs: 10, trickPauseMs: 0, dealMs: 0, disconnectGraceMs: 5000, handOverMs: 3000 };

function fourHumans(env = new FakeEnv(undefined, FAST)) {
  const ps = ['a', 'b', 'c', 'd'].map((cid, i) => {
    const p = env.join(cid, ['Dee', 'Ray', 'Kim', 'Jo'][i]!);
    env.send(cid, { t: 'sit', seat: i });
    return { cid, ...p };
  });
  return { env, ps };
}

describe('lobby', () => {
  it('first player is host; welcome carries a token; others are not host', () => {
    const env = new FakeEnv();
    const a = env.join('a', 'Demetrius');
    const b = env.join('b', 'Ray');
    expect(a.token).toHaveLength(32);
    const room = env.last('b', 'state')!.room;
    expect(room.hostId).toBe(a.pid);
    expect(room.members.map((m) => m.playerId)).toEqual([a.pid, b.pid]);
  });

  it('cleans names (length, control chars, profanity)', () => {
    const env = new FakeEnv();
    env.join('a', '  A\u0000very   long name that goes on and on  ');
    env.join('b', 'shit');
    const m = env.last('b', 'state')!.room.members;
    expect(m[0]!.name).toBe('A very long name tha');
    expect(m[1]!.name).toBe('Player');
  });

  it('seat picking: taken seats are refused; partners sit across', () => {
    const env = new FakeEnv();
    env.join('a', 'A'); env.join('b', 'B');
    env.send('a', { t: 'sit', seat: 0 });
    env.send('b', { t: 'sit', seat: 0 });
    expect(env.errors('b').at(-1)!.code).toBe('SEAT_TAKEN');
    env.send('b', { t: 'sit', seat: 2 });
    const seats = env.last('a', 'state')!.room.seats;
    expect(seats[0]).toMatchObject({ kind: 'human', name: 'A' });
    expect(seats[2]).toMatchObject({ kind: 'human', name: 'B' });
    // moving seats frees the old one
    env.send('b', { t: 'sit', seat: 1 });
    expect(env.last('a', 'state')!.room.seats[2]).toEqual({ kind: 'empty' });
  });

  it('only the host can configure, add/remove bots and start', () => {
    const env = new FakeEnv();
    env.join('a', 'Host'); env.join('b', 'Guest');
    env.send('b', { t: 'addBot', seat: 1 });
    env.send('b', { t: 'start' });
    env.send('b', { t: 'config', rules: { playerCount: 4, turnTimerSec: 30 } });
    expect(env.errors('b').map((e) => e.code)).toEqual(['NOT_HOST', 'NOT_HOST', 'NOT_HOST']);
    env.send('a', { t: 'addBot', seat: 1 });
    expect(env.last('a', 'state')!.room.seats[1]).toMatchObject({ kind: 'bot' });
    env.send('a', { t: 'removeBot', seat: 1 });
    expect(env.last('a', 'state')!.room.seats[1]).toEqual({ kind: 'empty' });
  });




});

describe('game', () => {












  // Timeout budget: a full 4-human game sim measures ~0.2–0.7 s locally but several seconds on loaded CI runners — measured sim cost, not a hang (flake family, 2026-10-23).



  it('freezes when nobody is connected (no bot moves, no timers)', () => {
    const env = new FakeEnv(undefined, FAST);
    env.join('a', 'Solo');
    env.send('a', { t: 'sit', seat: 0 });
    env.send('a', { t: 'start' });
    env.room.close('a');
    const snap = JSON.stringify(env.room.data.game);
    env.advance(60_000);
    expect(JSON.stringify(env.room.data.game)).toBe(snap);
    expect(env.room.data.deadline).toBeNull();
  });



});



describe('chat + signaling', () => {
  it('chat: length limit, links blocked, profanity masked, rate limited', () => {
    const env = new FakeEnv();
    env.join('a', 'A'); env.join('b', 'B');
    env.clear();
    env.send('a', { t: 'chat', text: 'x'.repeat(500) });
    env.send('a', { t: 'chat', text: 'go to www.evil.com now' });
    env.send('a', { t: 'chat', text: 'oh shit' });
    const lines = env.msgs('b').filter((m) => m.t === 'chat').map((m) => (m as { line: { text: string } }).line.text);
    expect(lines[0]).toHaveLength(200);
    expect(lines[1]).toBe('go to [link] now');
    expect(lines[2]).toBe('oh s***');
    env.send('a', { t: 'chat', text: '4' });
    env.send('a', { t: 'chat', text: '5' });
    env.send('a', { t: 'chat', text: '6' });
    expect(env.errors('a').at(-1)!.code).toBe('RATE_LIMITED');
    env.advance(10_001);
    env.send('a', { t: 'chat', text: 'ok again' });
    expect(env.msgs('b').filter((m) => m.t === 'chat').length).toBe(6);
  });

  it('chat reactions: toggle + broadcast, persisted on the line, unknown id dropped, rate limited', () => {
    const env = new FakeEnv();
    const ja = env.join('a', 'A'); const jb = env.join('b', 'B');
    env.clear();
    env.send('a', { t: 'chat', text: 'big hand coming' });
    const line = env.last('b', 'chat')!.line;
    const aPid = ja.pid; const bPid = jb.pid;
    expect(line.from).toBe(aPid);
    // b reacts: everyone gets the map, and it is persisted on the stored line (welcome backfill sees it)
    env.send('b', { t: 'react', id: line.id, emoji: '🔥' });
    expect(env.last('a', 'chatReact')).toEqual({ t: 'chatReact', id: line.id, reactions: { '🔥': [bPid] } });
    expect(env.room.data.chat.find((l) => l.id === line.id)?.reactions).toEqual({ '🔥': [bPid] });
    // a joins the chip, then b toggles off
    env.send('a', { t: 'react', id: line.id, emoji: '🔥' });
    env.send('b', { t: 'react', id: line.id, emoji: '🔥' });
    expect(env.last('a', 'chatReact')!.reactions).toEqual({ '🔥': [aPid] });
    // unknown line id: no broadcast
    const before = env.msgs('a').filter((m) => m.t === 'chatReact').length;
    env.send('b', { t: 'react', id: 424242, emoji: '🔥' });
    expect(env.msgs('a').filter((m) => m.t === 'chatReact').length).toBe(before);
    // rate limit: 10 reactions per 10 s (a has already used 1 in this window)
    for (let i = 0; i < 11; i++) env.send('a', { t: 'react', id: line.id, emoji: '👍' });
    const settled = env.msgs('b').filter((m) => m.t === 'chatReact').length;
    env.send('a', { t: 'react', id: line.id, emoji: '😂' });
    expect(env.msgs('b').filter((m) => m.t === 'chatReact').length).toBe(settled);
    // after the window passes, reacting works again
    env.advance(10_001);
    env.send('a', { t: 'react', id: line.id, emoji: '😂' });
    expect(env.msgs('b').filter((m) => m.t === 'chatReact').length).toBe(settled + 1);
  });

  it('relays WebRTC signaling only to the addressed seated player', () => {
    const env = new FakeEnv();
    const a = env.join('a', 'A'); const b = env.join('b', 'B'); env.join('c', 'C');
    env.send('a', { t: 'sit', seat: 0 });
    env.send('a', { t: 'rtc', to: b.pid, data: { sdp: 'x' } });
    expect(env.msgs('b').some((m) => m.t === 'rtc')).toBe(false); // b isn't seated
    env.send('b', { t: 'sit', seat: 1 });
    env.send('a', { t: 'rtc', to: b.pid, data: { sdp: 'offer' } });
    expect(env.last('b', 'rtc')).toEqual({ t: 'rtc', from: a.pid, data: { sdp: 'offer' } });
    expect(env.msgs('c').some((m) => m.t === 'rtc')).toBe(false);
    env.send('a', { t: 'media', media: { cam: true, mic: false } });
    expect(env.last('c', 'state')!.room.seats[0]).toMatchObject({ media: { cam: true, mic: false } });
  });

  it('drops malformed messages and requires hello first', () => {
    const env = new FakeEnv();
    env.room.open('x');
    env.room.message('x', '{not json');
    env.room.message('x', JSON.stringify({ t: 'sit', seat: 0 }));
    expect(env.errors('x').map((e) => e.code)).toEqual(['BAD_MESSAGE', 'NOT_JOINED']);
  });
});



describe('nuke intensity (table setting)', () => {
  it('defaults to full; host-only; validated; synced to everyone', () => {
    const env = new FakeEnv();
    env.join('a', 'Host'); env.join('b', 'Guest');
    env.send('a', { t: 'sit', seat: 0 }); env.send('b', { t: 'sit', seat: 2 });
    expect(env.last('b', 'state')!.room.nukeIntensity).toBe('full');
    env.send('b', { t: 'config', rules: { playerCount: 4, turnTimerSec: 30 }, nukeIntensity: 'off' });
    expect(env.errors('b').at(-1)!.code).toBe('NOT_HOST');
    env.send('a', { t: 'config', rules: { playerCount: 4, turnTimerSec: 30 }, nukeIntensity: 'classic' });
    expect(env.last('b', 'state')!.room.nukeIntensity).toBe('classic');
    env.send('a', { t: 'config', rules: { playerCount: 4, turnTimerSec: 30 }, nukeIntensity: 'mega' } as never);
    expect(env.last('b', 'state')!.room.nukeIntensity).toBe('classic');
  });
});


describe('table talk + host music', () => {
  it('host music: beats are synced by server start time; links are validated; only the host can change it', () => {
    const env = new FakeEnv();
    env.join('a', 'Host'); env.join('b', 'Guest');
    env.send('b', { t: 'music', music: { mode: 'beat', track: 1, startAt: 0 } });
    expect(env.errors('b').at(-1)!.code).toBe('NOT_HOST');
    env.send('a', { t: 'music', music: { mode: 'beat', track: 2, startAt: 0 } });
    const m = env.last('b', 'state')!.room.music!;
    expect(m).toMatchObject({ mode: 'beat', track: 2 });
    expect((m as { startAt: number }).startAt).toBeGreaterThan(env.t);
    env.send('a', { t: 'music', music: { mode: 'link', url: 'https://evil.example.com/x', title: 'x' } });
    expect(env.errors('a').at(-1)!.code).toBe('BAD_MESSAGE');
    env.send('a', { t: 'music', music: { mode: 'link', url: 'https://open.spotify.com/track/abc', title: 'Song' } });
    expect(env.last('b', 'state')!.room.music).toEqual({ mode: 'link', url: 'https://open.spotify.com/track/abc', title: 'Song' });
    env.send('a', { t: 'music', music: { mode: 'stream', by: 'someone-else', title: 'My mix' } });
    expect(env.last('b', 'state')!.room.music).toMatchObject({ mode: 'stream', by: env.last('a', 'welcome')!.you });
    env.send('a', { t: 'leave' });
    expect(env.last('b', 'state')!.room.music).toBeUndefined();
    env.send('b', { t: 'music', music: { mode: 'off' } }); // b is host now
    expect(env.last('b', 'state')!.room.music).toBeUndefined();
  });
});



describe('AFK + kicking', () => {
  const soloGame = (afkLimit?: number) => {
    const env = new FakeEnv(undefined, FAST);
    const a = env.join('a', 'Slow');
    env.send('a', { t: 'sit', seat: 0 });
    env.send('a', { t: 'config', rules: { playerCount: 4, turnTimerSec: 5 }, ...(afkLimit !== undefined ? { afkLimit } : {}) });
    env.send('a', { t: 'start' });
    return { env, a };
  };
  const waitMyTurn = (env: FakeEnv) => { for (let i = 0; i < 200 && !(env.room.data.seats[0]!.kind === 'human' && env.room.data.game!.turn === 0 && env.room.data.game!.phase !== 'handOver'); i++) env.advance(50); };




  it('host kick: a bot takes the seat, the player is disconnected and cannot rejoin this game', () => {
    const { env, ps } = fourHumans();
    env.send('a', { t: 'start' });
    env.send('a', { t: 'kick', seat: 1 });
    const d = env.room.data;
    expect(d.seats[1]).toMatchObject({ kind: 'bot' });
    expectPoolBot(d.seats, 1);
    expect(d.members[ps[1]!.pid]).toBeUndefined();
    expect(env.closed).toContain('b');
    expect(env.errors('b').some((e) => e.code === 'KICKED')).toBe(true);
    env.room.open('b2');
    env.send('b2', { t: 'hello', name: 'Ray', token: ps[1]!.token });
    expect(env.last('b2', 'welcome')).toBeUndefined();
    expect(env.errors('b2')[0]!.code).toBe('KICKED');
    // a non-host "kick" is only a vote; nobody can kick themselves
    env.send('c', { t: 'kick', seat: 2 });
    expect(env.errors('c').at(-1)!.code).toBe('BAD_SEAT');
  });

});








describe('venues (Release 7)', () => {
  const room = (env: FakeEnv, cid: string) => env.last(cid, 'state')!.room;
  it('the host picks the venue in the lobby; everyone sees the same one; locked during a game', () => {
    const { env } = fourHumans();
    expect(room(env, 'b').venue).toBe('classic');
    env.send('b', { t: 'venue', venue: 'beach' });
    expect(env.errors('b').at(-1)!.code).toBe('NOT_HOST');
    env.send('a', { t: 'venue', venue: 'speakeasy' });
    for (const cid of ['a', 'b', 'c', 'd']) { expect(room(env, cid).venue).toBe('speakeasy'); expect(room(env, cid).venueNow).toBe('speakeasy'); }
    // garbage is dropped by the parser
    env.send('a', { t: 'venue', venue: 'moon' } as never);
    expect(room(env, 'a').venue).toBe('speakeasy');
    env.send('a', { t: 'start' });
    expect(room(env, 'c').venueNow).toBe('speakeasy');
    env.send('a', { t: 'venue', venue: 'yacht' });
    expect(env.errors('a').at(-1)!.code).toBe('IN_GAME');
    expect(room(env, 'd').venue).toBe('speakeasy');
  });
  it('Random is rolled once per game on the server, the same for every player, never classic', () => {
    const { env } = fourHumans();
    env.send('a', { t: 'venue', venue: 'random' });
    expect(room(env, 'a').venue).toBe('random');
    expect(room(env, 'a').venueNow).toBeUndefined();
    env.send('a', { t: 'start' });
    const v = room(env, 'a').venueNow;
    expect(v).toBeDefined();
    expect(v).not.toBe('classic');
    for (const cid of ['b', 'c', 'd']) expect(room(env, cid).venueNow).toBe(v);
  });

  /* The Pj's lock: the picker gate is a courtesy — the room itself enforces it. */
  function hostTable() {
    const env = new FakeEnv(undefined, FAST);
    env.join('a', 'Dee');
    env.send('a', { t: 'sit', seat: 0 });
    for (const s of [1, 2, 3]) env.send('a', { t: 'addBot', seat: s });
    return env;
  }
  it("a direct venue message can't walk a locked host into The Pj's (venue unchanged, no error)", () => {
    const env = hostTable(); // no entitlement stamp at all (guest / unverified)
    env.send('a', { t: 'venue', venue: 'blockAfterDark' });
    expect(env.room.data.venue ?? 'classic').toBe('classic');
    expect(env.room.data.venueNow).toBeUndefined();
    expect(env.errors('a')).toEqual([]);
    env.room.setVenueAccess('a', false); // verified account, still not entitled
    env.send('a', { t: 'venue', venue: 'blockAfterDark' });
    expect(env.room.data.venue ?? 'classic').toBe('classic');
    // normal venues are never gated
    env.send('a', { t: 'venue', venue: 'beach' });
    expect(env.room.data.venue).toBe('beach');
    expect(env.room.data.venueNow).toBe('beach');
  });
  it("an entitled host picks The Pj's directly and plays there", () => {
    const env = hostTable();
    env.room.setVenueAccess('a', true); // the DO's stamp: unlock row / Rep 20+ / admin
    env.send('a', { t: 'venue', venue: 'blockAfterDark' });
    expect(room(env, 'a').venue).toBe('blockAfterDark');
    env.send('a', { t: 'start' });
    expect(room(env, 'a').venueNow).toBe('blockAfterDark');
  });
  it('a stale locked pick in saved room data falls back to classic when an unentitled host starts', () => {
    const env = hostTable();
    env.room.data.venue = 'blockAfterDark'; // a room saved before the gate existed
    env.send('a', { t: 'start' });
    expect(env.room.data.venueNow).toBe('classic');
  });
});

/* ------------------------------------------------------------ Release 10: spectators */
describe('spectators', () => {
  function liveGame() {
    const env = new FakeEnv(undefined, FAST);
    const a = env.join('a', 'Dee');
    env.send('a', { t: 'sit', seat: 0 });
    for (const s of [1, 2, 3]) env.send('a', { t: 'addBot', seat: s });
    env.send('a', { t: 'start' });
    return { env, a };
  }
  const handCards = (v: unknown) => JSON.stringify(v);




  it('room info lists spectators and the takeable seats; tableOpts (host) can lock bots and make the table private', () => {
    const { env, a } = liveGame();
    env.join('s', 'Watcher');
    const room = env.last('a', 'state')!.room;
    expect(room.spectators!.map((x) => x.name)).toEqual(['Watcher']);
    expect(room.takeable).toEqual([1, 2, 3]);
    env.send('s', { t: 'tableOpts', replaceBots: false });
    expect(env.errors('s').map((e) => e.code)).toContain('NOT_HOST');
    env.send('a', { t: 'tableOpts', replaceBots: false, private: true });
    expect(env.last('s', 'state')!.room.takeable).toEqual([]);
    env.send('s', { t: 'sit', seat: 1 });
    expect(env.errors('s').map((e) => e.code)).toContain('SEAT_LOCKED');
    expect(env.room.listing()).toBeNull();
    void a;
  });




  it('spectator chat is tagged, rate limited harder, and profanity-filtered', () => {
    const { env } = liveGame();
    env.join('s', 'Sam');
    env.send('s', { t: 'chat', text: 'nice shit play' });
    const line = env.last('a', 'chat')!.line;
    expect(line.spectator).toBe(true);
    expect(line.text).not.toContain('shit');
    env.send('a', { t: 'chat', text: 'thanks' });
    expect(env.last('s', 'chat')!.line.spectator).toBeUndefined();
    env.send('s', { t: 'chat', text: '2' }); env.send('s', { t: 'chat', text: '3' }); env.send('s', { t: 'chat', text: '4' });
    expect(env.errors('s').map((e) => e.code)).toContain('RATE_LIMITED');
  });

  it('max 20 spectators per table while a game is on', () => {
    const { env } = liveGame();
    for (let i = 0; i < 20; i++) env.join(`s${i}`, `W${i}`);
    env.room.open('s20');
    env.room.message('s20', JSON.stringify({ t: 'hello', name: 'TooMany' }));
    expect(env.errors('s20').map((e) => e.code)).toContain('TABLE_FULL');
  });

  it('WebRTC: a spectator may signal with a seated player mid-game, never with another spectator', () => {
    const { env, a } = liveGame();
    const s = env.join('s', 'Sam'); const t = env.join('t', 'Tia');
    env.send('s', { t: 'rtc', to: a.pid, data: { x: 1 } });
    expect(env.last('a', 'rtc')).toEqual({ t: 'rtc', from: s.pid, data: { x: 1 } });
    env.send('s', { t: 'rtc', to: t.pid, data: { x: 2 } });
    expect(env.msgs('t').some((m) => m.t === 'rtc')).toBe(false);
  });

});

describe('room lifecycle', () => {
  const tok = (s: string) => (s + '0123456789abcdef0123456789abcdef').slice(0, 32);
  const acks = (env: FakeEnv, cid: string) => env.msgs(cid).filter((m) => m.t === 'ack') as Extract<ReturnType<FakeEnv['msgs']>[number], { t: 'ack' }>[];

  it('the same seat token is one member, so a second tab cannot take a second seat', () => {
    const env = new FakeEnv();
    const t = tok('tab');
    const a = env.join('a', 'Dee', t);
    const b = env.join('b', 'Dee', t);
    expect(b.pid).toBe(a.pid);
    expect(b.token).toBe(t);
    expect(Object.keys(env.room.data.members)).toHaveLength(1);
    expect(env.closed).toContain('a');
    env.send('b', { t: 'sit', seat: 0 });
    env.send('a', { t: 'sit', seat: 2 });
    expect(env.errors('a').at(-1)!.code).toBe('NOT_JOINED');
    expect(env.room.data.seats.flatMap((s) => (s.kind === 'human' ? [s.playerId] : []))).toEqual([a.pid]);
  });

  it('the same account is one seat, even with a new token, including mid-game', () => {
    const env = new FakeEnv(undefined, FAST);
    const a = env.join('a', 'Dee', tok('old'), 'user-dee');
    env.send('a', { t: 'sit', seat: 0 });
    for (const s of [1, 2, 3]) env.send('a', { t: 'addBot', seat: s });
    env.send('a', { t: 'start' });
    const b = env.join('b', 'Dee', tok('new'), 'user-dee');
    expect(b.pid).toBe(a.pid);
    expect(env.room.data.seats.flatMap((s) => (s.kind === 'human' ? [s] : []))).toHaveLength(1);
    expect(env.room.data.seats[0]).toMatchObject({ kind: 'human', playerId: a.pid });
    env.send('b', { t: 'sit', seat: 2 });
    expect(env.errors('b').at(-1)!.code).toBe('IN_GAME');
    expect(env.room.data.seats[2]!.kind).toBe('bot');
  });

  it('linking one account onto two seated members keeps a single seat', () => {
    const env = new FakeEnv();
    const a = env.join('a', 'Dee');
    const b = env.join('b', 'Dee');
    env.room.linkUser('a', 'user-dee');
    env.send('a', { t: 'sit', seat: 0 });
    env.send('b', { t: 'sit', seat: 2 });
    env.room.linkUser('b', 'user-dee');
    expect(Object.keys(env.room.data.members)).toEqual([a.pid]);
    expect(env.room.data.members[a.pid]!.uid).toBe('user-dee');
    expect(env.room.data.seats[0]).toMatchObject({ kind: 'human', playerId: a.pid });
    expect(env.room.data.seats[2]).toEqual({ kind: 'empty' });
    expect(env.last('b', 'welcome')!.you).toBe(a.pid);
  });

  it('a kick sticks to the account, so a fresh token cannot rejoin this game', () => {
    const env = new FakeEnv(undefined, FAST);
    env.join('a', 'Host');
    const b = env.join('b', 'Ray', tok('ray'), 'user-ray');
    env.send('a', { t: 'sit', seat: 0 });
    env.send('b', { t: 'sit', seat: 1 });
    env.send('a', { t: 'addBot', seat: 2 });
    env.send('a', { t: 'addBot', seat: 3 });
    env.send('a', { t: 'start' });
    env.send('a', { t: 'kick', seat: 1 });
    expect(env.room.data.kicked).toEqual(expect.arrayContaining([b.token, 'user-ray']));
    env.room.open('b2');
    env.room.message('b2', JSON.stringify({ t: 'hello', name: 'Ray', token: tok('fresh') }), 'user-ray');
    expect(env.last('b2', 'welcome')).toBeUndefined();
    expect(env.errors('b2')[0]!.code).toBe('KICKED');
    expect(env.closed).toContain('b2');
    expect(Object.values(env.room.data.members).some((m) => m.uid === 'user-ray')).toBe(false);
  });



  it('a seated host who disconnects passes host after a grace period, so the table can start', () => {
    const env = new FakeEnv();
    const a = env.join('a', 'Dee');
    const b = env.join('b', 'Ray');
    env.send('a', { t: 'sit', seat: 0 });
    env.send('b', { t: 'sit', seat: 1 });
    env.room.close('a');
    env.advance(HOST_DISCONNECT_GRACE_MS - 1000);
    expect(env.last('b', 'state')!.room.hostId).toBe(a.pid);
    env.send('b', { t: 'start' });
    expect(env.errors('b').at(-1)!.code).toBe('NOT_HOST');
    env.advance(2000);
    expect(env.last('b', 'state')!.room.hostId).toBe(b.pid);
    expect(env.room.data.chat.some((l) => l.text === 'Ray is now the host')).toBe(true);
    env.send('b', { t: 'start' });
    expect(env.room.data.phase).toBe('playing');
    expect(env.room.data.seats[0]).toMatchObject({ kind: 'human', playerId: a.pid });
  });

  it('reconnecting within the grace keeps the host', () => {
    const env = new FakeEnv();
    const a = env.join('a', 'Dee');
    env.join('b', 'Ray');
    env.send('a', { t: 'sit', seat: 0 });
    env.room.close('a');
    env.advance(10_000);
    const again = env.join('z', 'Dee', a.token);
    expect(again.pid).toBe(a.pid);
    expect(env.last('b', 'state')!.room.hostId).toBe(a.pid);
  });

  it('a disconnected host no longer blocks rematch once the grace has passed', () => {
    const env = new FakeEnv();
    const a = env.join('a', 'Dee');
    const b = env.join('b', 'Ray');
    env.send('a', { t: 'sit', seat: 0 });
    env.send('b', { t: 'sit', seat: 1 });
    env.room.data.phase = 'over';
    env.room.close('a');
    env.advance(HOST_DISCONNECT_GRACE_MS - 1000);
    env.send('b', { t: 'rematch' });
    expect(env.errors('b').at(-1)!.code).toBe('NOT_HOST');
    env.advance(2000);
    env.send('b', { t: 'rematch' });
    expect(env.room.data.phase).toBe('playing');
    expect(env.room.data.hostId).toBe(b.pid);
  });

  it('disconnected unseated members do not count toward the table caps', () => {
    const env = new FakeEnv(undefined, FAST);
    const a = env.join('a', 'Dee');
    env.send('a', { t: 'sit', seat: 0 });
    env.send('a', { t: 'start' });
    for (let i = 0; i < 20; i++) env.join(`s${i}`, `W${i}`);
    env.room.open('full');
    env.room.message('full', JSON.stringify({ t: 'hello', name: 'Full' }));
    expect(env.errors('full').map((e) => e.code)).toContain('TABLE_FULL');
    for (let i = 0; i < 20; i++) env.room.close(`s${i}`);
    expect(Object.keys(env.room.data.members)).toEqual([a.pid]);
    const late = env.join('late', 'Late');
    expect(late.pid).toBeTruthy();
    expect(env.errors('late')).toEqual([]);
    expect(env.last('a', 'state')!.room.spectators).toEqual([{ playerId: late.pid, name: 'Late' }]);
    // a spectator whose socket vanished without close (hibernation) is dropped on the next hello
    env.join('ghost', 'Ghost');
    env.restart([['a', a.pid]]);
    expect(Object.values(env.room.data.members).some((m) => m.name === 'Ghost')).toBe(true);
    env.join('back', 'Back');
    expect(Object.values(env.room.data.members).map((m) => m.name).sort()).toEqual(['Back', 'Dee']);
  });

});

