/**
 * Web mode registry: per-mode table view + recap. The shell (ModeScreen) looks the pair up by modeId;
 * Pitty Pat's lives in pittyPatView.tsx; Tonk registers its own when its engine lands. Neutral placeholder theme.
 */
import type { ComponentType } from 'react';
import { PittyPatRecap, PittyPatTable } from './pittyPatView';
import { type Card, type HcMove, type HcView, type ModeId, type Results, rankLabel } from '@pp/game';

export interface ModeTableProps {
  view: unknown;
  legal: readonly unknown[];
  toAct: readonly number[];
  mySeat: number | null;
  names: readonly string[];
  onMove: (move: unknown) => void;
  /** a move is in flight (online): lock the hand */
  busy?: boolean;
}
export interface ModeRecapProps { results: Results; names: readonly string[]; mySeat: number | null }
export interface ModeViews { title: string; Table: ComponentType<ModeTableProps>; Recap: ComponentType<ModeRecapProps> }

const SUIT: Record<string, string> = { C: '♣', D: '♦', H: '♥', S: '♠' };
export const cardText = (c: Card) => (c.suit ? `${rankLabel(c.rank)}${SUIT[c.suit]}` : 'JK');
const red = (c: Card) => c.suit === 'D' || c.suit === 'H';

export function PlainCard({ card, onClick, disabled, testid }: { card: Card; onClick?: () => void; disabled?: boolean; testid?: string }) {
  const body = <span className={`pcard${red(card) ? ' red' : ''}`}>{cardText(card)}</span>;
  if (!onClick) return <span className="pcard-wrap" data-testid={testid}>{body}</span>;
  return <button type="button" className="pcard-btn" disabled={disabled} onClick={onClick} data-testid={testid} aria-label={`Play ${cardText(card)}`}>{body}</button>;
}

/** Seats around the top, in order; whose turn is ringed. */
export function SeatStrip({ names, mySeat, turn, extra }: { names: readonly string[]; mySeat: number | null; turn: number | null; extra: (seat: number) => string }) {
  return (
    <ol className="seat-strip" data-testid="seat-strip">
      {names.map((n, i) => (
        <li key={i} className={`seat-chip${i === turn ? ' turn' : ''}${i === mySeat ? ' is-me' : ''}`} data-testid={`seat-${i}`}>
          <b>{i === mySeat ? 'You' : n}</b><small>{extra(i)}</small>
        </li>
      ))}
    </ol>
  );
}

function HighCardTable({ view, legal, mySeat, names, onMove, busy }: ModeTableProps) {
  const v = view as HcView;
  const ok = new Set((legal as HcMove[]).map((m) => m.cardId));
  const myTurn = mySeat !== null && v.turn === mySeat;
  return (
    <div className="mode-table hc-table" data-testid="mode-table" data-my-turn={myTurn ? 'yes' : 'no'}>
      <SeatStrip names={names} mySeat={mySeat} turn={v.turn} extra={(i) => `${v.wins[i] ?? 0} won · ${v.handSizes[i] ?? 0} left`} />
      <div className="trick-area" data-testid="trick-area" aria-live="polite">
        {v.table.length ? v.table.map((p) => (
          <figure key={p.card.id} className="played"><PlainCard card={p.card} /><figcaption>{p.seat === mySeat ? 'You' : names[p.seat]}</figcaption></figure>
        )) : <p className="trick-empty">{v.turn === null ? 'Game over' : 'Highest card takes the round'}</p>}
      </div>
      <p className="turn-line" data-testid="turn-line">{v.turn === null ? '' : myTurn ? 'Your turn: tap a card' : `${names[v.turn]}'s turn`}</p>
      {mySeat !== null && (
        <div className="my-hand" data-testid="my-hand">
          {v.hand.map((c) => <PlainCard key={c.id} card={c} testid={`hc-${c.id}`} disabled={busy || !ok.has(c.id)} onClick={() => onMove({ t: 'play', cardId: c.id } satisfies HcMove)} />)}
        </div>
      )}
    </div>
  );
}

/** Generic recap: placings with coin changes; mode recaps can add their own detail on top. */
export function PlacingsRecap({ results, names, mySeat, detail }: ModeRecapProps & { detail?: (seat: number) => string }) {
  const tie = results.deltas.every((d) => d === 0);
  const top = results.placements[0];
  return (
    <div className="mode-recap" data-testid="mode-recap">
      <h2>{tie ? "It's a tie" : top === mySeat ? 'You win!' : `${names[top!]} wins`}</h2>
      <ol className="placings">
        {results.placements.map((s) => {
          const d = results.deltas[s] ?? 0;
          return (
            <li key={s} className={s === mySeat ? 'is-me' : ''} data-testid={`placing-${s}`}>
              <span>{s === mySeat ? 'You' : names[s]}</span>
              {detail && <small>{detail(s)}</small>}
              <b className={d > 0 ? 'up' : d < 0 ? 'down' : ''}>{d > 0 ? `+${d}` : d} coins</b>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function HighCardRecap(p: ModeRecapProps) {
  const wins = ((p.results.recap ?? {}) as { wins?: number[] }).wins ?? [];
  return <PlacingsRecap {...p} detail={(s) => `${wins[s] ?? 0} round${wins[s] === 1 ? '' : 's'}`} />;
}

const VIEWS: Partial<Record<ModeId, ModeViews>> = {
  'pitty-pat': { title: 'Pitty Pat', Table: PittyPatTable, Recap: PittyPatRecap },
  placeholder: { title: 'High Card', Table: HighCardTable, Recap: HighCardRecap },
};

export function modeViews(id: string): ModeViews | null {
  return VIEWS[id as ModeId] ?? null;
}
