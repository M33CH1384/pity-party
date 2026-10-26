import type { RoomInfo } from '@pp/protocol';
import type { ModeId, OptionValues } from '@pp/game';
import { type ModeChoice, modeCatalog, tableSeatRange } from './catalog';
import { ModeOptionsForm, ModePicker } from './ModeSetup';

/**
 * Lobby GAME panel (3c). Everyone sees the game, its options, the seat count and the turn timer.
 * The host edits them before the game starts (mode + options → `mode`, seats → `config`);
 * guests, and everyone mid-game, see the same form read-only.
 */
export function LobbyGame({ room, editable, onMode, onSeats }: {
  room: RoomInfo; editable: boolean;
  onMode: (c: ModeChoice) => void; onSeats: (n: number) => void;
}) {
  const modes = modeCatalog();
  const modeId = (room.modeId ?? 'placeholder') as ModeId;
  const cur = modes.find((m) => m.modeId === modeId) ?? modes.find((m) => m.available)!;
  const options = (room.modeOptions ?? {}) as OptionValues;
  const { min, max } = tableSeatRange(cur.modeId);
  const n = room.rules.playerCount;
  const seatChoices = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <section className="panel lobby-game" data-testid="lobby-game-panel">
      <div className="panel-title">GAME{editable ? <small> (host)</small> : <small> · set by the host</small>}</div>
      {editable
        ? <ModePicker value={{ modeId: cur.modeId, options }} onChange={onMode} modes={modes} />
        : <p className="lobby-game-name" data-testid="lobby-game-name"><b>{cur.title}</b> <small>{cur.blurb}</small></p>}
      <div className="lobby-game-facts">
        <label className="row"><span className="row-label">Seats<small>{min === max ? `${cur.title} seats ${min}` : `${cur.title} seats ${min}–${max}`}</small></span><span className="row-control">
          {editable
            ? <select data-testid="lobby-seats" aria-label="Seats" value={String(n)} onChange={(e) => onSeats(Number(e.target.value))}>
                {seatChoices.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            : <b data-testid="lobby-seats-ro">{n}</b>}
        </span></label>
        <p className="row lobby-timer-info" data-testid="lobby-timer-info"><span className="row-label">Turn timer<small>then a bot moves for you</small></span><b>{room.rules.turnTimerSec}s</b></p>
      </div>
      <p className="mode-opts-head">{cur.title} options</p>
      <ModeOptionsForm schema={cur.schema} values={options} disabled={!editable} onChange={(o) => onMode({ modeId: cur.modeId, options: o })} />
    </section>
  );
}
