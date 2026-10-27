import { useCallback, useState, type ReactNode } from 'react';
import type { Results } from '@pp/game';
import { modeViews } from './views';
import { useTableRenderer } from '../three3d/renderer';
import { Table3DLayer } from '../three3d/Table3DLayer';

/** The shell around a mode's table: title bar, the mode's table, its recap when the game is done. Used offline and online. */
export function ModeScreen({ modeId, view, legal, toAct, results, mySeat, names, onMove, busy, onLeave, onAgain, againLabel = 'Play again', status, children }: {
  modeId: string; view: unknown; legal: readonly unknown[]; toAct: readonly number[]; results: Results; mySeat: number | null; names: readonly string[];
  onMove: (m: unknown) => void; busy?: boolean; onLeave: () => void; onAgain?: (() => void) | null; againLabel?: string; status?: string; children?: ReactNode;
}) {
  const v = modeViews(modeId);
  const renderer = useTableRenderer();
  const [ready3d, setReady3d] = useState(false);
  const onReady = useCallback((r: boolean) => setReady3d(r), []);
  const on3d = renderer === '3d' && !!v;
  // V10a: the 2D table always stays mounted (it is the HUD and the fallback); the 3D layer sits under it and
  // data-renderer only flips to "3d" once its first frame is up, so the 2D felt shows until then.
  return (
    <div className="mode-screen" data-testid="mode-screen" data-mode={modeId} data-renderer={on3d && ready3d ? '3d' : '2d'}>
      {on3d && <Table3DLayer onReady={onReady} />}
      <header className="mode-bar">
        <button type="button" className="mode-leave" onClick={onLeave} data-testid="mode-leave">← Leave</button>
        <h1>{v?.title ?? modeId}</h1>
        <span className="mode-status">{status ?? ''}</span>
      </header>
      {!v ? <p className="mode-missing">This game isn't available in this version yet.</p> : (
        <>
          <v.Table view={view} legal={legal} toAct={toAct} mySeat={mySeat} names={names} onMove={onMove} busy={busy} />
          {results.done && (
            <div className="recap-sheet" role="dialog" aria-label="Game recap">
              <v.Recap results={results} names={names} mySeat={mySeat} />
              <div className="recap-actions">
                {onAgain && <button type="button" className="again" onClick={onAgain} data-testid="mode-again">{againLabel}</button>}
                <button type="button" onClick={onLeave} data-testid="mode-recap-leave">Leave</button>
              </div>
            </div>
          )}
        </>
      )}
      {children}
    </div>
  );
}
