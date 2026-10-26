import { SocialButton } from '../social/Social';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BotLevel, RoomInfo, SeatInfo } from '@pp/protocol';
import type { ModeId } from '@pp/game';
import { type Settings, TURN_TIMER_CHOICES } from '../settings';
import { modeCatalog } from '../modes/catalog';
import type { ConnState, TableConnection } from './connection';
import { inviteLink } from './config';
import { navigate } from './nav';
import { MediaBar, SeatMedia } from './Media';
import { AvatarCircle, useAvatar } from '../avatar';
import { openPlayerProfile, profileTargetOf } from '../profileTap';
import { colorFor, useVideo } from './useOnline';
import type { VideoMesh } from './video';

/** Bot skill choices at a hosted table (Mixed: each bot rolls its own, hidden). */
const BOT_SKILLS: { id: BotLevel; label: string }[] = [
  { id: 'mixed', label: 'Mixed' }, { id: 'novice', label: 'Novice' }, { id: 'regular', label: 'Regular' }, { id: 'pro', label: 'Pro' }, { id: 'shark', label: 'Shark' },
];
const skillOf = (b: BotLevel): BotLevel => (b === 'easy' ? 'novice' : b === 'normal' ? 'mixed' : b);

/** The registry game a room plays, by name (falls back to the id). */
function gameTitle(room: RoomInfo): string {
  const id = (room.modeId ?? 'placeholder') as ModeId;
  return modeCatalog().find((m) => m.modeId === id)?.title ?? id;
}

/**
 * Room lobby (milestone 3b: generic): invite code, seat picking, the host's table
 * settings (turn timer, bot skill, AFK, privacy), bots, chat, camera check.
 * The game's own options show in 3c; the Spades panels (venue, house rules,
 * teams, trump ladder, trash talk, nuke) are rebuild items (docs/plan/REBUILD.md).
 */
export default function Lobby({ conn, cs, mesh, settings, onSettings, onBackToGame, onLeave }: {
  conn: TableConnection; cs: ConnState; mesh: VideoMesh | null; settings: Settings; onSettings: (s: Settings) => void;
  onBackToGame: (() => void) | null; onLeave: () => void;
}) {
  const room = cs.room!;
  const vs = useVideo(mesh);
  const isHost = room.hostId === cs.you;
  const n = room.rules.playerCount;
  const playing = room.phase === 'playing';
  const [copied, setCopied] = useState(false);
  const link = inviteLink(room.code);
  const r = room.rules;

  // seat spots around the mini table: me at the bottom when seated
  const me = cs.seat ?? 0;
  const spots = n === 4 ? ['bottom', 'left', 'top', 'right'] : n === 3 ? ['bottom', 'left', 'right'] : ['bottom', 'top'];
  const spotOf = (seat: number) => spots[(seat - me + n) % n]!;

  const config = (o: { turnTimerSec?: number; botLevel?: BotLevel; afkLimit?: number } = {}) => {
    const turnTimerSec = o.turnTimerSec ?? r.turnTimerSec;
    const botLevel = o.botLevel ?? room.botLevel;
    if (o.turnTimerSec !== undefined || o.botLevel !== undefined) onSettings({ ...settings, turnTimerSec, botLevel });
    conn.send({ t: 'config', rules: { playerCount: r.playerCount, turnTimerSec }, botLevel, afkLimit: o.afkLimit ?? room.afkLimit ?? 3 });
  };

  const share = async () => {
    const text = `Pull up to my table on Pity Party 🃏 Code ${room.code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Pity Party', text, url: link }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };

  const seatedHumans = room.seats.filter((s) => s.kind === 'human').length;
  const wide = useWide();
  // The seat table's stage ends where the dock begins (online.css):
  // publish the dock's real height as --dock-h so the stage tracks it.
  const dockRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = dockRef.current;
    if (wide || !el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--dock-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--dock-h'); };
  }, [wide]);
  const [chatOpen, setChatOpen] = useState(false);
  const [seen, setSeen] = useState(cs.chat.length);
  useEffect(() => { if (chatOpen || wide) setSeen(cs.chat.length); }, [chatOpen, wide, cs.chat.length]);
  const unread = Math.max(0, cs.chat.filter((l) => !l.system).length - cs.chat.slice(0, seen).filter((l) => !l.system).length);
  const startBlock = <StartBlock room={room} cs={cs} conn={conn} isHost={isHost} playing={playing} seatedHumans={seatedHumans} n={n} onBackToGame={onBackToGame} onLeave={onLeave} />;
  const timers = TURN_TIMER_CHOICES.includes(r.turnTimerSec as typeof TURN_TIMER_CHOICES[number]) ? TURN_TIMER_CHOICES : [...TURN_TIMER_CHOICES, r.turnTimerSec].sort((a, b) => a - b);

  return (
    <div className="setup lobby lobby-v3" data-testid="lobby">
      {/* Home keeps your seat (the splash offers "Rejoin table"); "Leave table" gives it up */}
      <button type="button" className="back-chip lobby-home" data-testid="lobby-home" aria-label="Home" title="Home (keeps your seat)" onClick={() => navigate('/', true, { wiz: 'home', d: 0 })}>
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d="M6 1 L1.5 6 L6 11 M2 6 H17" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="square"/></svg>BACK
      </button>
      <div className="lobby-cols">
      <div className="lobby-main">
      <header className="lobby-head">
        <h2 className="lobby-pick-title">PICK YOUR SEAT</h2>
        <div className="lobby-share">
          <button type="button" className="room-code share-code" data-testid="room-code" aria-label={`Table code ${room.code}. Tap to share the invite link`} onClick={share}>
            <small>{copied ? 'LINK COPIED ✓' : 'TABLE CODE · TAP TO SHARE'}</small>
            <b>{room.code}</b>
          </button>
          <SocialButton className="lobby-social" />
        </div>
        {cs.status !== 'open' && <p className="muted">{cs.status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</p>}
      </header>

      <section className="panel lobby-table">
        <div className={`mini-felt n${n}`}>
          <div className="felt-center">
            <span data-testid="lobby-game">{gameTitle(room)}</span>
            <small>{n} seats</small>
          </div>
          {room.seats.slice(0, n).map((s, seat) => (
            <SeatCard
              key={seat} seat={seat} info={s} spot={spotOf(seat)} mine={cs.seat === seat} isHost={isHost} playing={playing}
              hostId={room.hostId} you={cs.you}
              onSit={() => conn.send({ t: 'sit', seat })}
              onBot={() => conn.send({ t: 'addBot', seat })}
              onRemoveBot={() => conn.send({ t: 'removeBot', seat })}
              media={<SeatMedia seat={s} isMe={cs.seat === seat} mesh={mesh} vs={vs} />}
            />
          ))}
        </div>
        {wide && <MediaBar mesh={mesh} vs={vs} seated={cs.seat !== null} />}
      </section>

      {wide && startBlock}
      </div>
      <div className="lobby-settings">
      {isHost ? (
        <section className="panel table-panel" data-testid="table-settings">
          <div className="panel-title">TABLE <small>(host{playing ? ' · pace only mid-game' : ''})</small></div>
          <label className="row"><span className="row-label">Turn timer<small>then a bot moves for you</small></span><span className="row-control">
            <select data-testid="lobby-timer" aria-label="Turn timer" value={String(r.turnTimerSec)} onChange={(e) => config({ turnTimerSec: Number(e.target.value) })}>
              {timers.map((x) => <option key={x} value={x}>{x}s{x === 30 ? ' (default)' : ''}</option>)}
            </select></span></label>
          <label className="row"><span className="row-label">Bot skill<small>Mixed: every bot rolls its own (hidden)</small></span><span className="row-control">
            <select data-testid="lobby-bot-skill" aria-label="Bot skill" value={skillOf(room.botLevel)} onChange={(e) => config({ botLevel: e.target.value as BotLevel })}>
              {BOT_SKILLS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select></span></label>
          <label className="row"><span className="row-label">AFK kick<small>a timeout plays that turn. The seat stays yours until you leave.</small></span><span className="row-control">
            <select data-testid="afk-limit" aria-label="AFK kick" value={String(room.afkLimit ?? 3)} onChange={(e) => config({ afkLimit: Number(e.target.value) })}>
              {[2, 3, 5, 0].map((x) => <option key={x} value={x}>{x === 0 ? 'Off' : `${x} in a row${x === 3 ? ' (default)' : ''}`}</option>)}
            </select></span></label>
          <label className="row"><span className="row-label">Private table<small>hidden from Open tables · invite or code only</small></span><span className="row-control">
            <button type="button" data-testid="private-toggle" className={`toggle ${room.private ? 'on' : ''}`} role="switch" aria-checked={!!room.private} aria-label="Private table" onClick={() => conn.send({ t: 'tableOpts', private: !room.private })}><span /></button>
          </span></label>
          <label className="row"><span className="row-label">Spectators can replace bots<small>a watcher may take a bot's seat mid-game</small></span><span className="row-control">
            <button type="button" data-testid="replace-bots-toggle" className={`toggle ${room.replaceBots !== false ? 'on' : ''}`} role="switch" aria-checked={room.replaceBots !== false} aria-label="Spectators can replace bots" onClick={() => conn.send({ t: 'tableOpts', replaceBots: room.replaceBots === false })}><span /></button>
          </span></label>
        </section>
      ) : (
        <div className="summary" data-testid="table-summary">
          <span>{gameTitle(room)} · {n} seats</span>
          <span>Turn timer {r.turnTimerSec}s · then a bot moves for you</span>
          <span>{room.afkLimit === 0 ? 'AFK kick off' : 'A timeout plays your turn. Your seat stays yours until you leave.'}</span>
        </div>
      )}

      </div>
      <LobbyChat cs={cs} onSend={(text) => conn.send({ t: 'chat', text })} open={chatOpen} setOpen={setChatOpen} wide={wide} />
      {!wide && createPortal(
        <div ref={dockRef} className={`lobby-dock ${chatOpen ? 'chat-open' : ''}`} data-testid="lobby-dock">
          {startBlock}
          <div className="dock-bar">
            {cs.seat !== null ? <MediaBar mesh={mesh} vs={vs} seated /> : <span className="dock-spacer" />}
            <button type="button" className={`av-btn dock-chat ${chatOpen ? 'on' : ''}`} data-testid="lobby-chat-tab" aria-expanded={chatOpen} aria-label="Table chat" onClick={() => setChatOpen(!chatOpen)}>
              💬<small>CHAT</small>{unread > 0 && !chatOpen && <span className="unread" data-testid="lobby-unread">{unread}</span>}
            </button>
          </div>
        </div>, document.body)}
      </div>
    </div>
  );
}

function StartBlock({ room, cs, conn, isHost, playing, seatedHumans, n, onBackToGame, onLeave }: {
  room: RoomInfo; cs: ConnState; conn: TableConnection; isHost: boolean; playing: boolean; seatedHumans: number; n: number;
  onBackToGame: (() => void) | null; onLeave: () => void;
}) {
  const filled = room.seats.filter((s) => s.kind !== 'empty').length;
  const open = n - filled;
  const hostName = room.members.find((m) => m.playerId === room.hostId)?.name ?? 'host';
  const status = playing ? 'Game in progress'
    : `${filled} of ${n} seated${open > 0 ? ` · waiting on ${open}` : ' · ready'}${open > 0 ? (isHost ? ` · Start fills with bot${open > 1 ? 's' : ''}` : '') : ''}`;
  return (
    <div className="lobby-start" data-testid="lobby-start">
      {!playing && <p className="lobby-status" data-testid="lobby-status" aria-live="polite"><span className="live-dot" /><span key={status} className="status-text">{status}</span></p>}
      {onBackToGame && <button type="button" className="primary big" onClick={onBackToGame}>Back to the game</button>}
      {!playing && (isHost ? (
        <button type="button" className="primary big start-gold" data-testid="start" disabled={seatedHumans === 0} onClick={() => conn.send({ t: room.phase === 'over' ? 'rematch' : 'start' })}>
          {room.phase === 'over' ? 'Rematch' : open > 0 ? `START — ${open} BOT${open > 1 ? 'S' : ''} FILL` : 'START'}
        </button>
      ) : (
        <p className="waiting waiting-block">WAITING FOR HOST TO START{hostName !== 'host' ? ` — ${hostName.toUpperCase()}` : ''}</p>
      ))}
      {playing && cs.seat === null && <p className="waiting">Game in progress. Tap a bot's seat to take it over.</p>}
      {cs.error && Date.now() - cs.error.at < 4000 && <div className="err" role="alert">{cs.error.message}</div>}
      <div className="exit-divider" aria-hidden />
      <button type="button" className="leave-table-btn" data-testid="leave-table" onClick={onLeave}>LEAVE TABLE</button>
    </div>
  );
}

/** Lobby seat face: a human's uploaded picture (Demetrius 2026-10-19), 🤖 for bots, else the initial.
 *  A signed-in human's face is tappable and opens their profile (Demetrius 2026-10-20);
 *  bots and account-less guests stay plain. */
function SeatFace({ info, name }: { info: SeatInfo; name: string }) {
  const pic = useAvatar(info.kind === 'human' ? info.uid : undefined);
  if (info.kind === 'bot') return <span className="av-initial">🤖</span>;
  const target = profileTargetOf({ id: info.kind === 'human' ? info.uid : undefined, name });
  return <AvatarCircle pic={pic} name={name} className="av-initial" onTap={target ? () => openPlayerProfile({ id: info.kind === 'human' ? info.uid : undefined, name }) : undefined} />;
}

function SeatCard({ seat, info, spot, mine, isHost, playing, hostId, onSit, onBot, onRemoveBot, media }: {
  seat: number; info: SeatInfo; spot: string; mine: boolean; isHost: boolean; playing: boolean; hostId: string; you: string | null;
  onSit: () => void; onBot: () => void; onRemoveBot: () => void; media: React.ReactNode;
}) {
  const label = `Seat ${seat + 1}`;
  const cls = `seat-card spot-${spot} ${mine ? 'mine' : ''} no-team ${info.kind === 'empty' ? 'open' : 'taken'}`;
  // The top slot is the seat-number label on EVERY card (owner 2026-10-24:
  // the viewer's own card used to swap it for a "YOU" tag, leaving that card
  // with no legible seat number at all). "Mine" reads from the gold frame and
  // the plate's YOU name below, not from this label.
  const top = <div className="seat-top">{label}</div>;
  if (info.kind === 'empty') {
    return (
      <div className={cls} data-testid={`lobby-seat-${seat}`}>
        <button type="button" className="seat-hit" aria-label="Sit here" onClick={onSit}>
          {top}<span className="seat-ring empty" aria-hidden><span className="seat-plus">+</span></span><span className="seat-plate empty">SIT HERE</span>
        </button>
        {isHost && !playing && <button type="button" className="seat-bot" aria-label={`Add a bot to ${label}`} onClick={onBot}>+ BOT</button>}
      </div>
    );
  }
  const name = info.kind === 'bot' ? info.name : info.name;
  const ready = info.kind === 'bot' || info.connected;
  return (
    <div className={cls} data-testid={`lobby-seat-${seat}`}>
      {top}
      <div className={`seat-ring occupied ${mine ? 'mine' : ''}`} style={info.kind === 'human' && !mine ? { ['--av' as string]: colorFor(info.playerId) } : undefined}>
        <SeatFace info={info} name={name} />
        {info.kind === 'human' && media}
        {ready && <span className="ready-check" title="Ready" aria-label="ready">✓</span>}
      </div>
      <div className="seat-plate">
        <span className="seat-name">{mine ? 'YOU' : name}</span>{info.kind === 'human' && info.playerId === hostId && <span className="host-tag" title="Host" aria-label="host">HOST</span>}
      </div>
      {info.kind === 'human' && !info.connected && <span className="chip bad">OFFLINE</span>}
      {info.kind === 'bot' && isHost && !playing && <button type="button" className="link seat-sub" onClick={onRemoveBot}>Remove</button>}
      {info.kind === 'bot' && playing && <button type="button" className="sit seat-sub" onClick={onSit}>Take over</button>}
      {info.kind === 'human' && isHost && !playing && !info.connected && !mine && <button type="button" className="link seat-sub" onClick={onBot}>Replace with bot</button>}
    </div>
  );
}

/**
 * Lobby chat. Wide screens: a full-height column, always visible, input pinned to the bottom.
 * Phones: a sticky bottom tab (with unread badge) that opens a drawer — always one tap away.
 */
function LobbyChat({ cs, onSend, open, setOpen, wide }: { cs: ConnState; onSend: (t: string) => void; open: boolean; setOpen: (v: boolean) => void; wide: boolean }) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: 1e6 }); }, [cs.chat.length, open]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim().slice(0, 200));
    setText('');
  };
  const ui = (
    <>
    <section className={`panel lobby-chat ${wide ? 'wide' : open ? 'drawer open' : 'drawer'}`} aria-label="Table chat" data-testid="lobby-chat">
      <header className="lc-head"><span className="live-dot" /> TABLE CHAT{!wide && <button type="button" className="lc-close" aria-label="Close chat" onClick={() => setOpen(false)}>✕</button>}</header>
      <div className="chat-list" ref={list}>
        {cs.chat.slice(-100).map((l) => (
          <div key={l.id} className={`chat-line ${l.system ? 'system' : ''}`}>
            {l.system ? <span>{l.text}</span> : <><b style={{ color: l.from === cs.you && !cs.spectator ? '#f5c542' : colorFor(l.from ?? '') }}>{l.from === cs.you && !cs.spectator ? 'You' : l.name}</b> <span>{l.text}</span></>}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="chat-input">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something…" maxLength={200} aria-label="Chat message" />
        <button type="submit" aria-label="Send">➤</button>
      </form>
    </section>
    </>
  );
  // phones: the tab + drawer are fixed to the viewport — portal them out of the (animated, scrolling) lobby so no
  // transformed ancestor can re-anchor or cover them
  return wide ? ui : createPortal(<div className="lobby-chat-portal">{ui}</div>, document.body);
}

function useWide(): boolean {
  const q = '(min-width: 1024px) and (min-height: 600px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const on = () => setWide(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  return wide;
}
