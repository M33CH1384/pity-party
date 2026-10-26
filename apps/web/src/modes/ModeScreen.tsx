import type { Results } from '@pp/game';
import { modeViews } from './views';

/** The shell around a mode's table: title bar, the mode's table, its recap when the game is done. Used offline and online. */
export function ModeScreen({ modeId, view, legal, toAct, results, mySeat, names, onMove, busy, onLeave, onAgain, againLabel = 'Play again', status }: {
  modeId: string; view: unknown; legal: readonly unknown[]; toAct: readonly number[]; results: Results; mySeat: number | null; names: readonly string[];
  onMove: (m: unknown) => void; busy?: boolean; onLeave: () => void; onAgain?: (() => void) | null; againLabel?: string; status?: string;
}) {
  const v = modeViews(modeId);
  return (
    <div className="mode-screen" data-testid="mode-screen" data-mode={modeId}>
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
    </div>
  );
}
