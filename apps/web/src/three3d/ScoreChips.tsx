/**
 * V10g top-bar score chips (table-v2 board): one chip per seat (avatar initial, name, points; the target is on the goal line), the seat to act
 * ringed in the accent. A visual duplicate of the DOM seat strip (which stays the a11y layer), so aria-hidden.
 * Portaled into the mode screen from the lazy chunk: 0 bytes on the first load. Public data only (the table snapshot).
 */
import { createPortal } from 'react-dom';
import type { TableSnap } from './handMirror';

export function ScoreChips({ snap, root }: { snap: TableSnap | null; root: HTMLElement | null }) {
  if (!snap || !root) return null;
  return createPortal(
    <div className="v3-chips" aria-hidden="true" data-testid="score-chips">
      {Array.from({ length: snap.n }, (_, s) => {
        const name = snap.nm[s] ?? `Seat ${s + 1}`;
        return (
          <span key={s} className={`v3-chip${snap.turn === s ? ' is-turn' : ''}${snap.me === s ? ' is-me' : ''}`}>
            <i>{(name.trim()[0] ?? '?').toUpperCase()}</i>
            <b>{snap.me === s ? 'You' : name}</b>
            <em>{snap.pt[s] ?? 0}</em>
          </span>
        );
      })}
    </div>,
    root,
  );
}
