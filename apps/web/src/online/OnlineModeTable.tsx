import { useEffect, useState } from 'react';
import type { Results } from '@pp/game';
import type { RoomInfo } from '@pp/protocol';
import { ModeScreen } from '../modes/ModeScreen';
import type { ConnState, TableConnection } from './connection';
import { LobbyChat, useWide } from './Lobby';

export function seatNames(room: RoomInfo): string[] {
  return room.seats.map((s, i) => (s.kind === 'empty' ? `Seat ${i + 1}` : s.name));
}

/** Online registry-mode table: per-seat view, legal moves and results come from the server; moves go out as `move`.
 *  The table chat (players + spectators) stays one tap away: a floating 💬 tab with an unread badge opens the drawer. */
export default function OnlineModeTable({ conn, cs, onLobby, onLeave }: { conn: TableConnection; cs: ConnState; onLobby: () => void; onLeave: () => void }) {
  const room = cs.room!;
  const m = cs.mode!;
  const host = room.hostId === cs.you;
  const wide = useWide();
  const [chatOpen, setChatOpen] = useState(false);
  const said = cs.chat.filter((l) => !l.system).length;
  const [seen, setSeen] = useState(said);
  useEffect(() => { if (chatOpen || wide) setSeen(said); }, [chatOpen, wide, said]);
  const unread = Math.max(0, said - seen);
  const watchers = room.spectators?.length ?? 0;
  const status = cs.spectator ? 'watching' : `table ${room.code}${watchers ? ` · 👁 ${watchers}` : ''}`;
  return (
    <ModeScreen
      modeId={m.modeId} view={m.view} legal={m.legal} toAct={m.toAct} results={m.results as Results}
      mySeat={cs.seat} names={seatNames(room)} status={status}
      onMove={(mv) => conn.sendMove(mv)}
      onLeave={onLeave}
      onAgain={host ? () => conn.send({ t: 'rematch' }) : onLobby}
      againLabel={host ? 'Rematch' : 'Back to lobby'}
    >
      {!wide && (
        <button type="button" className={`table-chat-tab ${chatOpen ? 'on' : ''}`} data-testid="table-chat-tab" aria-expanded={chatOpen} aria-label="Table chat" onClick={() => setChatOpen(!chatOpen)}>
          💬{unread > 0 && !chatOpen && <span className="unread" data-testid="table-unread">{unread}</span>}
        </button>
      )}
      <LobbyChat cs={cs} onSend={(text) => conn.send({ t: 'chat', text })} open={chatOpen} setOpen={setChatOpen} wide={wide} />
    </ModeScreen>
  );
}
