/**
 * The game room: everything a Table Durable Object does, minus the Cloudflare plumbing, so it can be
 * unit-tested with mock sockets and a fake clock. The server is the referee (spec §4.2):
 *  - it shuffles/deals (packages/rules), validates every bid/play, and only ever sends a seat its own view;
 *  - bots (packages/bots) fill empty seats and play from that seat's view only;
 *  - human turns have a deadline from that table's timer; a disconnect waits the same length
 *    (not a fixed 10s) and then the bot logic plays that turn. The seat stays the human's unless they explicitly leave;
 *  - all durable state lives in one plain-JSON `RoomData` object that the DO saves as a single row.
 */
import type { ModeId, OptionValues } from '@pp/game';
import { RuleError as ModeRuleError, pickBotName } from '@pp/game';
import { type ModeGame, cleanModeOptions, isMode, modeApply, modeBotMove, modeLegal, modeResults, modeSeatRange, modeToAct, modeView, newModeGame, tierForLevel } from './engine';
import {
  type BotLevel, type ChatLine, type ClientMsg, type HostMusic, type MediaState, type RoomInfo, type RoomPhase, type SeatInfo, type ServerMsg,
  DEFAULT_AFK_LIMIT, DEFAULT_TABLE_RULES, TURN_TIMER_LIMITS, LIMITS, PROTOCOL_VERSION, parseClientMsg, toggleReaction,
  HAND_END_HOLD_MS, NUKE_ALLOWANCE_MS, handEndLeadMs, type NukeIntensity, type TalkIntensity, cleanTeamName, pickTeamName, type VenueChoice, type VenueId, isLockedVenue, rollVenue,
} from '@pp/protocol';
import type { OpenTable } from '@pp/protocol';
import { blockLinks, cleanName, cleanText, maskProfanity } from './filter';
import { extractMentionKeys } from './social/mentions';

export const ROOM_DATA_VERSION = 1;

export type SeatSlot =
  | { kind: 'empty' }
  /** vacated: a bot that took over from a player who left / was kicked / went AFK (always open to spectators).
   *  replacedPid: the member who still owns this seat after a disconnect. A reconnect reclaims it; a leave does not set this. */
  | { kind: 'bot'; name: string; level: BotLevel; vacated?: boolean; /** display name of the human this bot replaced */ was?: string; replacedPid?: string }
  | { kind: 'human'; playerId: string };

export interface Member {
  name: string;
  token: string;
  seat: number | null;
  media: MediaState;
  joinedAt: number;
  /** tips on: own turn timers ×1.5 */
  learning?: boolean;
  /** consecutive turns this player ran out of time on (reset by any move of their own) */
  timeouts?: number;
  /** ids of this player's most recently applied actions (idempotency for retries after a reconnect) */
  acts?: string[];
  /** badges earned at this table (same shape as the client's local badges, for a future accounts system) */
  badges?: { id: string; earnedAt: number; context?: Record<string, unknown> }[];
  /** Release 9: signed-in account behind this seat (from a verified account ticket) → stats, ratings, recent players */
  uid?: string;
  /** Entitled to locked venues (The Pj's): stamped by the DO when the account ticket verifies
   *  (After Dark unlock row, Rep level 20+, or an admin account). Absent = not entitled. */
  venueAccess?: boolean;
  /** Browser guest id. A reload that minted a new seat token is still this member. */
  gid?: string;
  /** Epoch ms of the last socket drop. The disconnect grace is measured from here, not from each tick. */
  disconnectedAt?: number;
  /** False while this client's table is still drawing. Unset means an older client: the clock may run. */
  interactive?: boolean;
  /** Epoch ms when the loader started holding this player's turn clock. */
  loaderSince?: number;
}

/** Everything that survives hibernation / restarts. Plain JSON. */
export interface RoomData {
  /** registry mode (@pp/game) for this table; new tables default to the placeholder */
  modeId: ModeId;
  modeOptions?: OptionValues;
  /** the live registry-mode game (null/absent between games and on Spades tables) */
  mg?: ModeGame | null;
  v: number;
  code: string;
  createdAt: number;
  lastActive: number;
  hostId: string | null;
  phase: RoomPhase;
  rules: TableRules;
  botLevel: BotLevel;
  seats: SeatSlot[];
  members: Record<string, Member>;
  /** key of the turn the deadline belongs to */
  turnKey: string | null;
  turnStartedAt: number | null;
  deadline: number | null;
  ready: string[];
  chat: ChatLine[];
  chatSeq: number;
  rev: number;
  /** game version (see RoomInfo.seq); optional only for rooms saved before it existed */
  seq?: number;
  /** host-set Table Talk countdown (s); unset = timing.handOverMs */
  talkSec?: number;
  music?: HostMusic;
  /** Kept for older clients. Timeouts are counted; they never hand the seat to a bot. */
  afkLimit?: number;
  /** host option: partner voice limiting during trick play (from the first card led); unset = off */
  partnerMicMute?: boolean;
  nukeIntensity?: NukeIntensity;
  talkIntensity?: TalkIntensity;
  /** host flag: pre-voiced AI catalog lines (default off); also gates the Voice (c) line writer */
  aiTalk?: boolean;
  venue?: VenueChoice;
  venueNow?: VenueId;
  /** host option: bot trash talk (default on) */
  botTalk?: boolean;
  /** per side: custom team name (null/unset = partner names) */
  teamNames?: (string | null)[];
  /** seat tokens and account ids kicked during the current game (can't rejoin until the next game starts) */
  kicked?: string[];
  /** open vote-kicks: target player id → voter ids */
  votes?: Record<string, string[]>;
  gamesPlayed: number;
  /** Release 10: hidden from Open tables (invite / code only) */
  private?: boolean;
  /**
   * Spectators may take bot seats mid-game.
   * unset = on, except at a rated table (a signed-in player facing a human on another side), where the default is off.
   * A seat a player left is always open. true/false are explicit host choices.
   */
  replaceBots?: boolean;
  /** epoch ms when the host's last socket dropped; another connected member becomes host after HOST_DISCONNECT_GRACE_MS */
  hostAwaySince?: number;
  /**
   * When the current bot turn should move (epoch ms). Saved with the row so a hibernated table
   * still knows the deadline; the in-memory wake alone does not survive.
   */
  botDueAt?: number | null;
}

/** Release 9b: this table plays one tournament match (rules locked, seats reserved for the entrants, autostart). */
export interface TournamentSeat {
  id: string;
  match: string;
  name?: string;
  /** per seat: the account that owns it (null = a bot plays) */
  reserved: ({ uid: string; name: string } | null)[];
  autostartAt: number | null;
  /** bots play for entrants who don't show (off = a side with nobody present forfeits) */
  bots: boolean;
  /** local test runs: fast bot timing */
  fast?: boolean;
  reported?: boolean;
  /** everyone left mid-match since … (after a grace period the match is played out by bots so the bracket can't stall) */
  emptySince?: number;
}

/** Big Bank Take Lil Bank: this table plays one wager match (rules locked, seats reserved for the four players, NO bot fill — coins are escrowed). */
export interface ChallengeSeat {
  id: string;
  /** per seat: the account that owns it (challenge tables always reserve all four seats) */
  reserved: ({ uid: string; name: string } | null)[];
  autostartAt: number | null;
  reported?: boolean;
  /** each side's team name from challenge setup ([side 0, side 1]); seeds the room's team names */
  teamNames?: [string | null, string | null];
}

/** Big Bank: how a wager match ended, reported exactly once to the Challenge DO, which settles the escrow. */
export type ChallengeResult =
  | { kind: 'played'; scores: number[]; places: number[]; gameId: string }
  | { kind: 'noshow'; shown: string[] }
  | { kind: 'abandoned'; leaverUid: string | null };

export interface RoomTiming {
  /** delay before a bot moves */
  botMs: number;
  /** extra pause after a trick completes (clients show the finished trick) */
  trickPauseMs: number;
  /** extra pause at the start of a hand (shuffle + deal animation) */
  dealMs: number;
  /** how long a disconnected player's turn waits before auto-play */
  disconnectGraceMs: number;
  /** hand-results screen: auto-continue after this long even if not everyone pressed Next */
  handOverMs: number;
  /** extra Table Talk lead-in so the countdown starts as the score screen opens (default HAND_END_HOLD_MS; tests use 0) */
  handEndHoldMs?: number;
  /** pre-deal setup window before a game's first hand (default PRE_DEAL_MS; tests use 0 for instant deals) */
  preDealMs?: number;
}

/** learning mode (a player with tips on): their own turn timer runs this much longer */
export const LEARNING_TIMER = 1.5;
/** tournament table with nobody connected: play the match out after this long */
export const TOURNAMENT_EMPTY_GRACE_MS = 90_000;
/** seated host dropped without leaving: pass host after this long so the table can still start or rematch */
export const HOST_DISCONNECT_GRACE_MS = 30_000;
export const DEFAULT_TIMING: RoomTiming = { botMs: 750, trickPauseMs: 1300, dealMs: 3200, disconnectGraceMs: 10_000, handOverMs: 20_000 };
/** A loader that never reports ready must not freeze the table. Matches the client's give-up. */
export const LOADER_HOLD_MAX_MS = 45_000;
/**
 * Pre-deal setup window (owner, 2026-10-20): cards do NOT deal the instant a game
 * starts. The room creates the game undealt and holds the first deal this long —
 * the versus intro dismisses, the table is fully loaded and visible, and players
 * get a real window to set cameras/mics before anyone sees a card. Server-held so
 * every seat's deal (and the 30s bid clock behind it) starts at the same moment.
 * Length (owner, 2026-10-21): the window runs WHILE the versus intro plays, and
 * the intro is ~10s of visible story — so the window is those ~10s plus ~4s of
 * on-table countdown the players actually see before the deal lands.
 */
export const PRE_DEAL_MS = 14_000;
/**
 * After a bot's scheduled delay, this much longer with the turn still unmoved means the brain
 * did not resolve it. The server then plays a legal bid or card itself.
 */
export const BOT_WATCHDOG_MS = 5_000;

/** What the host environment (Durable Object or test harness) provides. */
export interface RoomIO {
  now(): number;
  send(connId: string, msg: ServerMsg): void;
  /** close a connection (e.g. a duplicate socket for the same player) */
  close?(connId: string, code: number, reason: string): void;
  /** ask for `tick()` to be called after `ms` (in-memory timer; short delays only) */
  wake(ms: number): void;
  /** durable wake-up at an absolute time (DO alarm). null = nothing pending. */
  setAlarm(at: number | null): void;
  /** state changed: save it (the DO batches/debounces this) */
  persist(): void;
  /** random id/token/seed source (crypto in prod, seeded in tests) */
  randomId(): string;
  /** A registry-mode game finished (generic record: placements, coin changes, mode recap). The DO stores it in D1 (mode_games). */
  modeGameOver?(rec: ModeGameRecord): void;
  /** registered-but-unlisted modes this deployment may open anyway (env PREVIEW_MODES; empty in production) */
  previewModes?: readonly string[];
  // TODO(rebuild, docs/plan/REBUILD.md): rated games/Elo (gameOver) and live highlights (highlight) were Spades-only and are off.
  /** Release 9b: a tournament match finished (per side: final score and placement, 1 = won) */
  tournamentResult?(t: TournamentSeat, scores: number[], places: number[]): void;
  /** Big Bank: a wager match resolved (played out, a no-show at the start deadline, or abandoned mid-match) */
  challengeResult?(c: ChallengeSeat, r: ChallengeResult): void;
  /** Release 10: this table's Open tables entry (null = unlisted); called after every broadcast, the DO dedups */
  listing?(t: OpenTable | null): void;
  /** Voice (c): a persona's catalog bucket for a set/Wheels/win moment is thin; the DO runs the writer in waitUntil */
  voiceMiss?(req: import('./voice/writer').WriterRequest): void;
  /** Push: a new bid/play turn began for `seat` (the DO notifies the player when they have no live socket). */
  turnBegan?(seat: number, kind: 'bid' | 'play'): void;
  /**
   * @mentions: resolve username_keys (from a cleaned table-chat line) to
   * account uids — username_key → uid. The DO answers from D1 (users +
   * blocks): accounts in a block relationship with `authorUid` (either
   * direction) are excluded, mirroring the Social hub's rule. Omit the
   * hook and table chat simply carries no mentions.
   */
  lookupUsernames?(keys: string[], authorUid: string | null): Promise<Record<string, string>>;
  /**
   * Mute (migration 0030): the account uids whose table chat `viewerUid`
   * has muted — served synchronously from the DO's D1-backed cache (it
   * refreshes in the background). pushChat and the welcome history skip a
   * muted author's lines for that viewer only. Omit and nothing is muted.
   */
  mutedAuthors?(viewerUid: string): ReadonlySet<string> | undefined;
  /**
   * A table-chat line mentioned a member who is NOT connected right now:
   * the DO pushes them (mute + prefs + cooldown live in notifyMention).
   */
  chatMention?(info: { toUid: string; authorUid: string; authorName: string; text: string; code: string }): void;
}


/** Generic record of one finished registry-mode game (the stats/coins seam; replaces the Spades GameRecord). */
export interface ModeGameRecord {
  id: string;
  room: string;
  modeId: ModeId;
  options: OptionValues;
  endedAt: number;
  seats: { seat: number; uid: string | null; name: string; bot: boolean }[];
  placements: number[];
  deltas: number[];
  recap: unknown;
}

/** Table settings shape shared with clients (protocol); the room only reads playerCount + turn timers from it. */
type TableRules = RoomInfo['rules'];

export function newRoomData(code: string, now: number, rules: TableRules): RoomData {
  return {
    v: ROOM_DATA_VERSION, code, createdAt: now, lastActive: now, hostId: null, phase: 'lobby',
    rules, botLevel: 'mixed', seats: Array.from({ length: 4 }, () => ({ kind: 'empty' as const })), members: {},
    modeId: 'placeholder', modeOptions: {}, mg: null, turnKey: null, turnStartedAt: null, deadline: null, ready: [], chat: [], chatSeq: 1, rev: 0, seq: 0, gamesPlayed: 0,
  };
}

/** Host table settings are untrusted: only the seat count (2–4) and turn timers are taken; the rest stays as it was. */
/** The seats a table can offer for a mode: the registry range, capped by the room's 4 seats. */
export function tableSeatRange(id: ModeId): { min: number; max: number } {
  const { min, max } = modeSeatRange(id);
  return { min: Math.min(min, MAX_TABLE_SEATS), max: Math.min(max, MAX_TABLE_SEATS) };
}
const MAX_TABLE_SEATS = 4;

function clampRules(prev: TableRules, r: unknown): TableRules {
  const x = (r && typeof r === 'object' ? r : {}) as Partial<TableRules>;
  const pc = typeof x.playerCount === 'number' && Number.isInteger(x.playerCount) ? Math.min(4, Math.max(2, x.playerCount)) : prev.playerCount;
  const t = x.turnTimerSec;
  const timer = typeof t === 'number' && Number.isFinite(t) ? Math.min(TURN_TIMER_LIMITS.max, Math.max(TURN_TIMER_LIMITS.min, Math.round(t))) : prev.turnTimerSec;
  return { playerCount: pc, turnTimerSec: timer };
}

export class Room {
  /** connection id → player id (null until `hello`) */
  private conns = new Map<string, string | null>();
  private chatWindow = new Map<string, number[]>();
  /** serializes async @mention resolution so table chat lines post in send order */
  private chatChain: Promise<void> = Promise.resolve();
  /** emoji-reaction rate limiter: pid → timestamps (10 s window) */
  private reactWindow = new Map<string, number[]>();

  constructor(public data: RoomData, private io: RoomIO, private timing: RoomTiming = DEFAULT_TIMING) {
    data.seq ??= 0;
  }

  /** One JSON line per table event. Wrangler tail and Workers logs can filter `src=bwm.table`. */
  private trace(event: string, fields: Record<string, unknown>): void {
    console.log(JSON.stringify({ src: 'bwm.table', event, table: this.data.code, at: this.io.now(), ...fields }));
  }

  /** The Durable Object calls this before `close`, while the socket is still bound. */
  noteSocketClose(connId: string, code: number, reason: string, wasClean: boolean): void {
    const pid = this.conns.get(connId) ?? null;
    const m = pid ? this.data.members[pid] : undefined;
    let others = 0;
    if (pid) for (const [cid, p] of this.conns) if (p === pid && cid !== connId) others++;
    this.trace('socket_close', {
      cid: connId, code, reason: reason.slice(0, 120), wasClean, pid, seat: m?.seat ?? null, name: m?.name ?? null, otherSockets: others,
    });
  }

  /* ------------------------------------------------------------ connections */

  /** Re-register a connection that survived hibernation (DO wake-up). A null id must not wipe a live binding. */
  restoreConnection(connId: string, playerId: string | null): void {
    if (playerId && this.data.members[playerId]) {
      this.conns.set(connId, playerId);
      return;
    }
    if (!this.conns.has(connId)) this.conns.set(connId, null);
  }

  open(connId: string): void {
    this.conns.set(connId, null);
  }

  close(connId: string): void {
    const pid = this.conns.get(connId);
    this.sentHistory.delete(connId);
    this.conns.delete(connId);
    if (!pid || this.isConnected(pid)) return;
    const m = this.data.members[pid];
    // The grace starts when the last socket actually drops. A second socket for this
    // player returns above, so a reload is not a leave and does not start a new grace.
    if (m) m.disconnectedAt = this.io.now();
    if (m && m.seat === null) {
      // an unseated member who dropped, in any phase: forget them so they don't fill the table.
      // A seat held by their replacement bot is not forgotten — the reconnect reclaims it.
      this.dropGhosts();
    } else if (m && this.data.hostId === pid) {
      this.data.hostAwaySince ??= this.io.now();
    }
    this.after();
  }

  isConnected(playerId: string): boolean {
    for (const p of this.conns.values()) if (p === playerId) return true;
    return false;
  }

  connectionCount(): number {
    return this.conns.size;
  }

  humansConnected(): number {
    return this.data.seats.filter((s) => s.kind === 'human' && this.isConnected(s.playerId)).length;
  }

  /** Release 9: the connection proved an account (verified ticket): link its member for stats. One account, one seat. */
  linkUser(connId: string, uid: string): void {
    const pid = this.conns.get(connId);
    const m = pid ? this.data.members[pid] : undefined;
    if (!m || !pid) return;
    if (this.kickedOut(undefined, uid)) { this.rejectKick(connId); return; }
    if (m.uid === uid) return;
    this.claimAccount(pid, uid);
    const now = this.conns.get(connId) ?? pid;
    if (now !== pid) {
      const kept = this.data.members[now];
      if (kept) this.io.send(connId, { t: 'welcome', you: now, token: kept.token, code: this.data.code, chat: this.visibleChat(now), v: PROTOCOL_VERSION });
    }
    this.after();
    this.io.persist();
  }

  /** The DO stamps locked-venue entitlement (The Pj's) on the member whose account ticket
   *  verified with access — see dispatchTableMessage. Re-stamped on every verified hello,
   *  so a fresh unlock (or a lost one) lands on the next reconnect. */
  setVenueAccess(connId: string, ok: boolean): void {
    const pid = this.conns.get(connId);
    const m = pid ? this.data.members[pid] : undefined;
    if (m) m.venueAccess = ok;
  }

  /** Locked venues are the HOST's privilege: only their entitlement counts at this table. */
  private hostVenueAccess(): boolean {
    const h = this.data.hostId;
    return !!h && this.data.members[h]?.venueAccess === true;
  }

  /** member ids → account ids (for tournament / stats bookkeeping) */
  accountOf(pid: string): string | undefined { return this.data.members[pid]?.uid; }

  /** a client-minted seat token: long enough that it isn't guessable, and safe to store */
  private tokenOk(token: string): boolean {
    return /^[A-Za-z0-9_-]{16,100}$/.test(token);
  }

  private kickedOut(token?: string, uid?: string, gid?: string): boolean {
    const k = this.data.kicked ?? [];
    return (!!token && k.includes(token)) || (!!uid && k.includes(uid)) || (!!gid && this.gidOk(gid) && k.includes(gid));
  }

  /** Same shape the browser mints for `bwm.social.guest`. */
  private gidOk(gid: string): boolean {
    return /^[A-Za-z0-9_-]{8,64}$/.test(gid);
  }

  private rejectKick(connId: string): void {
    this.err(connId, 'KICKED', 'You were removed from this table for this game');
    this.conns.delete(connId);
    this.io.close?.(connId, 4003, 'kicked');
  }

  /** members who still occupy a slot: seated, or unseated and actually connected */
  private liveCounts(): { members: number; watching: number } {
    let members = 0, watching = 0;
    for (const [id, m] of Object.entries(this.data.members)) {
      if (m.seat === null && !this.isConnected(id)) continue;
      members++;
      if (m.seat === null) watching++;
    }
    return { members, watching };
  }

  /** A bot is keeping this member's seat until they reconnect. */
  private seatHeld(pid: string): boolean {
    return this.data.seats.some((s) => s.kind === 'bot' && s.replacedPid === pid);
  }

  /** forget disconnected unseated members (they must not hold a member or spectator slot) */
  private dropGhosts(): void {
    const d = this.data;
    for (const [id, m] of Object.entries(d.members)) {
      if (m.seat !== null || this.isConnected(id) || this.seatHeld(id)) continue;
      delete d.members[id];
      if (d.hostId === id) this.passHost();
    }
  }

  /**
   * One account, one member. A second connection of the same account joins the member already here
   * (and a second seat, if one was taken, is given back).
   */
  private claimAccount(pid: string, uid: string): void {
    const d = this.data;
    const m = d.members[pid];
    if (!m) return;
    const otherId = Object.keys(d.members).find((id) => id !== pid && d.members[id]?.uid === uid);
    if (!otherId) { m.uid = uid; return; }
    const other = d.members[otherId]!;
    // keep the seated body when the account's older member is only watching; otherwise keep the one that already had the account
    const keepId = m.seat !== null && other.seat === null ? pid : otherId;
    const dropId = keepId === pid ? otherId : pid;
    const drop = d.members[dropId]!;
    const keep = d.members[keepId]!;
    if (drop.seat !== null && drop.seat !== keep.seat) {
      d.seats[drop.seat] = d.phase === 'playing' ? this.botSeat(drop.name) : { kind: 'empty' };
    }
    for (const [cid, p] of this.conns) if (p === dropId) this.conns.set(cid, keepId);
    if (d.hostId === dropId) d.hostId = keepId;
    if (d.hostId && this.isConnected(d.hostId)) delete d.hostAwaySince;
    keep.gid ??= drop.gid;
    delete d.members[dropId];
    keep.uid = uid;
  }

  /** rated for seat-takeover policy: latched at the deal so a player leaving doesn't open the seat to a guest */
  private ratedSeats(): boolean {
    return false; // TODO(rebuild): rated games are off until they return on the registry (REBUILD.md)
  }

  /** explicit host choice wins; otherwise on, except at a rated table */
  private replaceBotsOn(): boolean {
    if (this.data.replaceBots === false) return false;
    if (this.data.replaceBots === true) return true;
    return !this.ratedSeats();
  }

  /* --------------------------------------------------------------- messages */

  message(connId: string, raw: unknown, uid?: string | null): void {
    let msg: ClientMsg | null = null;
    try {
      if (!this.conns.has(connId)) this.conns.set(connId, null);
      msg = parseClientMsg(raw);
      if (!msg) return this.err(connId, 'BAD_MESSAGE', 'Malformed message');
      const pid = this.conns.get(connId) ?? null;
      if (msg.t === 'hello') return this.hello(connId, msg, uid || undefined);
      if (!pid || !this.data.members[pid]) return this.err(connId, 'NOT_JOINED', 'Say hello first');
      this.data.lastActive = this.io.now();
      this.handle(connId, pid, msg);
    } catch (e) {
      // A throw used to escape the Durable Object handler and freeze the table. Answer this message and keep going.
      this.failMessage(connId, msg, e);
    }
  }

  private hello(connId: string, msg: Extract<ClientMsg, { t: 'hello' }>, uid?: string): void {
    const d = this.data;
    this.dropGhosts();
    const name = cleanName(msg.name, LIMITS.nameMax) || 'Player';
    const gid = msg.gid && this.gidOk(msg.gid) ? msg.gid : undefined;
    if (this.kickedOut(msg.token, uid, gid)) {
      this.trace('reconnect', { cid: connId, how: 'kicked', name });
      this.rejectKick(connId);
      return;
    }
    // same seat token, same account, or the same browser guest (a reload can mint a new token)
    let how: 'token' | 'uid' | 'gid' | 'new' = 'new';
    let pid = msg.token ? Object.keys(d.members).find((id) => d.members[id]!.token === msg.token) : undefined;
    if (pid && uid && d.members[pid]!.uid && d.members[pid]!.uid !== uid) pid = undefined;
    if (pid) how = 'token';
    if (!pid && uid) {
      pid = Object.keys(d.members).find((id) => d.members[id]!.uid === uid);
      if (pid) how = 'uid';
    }
    if (!pid && gid) {
      pid = Object.keys(d.members).find((id) => {
        const m = d.members[id]!;
        return m.gid === gid && !(uid && m.uid && m.uid !== uid);
      });
      if (pid) how = 'gid';
    }
    const returning = !!pid && !this.isConnected(pid);
    if (pid) {
      const m = d.members[pid]!;
      // The name stuck at the first hello. A reconnect, a second tab, or an account
      // username must not rewrite the scoreboard.
      if (!m.name) m.name = name;
      if (gid && !m.gid) m.gid = gid;
      if (uid) m.uid = uid;
      delete m.disconnectedAt;
      m.timeouts = 0;
      if (d.hostId === pid) delete d.hostAwaySince;
      // A new socket draws the table again, even when the previous one has not closed yet.
      // Hold this player's clock until that client says it can act, so a reload cannot
      // auto-play a card behind the loader.
      if (d.phase === 'playing') {
        m.interactive = false;
        m.loaderSince = this.io.now();
        if (m.seat !== null && this.humanToAct() === m.seat) d.deadline = null;
      }
      // Bind the new socket BEFORE dropping the old one. Closing the old socket can
      // re-enter close() (the DO restores the dying socket). If this socket is not
      // bound yet, that re-entry looks like the player left and the turn clock starts
      // the disconnect grace — the path that hands the seat to a bot.
      this.conns.set(connId, pid);
      for (const [cid, p] of this.conns) if (p === pid && cid !== connId) { this.conns.delete(cid); this.io.close?.(cid, 4000, 'replaced'); }
    } else {
      const { members, watching } = this.liveCounts();
      if (members >= LIMITS.members || (d.phase !== 'lobby' && watching >= LIMITS.spectators)) {
        this.trace('reconnect', { cid: connId, how: 'full', name });
        this.err(connId, 'TABLE_FULL', 'This table is full');
        this.io.close?.(connId, 4001, 'full');
        return;
      }
      pid = this.io.randomId().slice(0, 12);
      // honor a client-minted token so a second tab that stored it first lands in this same member
      const tokenTaken = !!msg.token && Object.values(d.members).some((m) => m.token === msg.token);
      const token = msg.token && this.tokenOk(msg.token) && !tokenTaken ? msg.token : this.io.randomId();
      d.members[pid] = { name, token, seat: null, media: { cam: false, mic: false }, joinedAt: this.io.now(), ...(uid ? { uid } : {}), ...(gid ? { gid } : {}) };
      if (!d.hostId || !d.members[d.hostId]) d.hostId = pid;
      this.system(`${name} joined`);
      this.conns.set(connId, pid);
    }
    // token matched a different body than the account already seated here: fold them into one member
    if (uid && Object.keys(d.members).some((id) => id !== pid && d.members[id]!.uid === uid)) {
      this.claimAccount(pid, uid);
      pid = this.conns.get(connId) ?? pid;
    }
    // A bot that took the seat during the disconnect grace gives it back. Never leave them watching.
    this.reclaimSeat(pid);
    this.sentHistory.delete(connId);
    const m = d.members[pid]!;
    this.trace('reconnect', { cid: connId, how, returning, pid, seat: m.seat, name: m.name });
    this.io.send(connId, { t: 'welcome', you: pid, token: m.token, code: d.code, chat: this.visibleChat(pid), v: PROTOCOL_VERSION });
    d.lastActive = this.io.now();
    this.after();
  }

  /** Put `pid` back in the seat a disconnect-grace bot is holding for them. */
  private reclaimSeat(pid: string): void {
    const d = this.data;
    const m = d.members[pid];
    if (!m || m.seat !== null) return;
    const seat = d.seats.findIndex((s) => s.kind === 'bot' && s.replacedPid === pid);
    if (seat < 0) return;
    this.trace('seat', { cause: 'reclaim', seat, fromPid: pid, toKind: 'human', toPid: pid, turnKey: d.turnKey, turnStartedAt: d.turnStartedAt, deadline: d.deadline });
    d.seats[seat] = { kind: 'human', playerId: pid };
    m.seat = seat;
    m.timeouts = 0;
    if (this.humanToAct() === seat) {
      d.turnKey = null;
      d.deadline = null;
    }
  }

  /** Seats at or beyond `n` are emptied (their players stand up and stay as members). */
  private vacateBeyond(n: number): void {
    const d = this.data;
    for (let s = n; s < d.seats.length; s++) {
      const slot = d.seats[s]!;
      if (slot.kind === 'human') d.members[slot.playerId]!.seat = null;
      d.seats[s] = { kind: 'empty' };
    }
  }

  private handle(connId: string, pid: string, msg: ClientMsg): void {
    const d = this.data;
    const me = d.members[pid]!;
    const isHost = d.hostId === pid;
    const n = d.rules.playerCount;
    switch (msg.t) {
      case 'sit': {
        if (msg.seat >= n) throw new RoomError('BAD_SEAT', 'No such seat');
        const slot = d.seats[msg.seat]!;
        if (me.seat === msg.seat) return;
        if (me.uid && Object.entries(d.members).some(([id, o]) => id !== pid && o.uid === me.uid && o.seat !== null)) {
          throw new RoomError('ALREADY_SEATED', 'This account is already seated at this table');
        }
        if (d.phase === 'playing') {
          // mid-game you may only take over a bot's seat (and only if you're not already playing)
          if (me.seat !== null) throw new RoomError('IN_GAME', 'You are already playing');
          if (slot.kind !== 'bot') throw new RoomError('SEAT_TAKEN', 'That seat is taken');
          if (!this.takeable().includes(msg.seat)) throw new RoomError('SEAT_LOCKED', "The host doesn't let spectators replace bots");
          if (this.ratedSeats() && !me.uid) throw new RoomError('ACCOUNT_REQUIRED', 'Sign in to take a seat in a rated game');
        } else if (slot.kind === 'human') throw new RoomError('SEAT_TAKEN', 'That seat is taken');
        if (me.seat !== null) d.seats[me.seat] = { kind: 'empty' };
        d.seats[msg.seat] = { kind: 'human', playerId: pid };
        me.seat = msg.seat;
        me.timeouts = 0;
        if (d.phase === 'playing') {
          // the new player takes over the seat's hand and score as is; on that seat's own turn their clock starts fresh
          if (this.humanToAct() === msg.seat) d.turnKey = null;
          this.system(`${me.name} took over ${slot.kind === 'bot' ? `${slot.name}'s` : 'a'} seat`);
        }
        break;
      }
      case 'stand': {
        if (me.seat === null) return;
        if (d.phase === 'playing') throw new RoomError('IN_GAME', 'Leave the table to give your seat to a bot');
        d.seats[me.seat] = { kind: 'empty' };
        me.seat = null;
        break;
      }
      case 'addBot': {
        this.requireHost(isHost);
        if (d.phase === 'playing') throw new RoomError('IN_GAME', 'Game in progress');
        if (msg.seat >= n) throw new RoomError('BAD_SEAT', 'No such seat');
        const slot = d.seats[msg.seat]!;
        // the host may replace a player who disconnected from the lobby
        if (slot.kind === 'human' && !this.isConnected(slot.playerId)) {
          this.trace('seat', { cause: 'addBot', seat: msg.seat, fromPid: slot.playerId, toKind: 'bot', turnKey: d.turnKey, turnStartedAt: d.turnStartedAt, deadline: d.deadline });
          d.members[slot.playerId]!.seat = null;
        } else if (slot.kind !== 'empty') throw new RoomError('SEAT_TAKEN', 'That seat is taken');
        d.seats[msg.seat] = { kind: 'bot', name: this.botName(), level: d.botLevel };
        break;
      }
      case 'removeBot': {
        this.requireHost(isHost);
        if (d.phase === 'playing') throw new RoomError('IN_GAME', 'Game in progress');
        if (d.seats[msg.seat]?.kind !== 'bot') throw new RoomError('BAD_SEAT', 'No bot there');
        d.seats[msg.seat] = { kind: 'empty' };
        break;
      }
      case 'config': {
        this.requireHost(isHost);
        if (d.phase === 'playing') {
          // Rule lock: anything that affects scoring / the outcome is locked until the game ends (rematch / new game
          // unlocks it). Social + pace settings (Table Talk timer, AFK kick, bot chat on/off) stay adjustable.
          if (msg.rules.playerCount !== d.rules.playerCount) throw new RoomError('RULES_LOCKED', 'House rules are locked for this game');
          if (msg.talkSec) d.talkSec = msg.talkSec;
          if (msg.afkLimit !== undefined) d.afkLimit = msg.afkLimit;
          if (msg.botTalk !== undefined) d.botTalk = msg.botTalk;
          d.rules = clampRules(d.rules, { turnTimerSec: msg.rules.turnTimerSec });
          break;
        }
        const rules = clampRules(d.rules, msg.rules);
        if (d.modeId) {
          const { min, max } = tableSeatRange(d.modeId);
          if (rules.playerCount < min || rules.playerCount > max) throw new RoomError('BAD_RULES', `This mode seats ${min}–${max}`);
        }
        d.rules = rules;
        if (msg.talkSec) d.talkSec = msg.talkSec;
        if (msg.afkLimit !== undefined) d.afkLimit = msg.afkLimit;
        if (msg.partnerMicMute !== undefined) d.partnerMicMute = msg.partnerMicMute;
        if (msg.nukeIntensity !== undefined) d.nukeIntensity = msg.nukeIntensity;
        if (msg.talkIntensity !== undefined) d.talkIntensity = msg.talkIntensity;
        if (msg.botTalk !== undefined) d.botTalk = msg.botTalk;
        if (msg.aiTalk !== undefined) d.aiTalk = msg.aiTalk;
        if (msg.botLevel) {
          d.botLevel = msg.botLevel;
          d.seats.forEach((s) => { if (s.kind === 'bot') s.level = msg.botLevel!; });
        }
        this.vacateBeyond(rules.playerCount);
        break;
      }
      case 'music': {
        this.requireHost(isHost);
        const mu = msg.music;
        d.music = mu.mode === 'beat' ? { ...mu, startAt: this.io.now() + 1500 } // a beat of lead time so every client starts together
          : mu.mode === 'stream' ? { ...mu, by: pid }
          : mu;
        this.system(mu.mode === 'off' ? `${me.name} stopped the music` : mu.mode === 'link' ? `${me.name} shared what's playing` : mu.mode === 'stream' ? `${me.name} is streaming music` : `${me.name} picked the table music`);
        break;
      }
      case 'venue': {
        this.requireHost(isHost);
        if (d.phase === 'playing') throw new RoomError('IN_GAME', 'Pick the venue before the game starts');
        if ((d.venue ?? 'classic') === msg.venue) return;
        // The Pj's is earned, not picked: a locked venue from a host who hasn't unlocked it
        // (Rep 20 / After Dark / admin — stamped on their member at hello) is ignored, so a
        // crafted client can't walk past the picker's gate. The room keeps its current venue.
        if (msg.venue !== 'random' && isLockedVenue(msg.venue) && !this.hostVenueAccess()) return;
        d.venue = msg.venue;
        d.venueNow = msg.venue === 'random' ? undefined : msg.venue;
        break;
      }
      case 'teamName': {
        void cleanTeamName;
        // TODO(rebuild): team names return with a partnership mode (docs/plan/REBUILD.md)
        throw new RoomError('NO_TEAMS', 'This game has no teams');
      }
      case 'start': {
        this.requireHost(isHost);
        if (d.phase === 'playing') throw new RoomError('IN_GAME', 'Game in progress');
        this.startGame();
        break;
      }
      case 'rematch': {
        this.requireHost(isHost);
        if (d.phase !== 'over') throw new RoomError('WRONG_PHASE', 'The game is not over');
        this.startGame(true);
        break;
      }
      case 'mode': {
        this.requireHost(isHost);
        if (d.phase === 'playing') throw new RoomError('IN_GAME', 'Game in progress');
        if (!isMode(msg.modeId, this.io.previewModes ?? [])) throw new RoomError('BAD_MODE', 'Unknown game mode');
        // 3c: switching games fits the table to the new mode's seat range (seats beyond it are vacated)
        const { min, max } = tableSeatRange(msg.modeId);
        const pc = Math.min(max, Math.max(min, d.rules.playerCount));
        if (pc !== d.rules.playerCount) { d.rules = { ...d.rules, playerCount: pc }; this.vacateBeyond(pc); }
        d.modeId = msg.modeId;
        d.modeOptions = cleanModeOptions(msg.modeId, msg.options);
        d.mg = null;
        break;
      }
      case 'move': {
        if (!d.modeId || !d.mg || d.phase !== 'playing') throw new RoomError('WRONG_PHASE', 'No game in progress');
        if (me.seat === null) throw new RoomError('NOT_SEATED', 'Spectators cannot move');
        if (msg.seq !== undefined && msg.seq !== (d.seq ?? 0)) { this.sendState(connId); return; }
        try { modeApply(d.mg, me.seat, msg.move); } catch (e) {
          if (e instanceof ModeRuleError) throw new RoomError(e.code, e.message);
          throw e;
        }
        me.timeouts = 0;
        d.seq = (d.seq ?? 0) + 1;
        this.modeCheckOver();
        break;
      }
      case 'next': {
        return; // TODO(rebuild): multi-hand modes add a between-hands ready step (REBUILD.md)
      }
      case 'chat': {
        const text = maskProfanity(blockLinks(cleanText(msg.text, LIMITS.chatMax)));
        if (!text) return;
        const now = this.io.now();
        const w = (this.chatWindow.get(pid) ?? []).filter((t) => now - t < 10_000);
        const watcher = me.seat === null && d.phase !== 'lobby';
        if (w.length >= (watcher ? LIMITS.spectatorChatBurst : LIMITS.chatBurst)) throw new RoomError('RATE_LIMITED', 'Slow down a little');
        w.push(now);
        this.chatWindow.set(pid, w);
        const line: ChatLine = { id: d.chatSeq++, from: pid, name: me.name, text, at: now, ...(watcher ? { spectator: true as const } : {}) };
        const post = () => {
          this.pushChat(line);
          // TODO(rebuild): bot trash talk answering chat returns per mode (REBUILD.md)
          this.io.persist();
        };
        // @mentions: resolve the tagged usernames to TABLE MEMBERS (their
        // room pids ride the line for the highlight; a mentioned member who
        // isn't connected gets a push via the DO). Resolution is async, so
        // the post chains behind any earlier mention line — order holds.
        const keys = extractMentionKeys(text);
        if (keys.length && this.io.lookupUsernames) {
          const lookup = this.io.lookupUsernames;
          const authorUid = me.uid ?? null;
          this.chatChain = this.chatChain.then(async () => {
            try {
              const found = await lookup(keys, authorUid);
              const mentions: string[] = [];
              for (const k of keys) {
                const tuid = found[k];
                if (!tuid) continue;
                const tpid = Object.keys(d.members).find((p) => d.members[p]!.uid === tuid);
                if (!tpid || tpid === pid) continue; // not at this table, or a self-mention
                if (!mentions.includes(tpid)) mentions.push(tpid);
                if (authorUid && !this.isConnected(tpid)) {
                  this.io.chatMention?.({ toUid: tuid, authorUid, authorName: me.name, text, code: d.code });
                }
              }
              if (mentions.length) line.mentions = mentions;
            } catch { /* resolution failed: the line still posts, untagged */ }
            post();
          });
          return; // chat doesn't change the table state
        }
        post();
        return; // chat doesn't change the table state
      }
      case 'react': {
        // emoji reaction to a chat line: toggle, persist, broadcast the new reaction map.
        // not an error to rate-limit or to react to a missing line: silently drop it.
        const line = d.chat.find((l) => l.id === msg.id);
        if (!line || line.system || !line.from) return;
        const now = this.io.now();
        const w = (this.reactWindow.get(pid) ?? []).filter((t) => now - t < 10_000);
        if (w.length >= LIMITS.reactBurst) { this.reactWindow.set(pid, w); return; }
        w.push(now);
        this.reactWindow.set(pid, w);
        line.reactions = toggleReaction(line.reactions, msg.emoji, pid);
        for (const [cid, p] of this.conns) if (p) this.io.send(cid, { t: 'chatReact', id: line.id, reactions: line.reactions });
        this.io.persist();
        return; // reactions don't change the table state
      }
      case 'media': {
        // spectators never transmit (they watch and listen)
        me.media = me.seat === null && d.phase !== 'lobby' ? { cam: false, mic: false } : msg.media;
        break;
      }
      case 'kick': {
        const slot = d.seats[msg.seat];
        if (!slot || slot.kind !== 'human') throw new RoomError('BAD_SEAT', 'No player there');
        const target = slot.playerId;
        if (target === pid) throw new RoomError('BAD_SEAT', "You can't kick yourself");
        if (isHost) { this.kick(target, 'host'); break; }
        if (me.seat === null) throw new RoomError('NOT_SEATED', 'Only players at the table can vote');
        const votes = (d.votes ??= {});
        const by = votes[target] ?? [];
        // a second press takes the vote back
        votes[target] = by.includes(pid) ? by.filter((x) => x !== pid) : [...by, pid];
        if (!votes[target]!.length) delete votes[target];
        else if (!by.includes(pid)) this.system(`${me.name} voted to kick ${d.members[target]!.name} (${votes[target]!.length}/${this.votesNeeded(target)})`);
        this.checkVotes();
        break;
      }
      case 'learning': {
        if (me.learning === msg.on) return;
        me.learning = msg.on;
        break;
      }
      case 'interactive': {
        const mine = me.seat !== null && this.humanToAct() === me.seat;
        if (msg.on) {
          const held = me.interactive === false || me.loaderSince != null;
          me.interactive = true;
          delete me.loaderSince;
          if (held && mine) { d.turnStartedAt = this.io.now(); d.deadline = null; }
        } else {
          me.interactive = false;
          me.loaderSince ??= this.io.now();
          if (mine) d.deadline = null;
        }
        this.trace('interactive', { pid, on: msg.on, seat: me.seat });
        break;
      }
      case 'rtc': {
        // WebRTC signaling relay: between seated humans, and (Release 10) between a seated human and a spectator
        // (receive-only: spectators' media is forced off). Never spectator ↔ spectator.
        const to = d.members[msg.to];
        if (!to || (me.seat === null && to.seat === null) || ((me.seat === null || to.seat === null) && d.phase === 'lobby')) return;
        for (const [cid, p] of this.conns) if (p === msg.to) this.io.send(cid, { t: 'rtc', from: pid, data: msg.data });
        return;
      }
      case 'tableOpts': {
        this.requireHost(isHost);
        if (msg.private !== undefined) d.private = msg.private;
        if (msg.replaceBots !== undefined) d.replaceBots = msg.replaceBots;
        break;
      }
      case 'leave': {
        this.leave(pid);
        this.conns.set(connId, null);
        break;
      }
      case 'hello':
        return;
    }
    this.after();
  }

  private requireHost(isHost: boolean): void {
    if (!isHost) throw new RoomError('NOT_HOST', 'Only the host can do that');
  }

  /** A bot taking a human's seat mid-game. `was` keeps their name for the game-over screen. */
  private botSeat(was: string): SeatSlot {
    return { kind: 'bot', name: this.botName(), level: this.data.botLevel, vacated: true, was };
  }

  /** The only mid-game path that gives a human's chair to a bot: they left, or the table removed them. */
  private handSeatToBot(seat: number, was: string, fromPid: string, cause: 'leave' | 'host' | 'vote'): SeatSlot {
    const d = this.data;
    const bot = this.botSeat(was);
    const name = bot.kind === 'bot' ? bot.name : null;
    this.trace('seat', {
      cause, seat, fromPid, toKind: 'bot', botName: name,
      timeouts: d.members[fromPid]?.timeouts ?? null,
      disconnectedAt: d.members[fromPid]?.disconnectedAt ?? null,
      turnKey: d.turnKey, turnStartedAt: d.turnStartedAt, deadline: d.deadline,
    });
    return bot;
  }

  private botName(): string {
    const used = new Set(this.data.seats.flatMap((s) => (s.kind === 'bot' ? [s.name] : [])));
    for (const m of Object.values(this.data.members)) used.add(m.name);
    // random per table from the shared pool, with a plate tag no one else at the table already has.
    // The name is stored on the seat, so every client sees the same tag for the whole game.
    return pickBotName(used, Math.random);
  }

  private leave(pid: string): void {
    const d = this.data;
    const m = d.members[pid];
    if (!m) return;
    if (m.seat !== null) {
      // mid-game the seat goes to a bot so the others can finish; in the lobby it just opens up
      const seat = m.seat;
      if (d.phase === 'playing') d.seats[seat] = this.handSeatToBot(seat, m.name, pid, 'leave');
      else {
        this.trace('seat', { cause: 'leave', seat, fromPid: pid, toKind: 'empty', turnKey: d.turnKey, turnStartedAt: d.turnStartedAt, deadline: d.deadline });
        d.seats[seat] = { kind: 'empty' };
      }
    }
    delete d.members[pid];
    d.ready = d.ready.filter((x) => x !== pid);
    this.system(`${m.name} left`);
    if (d.music?.mode === 'stream' && d.music.by === pid) d.music = { mode: 'off' };
    if (d.hostId === pid) this.passHost();
  }

  /** Seated humans other than `target` who are online: a majority of them can vote `target` off. */
  private voters(target: string): string[] {
    return this.data.seats.flatMap((s) => (s.kind === 'human' && s.playerId !== target && this.isConnected(s.playerId) ? [s.playerId] : []));
  }

  private votesNeeded(target: string): number {
    return Math.floor(this.voters(target).length / 2) + 1;
  }

  /** Drops stale votes (voter left / went offline, target gone) and carries out any vote that reached a majority. */
  private checkVotes(): void {
    const d = this.data;
    if (!d.votes) return;
    for (const [target, by] of Object.entries(d.votes)) {
      const seated = d.seats.some((s) => s.kind === 'human' && s.playerId === target);
      const eligible = new Set(this.voters(target));
      const live = by.filter((x) => eligible.has(x));
      if (!seated || !live.length) { delete d.votes[target]; continue; }
      d.votes[target] = live;
      if (live.length >= this.votesNeeded(target)) this.kick(target, 'vote');
    }
  }

  /** Removes a player: a bot takes their seat mid-game, and their token can't rejoin until the next game. */
  private kick(target: string, how: 'host' | 'vote'): void {
    const d = this.data;
    const m = d.members[target];
    if (!m) return;
    if (m.seat !== null) {
      const seat = m.seat;
      d.seats[seat] = d.phase === 'playing' ? this.handSeatToBot(seat, m.name, target, how) : { kind: 'empty' };
      if (d.phase !== 'playing') this.trace('seat', { cause: how, seat, fromPid: target, toKind: 'empty', turnKey: d.turnKey, turnStartedAt: d.turnStartedAt, deadline: d.deadline });
    }
    delete d.members[target];
    if (d.votes) delete d.votes[target];
    d.ready = d.ready.filter((x) => x !== target);
    d.kicked = [...(d.kicked ?? []), m.token, ...(m.uid ? [m.uid] : []), ...(m.gid ? [m.gid] : [])];
    if (d.music?.mode === 'stream' && d.music.by === target) d.music = { mode: 'off' };
    this.system(how === 'host' ? `${m.name} was removed by the host${d.phase === 'playing' ? ' — a bot took their seat' : ''}` : `${m.name} was voted off the table${d.phase === 'playing' ? ' — a bot took their seat' : ''}`);
    for (const [cid, p] of this.conns) {
      if (p !== target) continue;
      this.err(cid, 'KICKED', how === 'host' ? 'The host removed you from this table' : 'The table voted to remove you');
      this.conns.delete(cid);
      this.io.close?.(cid, 4003, 'kicked');
    }
    if (d.hostId === target) this.passHost();
  }

  private passHost(): void {
    const d = this.data;
    const prev = d.hostId;
    delete d.hostAwaySince;
    const ids = Object.keys(d.members).sort((a, b) => d.members[a]!.joinedAt - d.members[b]!.joinedAt);
    d.hostId = ids.find((id) => this.isConnected(id)) ?? ids[0] ?? null;
    if (d.hostId && d.hostId !== prev) this.system(`${d.members[d.hostId]!.name} is now the host`);
  }

  /** Host's socket is gone: after a grace period (long enough for a reload), the oldest connected member takes over. */
  private considerHost(): boolean {
    const d = this.data;
    const id = d.hostId;
    const host = id ? d.members[id] : undefined;
    if (!host || !id) {
      if (d.hostAwaySince === undefined) return false;
      delete d.hostAwaySince;
      return true;
    }
    if (this.isConnected(id)) {
      if (d.hostAwaySince === undefined) return false;
      delete d.hostAwaySince;
      return true;
    }
    let marked = false;
    if (d.hostAwaySince === undefined) { d.hostAwaySince = this.io.now(); marked = true; }
    const due = d.hostAwaySince + HOST_DISCONNECT_GRACE_MS;
    if (this.io.now() < due) { this.io.setAlarm(due); return marked; }
    if (!Object.keys(d.members).some((pid) => pid !== id && this.isConnected(pid))) return marked;
    this.passHost();
    return true;
  }


  /** Start a game of the table's registry mode: fill empty seats with bots, deal from a fresh seed, roll the venue. */
  private startGame(_rematch = false): void {
    const d = this.data;
    const id = d.modeId;
    const n = d.rules.playerCount;
    const seats = d.seats.slice(0, n);
    if (!seats.some((s) => s.kind === 'human')) throw new RoomError('NO_PLAYERS', 'Sit down first');
    const { min, max } = modeSeatRange(id);
    if (n < min || n > max) throw new RoomError('BAD_MODE', `This mode seats ${min}–${max}`);
    for (let s = 0; s < n; s++) if (d.seats[s]!.kind === 'empty') d.seats[s] = { kind: 'bot', name: this.botName(), level: d.botLevel };
    d.mg = newModeGame(id, d.modeOptions ?? {}, n, this.io.randomId());
    // venue: a 'random' pick is rolled per game; locked venues only for an entitled host
    const hostAccess = this.hostVenueAccess();
    const picked = (d.venue ?? 'classic') as VenueChoice;
    d.venueNow = picked === 'random'
      ? rollVenue(parseInt(this.io.randomId().slice(0, 8), 16) / 4294967296, d.venueNow, hostAccess)
      : isLockedVenue(picked) && !hostAccess ? 'classic' : picked;
    // TODO(rebuild): series (rematch tally), rated latch and live stats return on the registry (REBUILD.md)
    d.seq = (d.seq ?? 0) + 1;
    d.phase = 'playing';
    d.ready = [];
    d.turnKey = null;
    d.deadline = null;
    d.gamesPlayed++;
    d.kicked = []; // a new game: kicked players may come back
    d.votes = {};
    for (const m of Object.values(d.members)) m.timeouts = 0;
    this.system(`Game ${d.gamesPlayed} started`);
  }

  /** Idle room is about to be deleted. TODO(rebuild): abandoned-game records (REBUILD.md). */
  expire(): void {}

  /** The seat the registry game waits on, when it is a human's (null otherwise / no game). */
  private humanToAct(): number | null {
    const g = this.data.mg;
    if (!g || this.data.phase !== 'playing') return null;
    return modeToAct(g).find((x) => this.data.seats[x]?.kind === 'human') ?? null;
  }

  /** Bots move until a human is to act or the game ends; then the human turn clock runs. */
  private modeDrive(): boolean {
    const d = this.data;
    const g = d.mg;
    if (d.phase !== 'playing' || !g) { this.clearTimers(); return false; }
    let changed = false;
    for (let guard = 0; guard < 500; guard++) {
      if (modeResults(g).done) break;
      const seat = modeToAct(g).find((s) => d.seats[s]?.kind === 'bot');
      if (seat === undefined) break;
      const slot = d.seats[seat] as Extract<SeatSlot, { kind: 'bot' }>;
      modeApply(g, seat, modeBotMove(g, seat, tierForLevel(slot.level === 'mixed' ? 'normal' : slot.level)));
      d.seq = (d.seq ?? 0) + 1;
      changed = true;
    }
    if (this.modeCheckOver()) { this.clearTimers(); return true; }
    if (this.modeHumanClock()) changed = true;
    return changed;
  }

  /**
   * Turn clock for a human in a registry mode. The table's play timer (learning mode ×1.5)
   * runs from the turn start; a disconnected player gets the shorter of that and the same
   * length from the drop. On expiry the mode's own bot interface makes one move for them
   * (easy tier) and it counts as a timeout. After `afkLimit` timeouts in a row the seat
   * goes to a bot for the rest of the game; the player stays as a spectator and may retake it.
   * Nobody connected = the clock is frozen.
   */
  private modeHumanClock(): boolean {
    const d = this.data;
    const g = d.mg!;
    let changed = false;
    for (let guard = 0; guard < 50; guard++) {
      if (d.phase !== 'playing' || modeResults(g).done) { this.clearTimers(); return true; }
      const seat = modeToAct(g).find((x) => d.seats[x]?.kind === 'human');
      if (seat === undefined) { d.deadline = null; d.turnKey = null; this.io.setAlarm(null); return changed; }
      const slot = d.seats[seat] as Extract<SeatSlot, { kind: 'human' }>;
      const member = d.members[slot.playerId];
      const now = this.io.now();
      if (!Object.keys(d.members).some((id) => this.isConnected(id))) {
        if (d.deadline !== null) changed = true;
        d.deadline = null; d.turnKey = null; this.io.setAlarm(null);
        return changed;
      }
      const key = `m${d.seq ?? 0}:${seat}`;
      if (d.turnKey !== key) { d.turnKey = key; d.turnStartedAt = now; d.deadline = null; changed = true; }
      const timerMs = this.turnLimitMs('play', !!member?.learning);
      const full = (d.turnStartedAt ?? now) + timerMs;
      if (!this.isConnected(slot.playerId)) {
        if (member && member.disconnectedAt == null) member.disconnectedAt = now;
        const want = Math.min(full, (member?.disconnectedAt ?? now) + timerMs);
        if (d.deadline === null || want < d.deadline) { d.deadline = want; changed = true; }
      } else {
        if (member) delete member.disconnectedAt;
        if (d.deadline === null || d.deadline < full) { d.deadline = full; changed = true; }
      }
      if (now < d.deadline!) { this.io.setAlarm(d.deadline); return changed; }
      // expired: one auto-move through the mode's bot, then count it
      try { modeApply(g, seat, modeBotMove(g, seat, 'easy')); } catch (e) {
        console.error('mode auto-move failed', e);
        this.io.setAlarm(now + 1000);
        return changed;
      }
      d.seq = (d.seq ?? 0) + 1;
      d.deadline = null;
      changed = true;
      this.system(`${this.seatName(seat)} ran out of time`);
      if (member) {
        member.timeouts = (member.timeouts ?? 0) + 1;
        if (member.timeouts >= (d.afkLimit ?? DEFAULT_AFK_LIMIT)) {
          d.seats[seat] = this.handSeatToBot(seat, member.name, slot.playerId, 'leave');
          member.seat = null;
          member.timeouts = 0;
          this.system(`${member.name} is away — a bot takes the seat`);
        }
      }
      // bots after the auto-move, then loop for the next human
      for (let b = 0; b < 500; b++) {
        if (modeResults(g).done) break;
        const bs = modeToAct(g).find((x) => d.seats[x]?.kind === 'bot');
        if (bs === undefined) break;
        const bslot = d.seats[bs] as Extract<SeatSlot, { kind: 'bot' }>;
        modeApply(g, bs, modeBotMove(g, bs, tierForLevel(bslot.level === 'mixed' ? 'normal' : bslot.level)));
        d.seq = (d.seq ?? 0) + 1;
      }
      this.modeCheckOver();
    }
    return changed;
  }

  /** The mode says the game is done: close it out (no rated record for registry modes yet). */
  private modeCheckOver(): boolean {
    const d = this.data;
    if (d.phase !== 'playing' || !d.mg || !modeResults(d.mg).done) return false;
    const r = modeResults(d.mg);
    d.phase = 'over';
    const top = r.placements[0];
    this.system(top === undefined || r.deltas.every((x) => x === 0) ? 'Game over: a tie' : `Game over: ${this.seatName(top)} wins`);
    // generic stats record: one per finished mode game (coin changes + the mode's recap)
    const seats = d.seats.slice(0, d.rules.playerCount).map((s, seat) => s.kind === 'human'
      ? { seat, uid: d.members[s.playerId]?.uid ?? null, name: d.members[s.playerId]?.name ?? 'Player', bot: false }
      : { seat, uid: null, name: s.kind === 'bot' ? s.name : `Seat ${seat + 1}`, bot: true });
    this.io.modeGameOver?.({ id: this.io.randomId(), room: d.code, modeId: d.mg.modeId, options: { ...d.mg.options }, endedAt: this.io.now(), seats, placements: [...r.placements], deltas: [...r.deltas], recap: r.recap });
    return true;
  }

  seatName(seat: number): string {
    const s = this.data.seats[seat];
    if (!s || s.kind === 'empty') return `Seat ${seat + 1}`;
    if (s.kind === 'bot') return s.name;
    return this.data.members[s.playerId]?.name ?? 'Player';
  }

  /** The host's per-turn timer (seconds); a missing or bad value keeps the 30 s default. */
  private turnSeconds(_kind?: string): number {
    const t = this.data.rules.turnTimerSec;
    return typeof t === 'number' && Number.isFinite(t) ? t : DEFAULT_TABLE_RULES.turnTimerSec;
  }

  /** Milliseconds the table allows for this turn, including learning mode's stretch. */
  private turnLimitMs(kind: string, learning: boolean): number {
    return this.turnSeconds(kind) * 1000 * (learning ? LEARNING_TIMER : 1);
  }

  /** What the client clock is counting: the table's setting for the human who is to act. */
  private clockSeconds(): number | null {
    const seat = this.humanToAct();
    if (seat === null) return null;
    const slot = this.data.seats[seat];
    if (!slot || slot.kind !== 'human') return null;
    const learning = !!this.data.members[slot.playerId]?.learning;
    return Math.round(this.turnLimitMs('play', learning) / 1000);
  }

  /**
   * Start of the acting human's own clock (lead-in already elapsed), or null when `deadline`
   * belongs to Table Talk / a bot / nobody. Does not change how long the turn lasts.
   */
  private turnClockStart(): number | null {
    const d = this.data;
    if (d.deadline === null || d.turnStartedAt === null) return null;
    if (this.humanToAct() === null) return null;
    return d.turnStartedAt;
  }

  /**
   * Recompute timers after any change, run due bots/auto-plays, broadcast, persist.
   * A throw in the drive used to skip the broadcast. Hello has already sent welcome by then,
   * and the client waits on state, so the loader never leaves. Send the state we have anyway.
   */
  private after(): void {
    try {
      this.checkVotes();
      this.considerHost();
      this.drive();
    } catch (e) {
      console.error('room after failed', e);
    }
    this.broadcast();
    this.io.persist();
  }

  /** Called by timers/alarms. One bad tick must not kill the alarm loop. */
  tick(): void {
    try {
      const hostChanged = this.considerHost();
      // TODO(rebuild): tournament / Big Bank autostart deadlines (REBUILD.md)
      const changed = this.drive();
      if (changed || hostChanged) {
        this.broadcast();
        this.io.persist();
      }
    } catch (e) {
      console.error('room tick failed', e);
    }
  }

  /** Advances bots / timeouts that are due. Returns true if the state changed. */
  private drive(): boolean {
    return this.modeDrive();
  }

  /** A timed-out turn was auto-played. The chair is not part of that: only `leave` gives it to a bot. */
  private countTimeout(pid: string, seat: number): void {
    const d = this.data;
    const m = d.members[pid];
    if (!m) return;
    const connected = this.isConnected(pid);
    if (!connected) {
      this.trace('timeout', { cause: 'disconnect-autoplay', seat, pid, name: m.name, connected, turnKey: d.turnKey, turnStartedAt: d.turnStartedAt, deadline: d.deadline });
      return;
    }
    m.timeouts = (m.timeouts ?? 0) + 1;
    this.trace('timeout', { cause: 'turn-timer', seat, pid, name: m.name, connected, timeouts: m.timeouts, turnKey: d.turnKey, turnStartedAt: d.turnStartedAt, deadline: d.deadline });
  }

  private clearTimers(): void {
    this.data.deadline = null;
    this.data.turnKey = null;
    this.data.botDueAt = null;
    this.io.setAlarm(null);
  }

  /* --------------------------------------------------------------- output */

  roomInfo(): RoomInfo {
    const d = this.data;
    const seats: SeatInfo[] = d.seats.slice(0, d.rules.playerCount).map((s) => {
      if (s.kind === 'empty') return { kind: 'empty' };
      if (s.kind === 'bot') return { kind: 'bot', name: s.name, level: s.level, ...(s.was ? { was: s.was } : {}) };
      const m = d.members[s.playerId];
      return { kind: 'human', playerId: s.playerId, name: m?.name ?? 'Player', connected: this.isConnected(s.playerId), media: m?.media ?? { cam: false, mic: false }, ...(m?.uid ? { uid: m.uid } : {}) };
    });
    return {
      modeId: d.modeId, modeOptions: { ...(d.modeOptions ?? {}) },
      code: d.code, hostId: d.hostId ?? '', phase: d.phase, rules: d.rules, botLevel: d.botLevel, seats,
      members: Object.entries(d.members).map(([playerId, m]) => ({ playerId, name: m.name, connected: this.isConnected(playerId), seat: m.seat })),
      deadline: d.deadline, turnClockStart: this.turnClockStart(), turnSec: this.clockSeconds(), ready: [...d.ready], rev: d.rev, seq: d.seq ?? 0, game: d.gamesPlayed, dealAt: null, now: this.io.now(),
      talkSec: d.talkSec ?? Math.round(this.timing.handOverMs / 1000), afkLimit: d.afkLimit ?? DEFAULT_AFK_LIMIT, partnerMicMute: d.partnerMicMute ?? false, nukeIntensity: d.nukeIntensity ?? 'full', talkIntensity: d.talkIntensity ?? 'cookout', botTalk: d.botTalk ?? true, aiTalk: !!d.aiTalk,
      venue: d.venue ?? 'classic', ...(d.venueNow ? { venueNow: d.venueNow } : {}),
      teamNames: undefined, revealed: [], // TODO(rebuild): teams, series, tournament, challenge room info (REBUILD.md)
      private: !!d.private, replaceBots: this.replaceBotsOn(), takeable: this.takeable(),
      spectators: d.phase === 'lobby' ? [] : Object.entries(d.members).filter(([id, m]) => m.seat === null && this.isConnected(id)).map(([playerId, m]) => ({ playerId, name: m.name })),
      ...(d.votes && Object.keys(d.votes).length ? { votes: Object.entries(d.votes).map(([target, by]) => ({ target, by: [...by], need: this.votesNeeded(target) })) } : {}), ...(d.music && d.music.mode !== 'off' ? { music: d.music } : {}),
    };
  }

  /** per connection: the hand-history length it already has (history is only re-sent when it grows) */
  private sentHistory = new Map<string, string>();

  private broadcast(): void {
    const d = this.data;
    d.rev++;
    const room = this.roomInfo();
    for (const cid of this.conns.keys()) this.sendState(cid, room);
    this.io.listing?.(this.listing(room));
  }

  /** Release 10: seats a spectator may take right now (mid-game, not at a tournament table) */
  takeable(): number[] {
    const d = this.data;
    if (d.phase !== 'playing' || !d.mg) return [];
    const bots = this.replaceBotsOn();
    return d.seats.slice(0, d.rules.playerCount).flatMap((s, i) => (s.kind === 'bot' && (s.vacated || bots) ? [i] : []));
  }

  /** Release 10: the Open tables entry (null = not listed: private, or nobody connected) */
  listing(room: RoomInfo = this.roomInfo()): OpenTable | null {
    const d = this.data;
    if (d.private) return null;
    const humans = room.seats.filter((s) => s.kind === 'human').length;
    if (!d.seats.some((s) => s.kind === 'human' && this.isConnected(s.playerId)) && !Object.keys(d.members).some((id) => this.isConnected(id))) return null;
    const open = d.phase === 'lobby' ? room.seats.filter((s) => s.kind === 'empty').map((_, i) => i) : room.takeable ?? [];
    const firstOpen = d.phase === 'lobby' ? room.seats.findIndex((s) => s.kind === 'empty') : (room.takeable ?? [])[0] ?? -1;
    const spectators = room.spectators?.length ?? 0;
    return {
      code: d.code, host: d.hostId ? d.members[d.hostId]?.name ?? '' : '', mode: d.modeId, playerCount: d.rules.playerCount,
      target: 0, venue: d.venueNow ?? (d.venue && d.venue !== 'random' ? d.venue : d.venue ?? 'classic'),
      humans, bots: room.seats.filter((s) => s.kind === 'bot').length, open: open.length,
      status: d.phase === 'lobby' ? 'waiting' : d.phase === 'playing' ? 'playing' : 'over',
      spectators, ...(spectators >= LIMITS.spectators ? { watchFull: true } : {}),
      ...(firstOpen >= 0 ? { seat: firstOpen } : {}),
      at: this.io.now(),
    };
  }

  /** The current state as one connection may see it (its own seat's view only). */
  private sendState(cid: string, room: RoomInfo = this.roomInfo()): void {
    const d = this.data;
    const pid = this.conns.get(cid);
    if (!pid) return;
    const seat = d.members[pid]?.seat ?? null;
    const g = d.mg;
    const mySeat = seat !== null && seat < d.rules.playerCount ? seat : null;
    const mode = g && d.phase !== 'lobby' ? { modeId: g.modeId, view: modeView(g, mySeat ?? 'spectator'), toAct: modeToAct(g), legal: mySeat === null ? [] : modeLegal(g, mySeat), results: modeResults(g) } : undefined;
    const watching = mySeat === null && !!mode;
    this.io.send(cid, { t: 'state', room, seat, ...(watching ? { spectator: true as const } : {}), ...(mode ? { mode } : {}) });
  }

  private system(text: string): void {
    this.pushChat({ id: this.data.chatSeq++, from: null, name: 'System', text, at: this.io.now(), system: true });
  }

  private pushChat(line: ChatLine): void {
    const d = this.data;
    d.chat.push(line);
    if (d.chat.length > LIMITS.chatHistory) d.chat.splice(0, d.chat.length - LIMITS.chatHistory);
    // Mute (migration 0030): a viewer who muted the author never receives
    // the line. One-directional and private — everyone else, the author
    // included, sees it as always. Bot / system lines have no account
    // author and are never filtered.
    const authorUid = line.from ? d.members[line.from]?.uid : undefined;
    for (const [cid, pid] of this.conns) {
      if (!pid) continue;
      if (authorUid && pid !== line.from) {
        const viewerUid = d.members[pid]?.uid;
        if (viewerUid && viewerUid !== authorUid && this.io.mutedAuthors?.(viewerUid)?.has(authorUid)) continue;
      }
      this.io.send(cid, { t: 'chat', line });
    }
  }

  /** The chat history a (re)joining viewer may see: a muted author's lines are filtered out for that viewer only. */
  private visibleChat(viewerPid: string): ChatLine[] {
    const d = this.data;
    const all = d.chat.slice(-LIMITS.chatHistory);
    const viewerUid = d.members[viewerPid]?.uid;
    if (!viewerUid || !this.io.mutedAuthors) return all;
    const muted = this.io.mutedAuthors(viewerUid);
    if (!muted?.size) return all;
    return all.filter((l) => {
      const au = l.from ? d.members[l.from]?.uid : undefined;
      return !au || au === viewerUid || !muted.has(au);
    });
  }

  private err(connId: string, code: string, message: string): void {
    this.io.send(connId, { t: 'error', code, message });
  }

  /** Reply to the message that failed. An in-flight `act` gets an ack so the client unlocks its hand. */
  private failMessage(connId: string, msg: ClientMsg | null, e: unknown): void {
    let code = 'INTERNAL';
    let text = 'Something went wrong';
    if (e instanceof ModeRuleError || e instanceof RoomError) { code = e.code; text = e.message; }
    else console.error('room message failed', e);
    this.err(connId, code, text);
  }

  /** Public summary for the join screen (no secrets). */
  summary() {
    const d = this.data;
    return {
      code: d.code, phase: d.phase, mode: d.modeId, playerCount: d.rules.playerCount,
      seats: this.roomInfo().seats.map((s) => (s.kind === 'human' ? { kind: s.kind, name: s.name } : s.kind === 'bot' ? { kind: s.kind, name: s.name } : { kind: s.kind })),
      host: d.hostId ? d.members[d.hostId]?.name ?? null : null,
    };
  }
}

export class RoomError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}
