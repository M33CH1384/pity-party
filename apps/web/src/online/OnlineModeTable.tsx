import type { Results } from '@pp/game';
import type { RoomInfo } from '@pp/protocol';
import { ModeScreen } from '../modes/ModeScreen';
import type { ConnState, TableConnection } from './connection';

export function seatNames(room: RoomInfo): string[] {
  return room.seats.map((s, i) => (s.kind === 'empty' ? `Seat ${i + 1}` : s.name));
}

/** Online registry-mode table: per-seat view, legal moves and results come from the server; moves go out as `move`. */
export default function OnlineModeTable({ conn, cs, onLobby, onLeave }: { conn: TableConnection; cs: ConnState; onLobby: () => void; onLeave: () => void }) {
  const room = cs.room!;
  const m = cs.mode!;
  const host = room.hostId === cs.you;
  return (
    <ModeScreen
      modeId={m.modeId} view={m.view} legal={m.legal} toAct={m.toAct} results={m.results as Results}
      mySeat={cs.seat} names={seatNames(room)} status={cs.spectator ? 'watching' : `table ${room.code}`}
      onMove={(mv) => conn.sendMove(mv)}
      onLeave={onLeave}
      onAgain={host ? () => conn.send({ t: 'rematch' }) : onLobby}
      againLabel={host ? 'Rematch' : 'Back to lobby'}
    />
  );
}
