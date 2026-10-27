/**
 * Tonk table + recap (milestone 9b). POINTS are the main score ("4 / 10"); coins only when coin stakes are on.
 * Same neutral --pp-* tokens and patterns as the Pitty Pat table. iPhone-first at 390px: the hand wraps (7 cards
 * fit), spreads stack per seat and scroll inside their own box. Tap a card to select it, then Hit (on a spread
 * that lights up) or Discard. Everything comes from the seat's own view, never another hand.
 */
import { CardBack } from '../cards/CardFace';
import { useState } from 'react';
import { type Card, type Spread, type TkEvent, type TkHandEnd, type TkMove, type TkRecap, type TkView, isWildCard, tkCount } from '@pp/game';
import { ReshuffleBeat, useReshuffleBeat } from './reshuffle';
import { MiniCard, type ModeRecapProps, type ModeTableProps, PlainCard, cardText } from './views';

const who = (seat: number, mySeat: number | null, names: readonly string[]) => (seat === mySeat ? 'You' : names[seat] ?? `Seat ${seat + 1}`);
const pts = (n: number) => `${n} pt${n === 1 ? '' : 's'}`;
const SUIT_ORDER: Record<string, number> = { C: 0, D: 1, S: 2, H: 3 };
const sortHand = (h: readonly Card[]) => [...h].sort((a, b) => (SUIT_ORDER[a.suit ?? ''] ?? 9) - (SUIT_ORDER[b.suit ?? ''] ?? 9) || a.rank - b.rank);

function goalText(v: TkView): string {
  if (v.options.gameEnd === 'fixedHands') return `${v.options.gameHands} hands · most points wins`;
  return `First to ${v.gameTarget} point${v.gameTarget === 1 ? '' : 's'}`;
}
const HOW: Record<TkHandEnd['how'], string> = { instant: 'instant win on the deal', tonk: 'Tonk!', out: 'went out', drop: 'dropped and won', caught: 'caught the drop', stockOut: 'lowest when the stock ran out', void: 'void' };

export function handEndText(h: TkHandEnd, mySeat: number | null, names: readonly string[]): string {
  if (h.winner === null) return `Hand ${h.hand + 1} void: nobody scores`;
  const w = who(h.winner, mySeat, names);
  if (h.how === 'caught' && h.dropper !== null) return `${w} caught ${who(h.dropper, mySeat, names)}'s drop`;
  if (h.how === 'tonk') return `${w}: Tonk!`;
  return `${w} ${HOW[h.how]}`;
}

function eventText(e: TkEvent, mySeat: number | null, names: readonly string[]): string {
  const w = (s: number) => who(s, mySeat, names);
  switch (e.e) {
    case 'deal': return `Hand ${e.hand + 1} dealt · up ${cardText(e.up)}`;
    case 'redeal': return 'Two instant winners: redeal';
    case 'draw': return `${w(e.seat)} drew from the ${e.from}${e.card ? ` (${cardText(e.card)})` : ''}`;
    case 'spread': return `${w(e.seat)} spread ${e.cards.map(cardText).join(' ')}`;
    case 'hit': return `${w(e.seat)} hit with ${cardText(e.card)}`;
    case 'discard': return `${w(e.seat)} discarded ${cardText(e.card)}`;
    case 'slap': return `${w(e.seat)} slapped ${cardText(e.card)}`;
    case 'waive': return `${w(e.seat)} let the slap go`;
    case 'drop': return `${w(e.seat)} dropped at ${e.count}`;
    case 'end': return 'Hand over';
  }
}

const TkMini = ({ c, v }: { c: Card; v: TkView }) => <MiniCard c={c} wild={isWildCard(c, v.options)} />;

export function TonkTable({ view, legal, mySeat, names, onMove, busy }: ModeTableProps) {
  const v = view as TkView;
  const reshuffling = useReshuffleBeat(v.phase);
  const moves = legal as TkMove[];
  const [sel, setSel] = useState<string | null>(null);
  const n = v.handCounts.length;
  const hand = sortHand(v.hand);
  const discards = new Set(moves.flatMap((m) => (m.t === 'discard' ? [m.cardId] : [])));
  const hitsByCard = new Map<string, number[]>();
  for (const m of moves) if (m.t === 'hit') hitsByCard.set(m.cardId, [...(hitsByCard.get(m.cardId) ?? []), m.spreadId]);
  const selectable = new Set([...discards, ...hitsByCard.keys()]);
  const picked = sel && selectable.has(sel) ? sel : null;
  const pickedCard = picked ? hand.find((c) => c.id === picked) ?? null : null;
  const hitTargets = new Set(picked ? hitsByCard.get(picked) ?? [] : []);
  const spreadMoves = moves.filter((m): m is Extract<TkMove, { t: 'spread' }> => m.t === 'spread');
  const slaps = moves.filter((m): m is Extract<TkMove, { t: 'slap' }> => m.t === 'slap');
  const order: TkMove['t'][] = ['drawStock', 'drawDiscard', 'drop', 'waive'];
  const simple = order.flatMap((t) => moves.filter((m) => m.t === t));
  const next = moves.find((m) => m.t === 'nextHand');
  const myTurn = mySeat !== null && moves.length > 0;
  const act = (m: TkMove) => { setSel(null); onMove(m); };
  const byId = new Map(v.hand.map((c) => [c.id, c]));
  const label = (m: TkMove): string => {
    switch (m.t) {
      case 'drawStock': return 'Draw from stock';
      case 'drawDiscard': return `Take ${v.discardTop ? cardText(v.discardTop) : 'discard'}`;
      case 'drop': return `Drop (${tkCount(v.hand)})`;
      case 'waive': return 'Let it go';
      case 'spread': { const cs = m.cardIds.map((id) => byId.get(id)!).filter(Boolean); return `Spread ${cs.map(cardText).join(' ')}${cs.some((c) => isWildCard(c, v.options)) ? ' (wild)' : ''}`; }
      case 'slap': return `Slap ${v.discardTop ? cardText(v.discardTop) : ''} onto ${who(v.spreads.find((s) => s.id === m.spreadId)?.owner ?? 0, mySeat, names)}'s spread`;
      default: return '';
    }
  };
  const turnLine = v.phase === 'over' ? 'Game over'
    : v.phase === 'handOver' ? (next ? 'Your deal: tap Next hand' : `Waiting for ${who(v.turn ?? 0, mySeat, names)} to deal`)
    : v.phase === 'slap' ? (myTurn ? 'Slap chance: play the discard onto a spread' : 'Slap chance…')
    : v.phase === 'slapShed' ? (myTurn ? 'You slapped: tap a card to shed' : `${who(v.turn ?? 0, mySeat, names)} sheds a card`)
    : myTurn ? (v.phase === 'start' ? (v.lockedNow ? 'Your turn (hit lock: no spread or drop)' : 'Your turn: draw or drop') : picked ? 'Hit a lit spread or discard' : 'Spread, or tap a card to hit or discard')
    : v.turn !== null ? `${who(v.turn, mySeat, names)}'s turn` : '';
  const lastEvent = v.log.length ? v.log[v.log.length - 1]! : null;
  const spreadsOf = (seat: number) => v.spreads.filter((s) => s.owner === seat);
  const spreadRow = (s: Spread) => {
    const hit = hitTargets.has(s.id);
    const inner = <>{s.cards.map((c) => <TkMini key={c.id} c={c} v={v} />)}</>;
    return hit
      ? <button key={s.id} type="button" className="tk-spread pp-move pp-primary" data-testid={`tk-hit-${s.id}`} disabled={busy} aria-label={`Hit ${pickedCard ? cardText(pickedCard) : ''} on this spread`} onClick={() => act({ t: 'hit', cardId: picked!, spreadId: s.id })}>{inner}<span className="tk-hit-tag">Hit</span></button>
      : <span key={s.id} className="tk-spread" data-testid={`tk-spread-${s.id}`}>{inner}</span>;
  };
  return (
    <div className="mode-table pp-table tk-table" data-testid="mode-table" data-tk-phase={v.phase} data-my-turn={myTurn ? 'yes' : 'no'}>
      <div className="pp-goal" data-testid="pp-goal"><b>{goalText(v)}</b><span>Hand {v.phase === 'handOver' && v.lastHand ? v.lastHand.hand + 1 : v.handNo + 1}{v.options.wilds === 'jokers' ? ' · jokers wild' : v.options.wilds === 'deuces' ? ' · 2s wild' : ''}</span></div>
      <ol className="pp-seats" data-testid="seat-strip">
        {Array.from({ length: n }, (_, i) => (
          <li key={i} className={`pp-seat${i === v.turn && v.phase !== 'over' ? ' turn' : ''}${i === mySeat ? ' is-me' : ''}`} data-testid={`seat-${i}`}>
            <span className="pp-seat-name">{who(i, mySeat, names)}{v.lockNext[i] ? ' 🔒' : ''}</span>
            <span className="pp-points" data-testid={`tk-points-${i}`}><b>{pts(v.points[i] ?? 0)}</b>{v.options.gameEnd === 'firstToPoints' && <small> / {v.gameTarget}</small>}</span>
            <span className="pp-seat-sub">{v.handCounts[i] ?? 0} card{v.handCounts[i] === 1 ? '' : 's'} · {spreadsOf(i).length} spread{spreadsOf(i).length === 1 ? '' : 's'}</span>
          </li>
        ))}
      </ol>
      <div className="pp-center" data-testid="trick-area" aria-live="polite">
        <div className="pp-pile">
          <span className="pp-label">Discard</span>
          {v.discardTop ? <span className="pp-up" data-testid="tk-discard"><PlainCard card={v.discardTop} wild={isWildCard(v.discardTop, v.options)} /></span> : <span className="pp-up empty">—</span>}
        </div>
        <div className="pp-pile">
          <span className="pp-label">Stock</span>
          <span className="pp-stock" data-testid="tk-stock"><CardBack /><b className="pp-stock-n">{v.stockCount}</b></span>
          {v.options.coinStakes && <span className="pp-pot" data-testid="tk-stake">{v.options.stake}c / pt</span>}
        </div>
      </div>
      {v.spreads.length > 0 && (
        <section className="tk-spreads" data-testid="tk-spreads" aria-label="Spreads on the table">
          {Array.from({ length: n }, (_, i) => spreadsOf(i).length > 0 && (
            <div key={i} className="tk-spread-seat"><span className="pp-label">{who(i, mySeat, names)}</span><div className="tk-spread-list">{spreadsOf(i).map(spreadRow)}</div></div>
          ))}
        </section>
      )}
      {lastEvent && v.phase !== 'handOver' && <p className="pp-event" data-testid="pp-event">{eventText(lastEvent, mySeat, names)}</p>}
      {v.phase === 'handOver' && v.lastHand && (
        <section className="pp-result" data-testid="tk-hand-result" aria-live="assertive">
          <h2>{handEndText(v.lastHand, mySeat, names)}</h2>
          <ol className="pp-result-scores">
            {Array.from({ length: n }, (_, i) => {
              const d = v.lastHand!.deltas[i] ?? 0;
              return <li key={i} className={i === v.lastHand!.winner ? 'won' : ''}><span>{who(i, mySeat, names)} <small>({v.lastHand!.counts[i] ?? 0})</small></span><b>{pts(v.points[i] ?? 0)}</b><small>{d > 0 ? '+' : ''}{d}{v.options.coinStakes ? ` · ${d * v.options.stake}c` : ''}</small></li>;
            })}
          </ol>
          {next ? <button type="button" className="pp-move pp-primary" data-testid="tk-next-hand" disabled={busy} onClick={() => act(next)}>Next hand</button>
            : <p className="pp-wait">Waiting for {who(v.turn ?? 0, mySeat, names)} to deal…</p>}
        </section>
      )}
      <ReshuffleBeat on={reshuffling} />
      <p className="turn-line" data-testid="turn-line">{turnLine}</p>
      {(simple.length > 0 || spreadMoves.length > 0 || slaps.length > 0 || pickedCard) && (
        <div className="pp-actions" data-testid="tk-actions">
          {slaps.map((m) => <button key={`s${m.spreadId}`} type="button" className="pp-move pp-primary" data-testid={`tk-slap-${m.spreadId}`} disabled={busy} onClick={() => act(m)}>{label(m)}</button>)}
          {spreadMoves.map((m) => <button key={m.cardIds.join()} type="button" className="pp-move pp-primary" data-testid={`tk-spread-${m.cardIds.join('-')}`} disabled={busy} onClick={() => act(m)}>{label(m)}</button>)}
          {pickedCard && discards.has(pickedCard.id) && <button type="button" className="pp-move" data-testid="tk-discard-btn" disabled={busy} onClick={() => act({ t: 'discard', cardId: pickedCard.id })}>Discard {cardText(pickedCard)}</button>}
          {simple.map((m) => <button key={m.t} type="button" className="pp-move" data-testid={`tk-${m.t}`} disabled={busy} onClick={() => act(m)}>{label(m)}</button>)}
        </div>
      )}
      {mySeat !== null && (
        <div className="my-hand pp-hand tk-hand" data-testid="my-hand">
          {hand.map((c) => (
            <span key={c.id} className={`pp-card-slot${picked === c.id ? ' tk-picked' : ''}`}>
              <PlainCard card={c} testid={`tk-card-${c.id}`} wild={isWildCard(c, v.options)} disabled={busy || !selectable.has(c.id) || picked === c.id} onClick={selectable.has(c.id) ? () => setSel(c.id) : undefined} />
            </span>
          ))}
          {hand.length === 0 && v.phase !== 'over' && <p className="trick-empty">No cards</p>}
          {hand.length > 0 && <p className="tk-count" data-testid="tk-count">Count {tkCount(v.hand)}</p>}
        </div>
      )}
    </div>
  );
}

export function TonkRecap({ results, names, mySeat }: ModeRecapProps) {
  const r = (results.recap ?? {}) as Partial<TkRecap>;
  const points = r.points ?? [];
  const coins = r.coinStakes === true;
  const top = results.placements[0]!;
  const tie = results.placements.length > 1 && (points[top] ?? 0) === (points[results.placements[1]!] ?? 0);
  const hands = r.hands ?? [];
  return (
    <div className="mode-recap pp-recap" data-testid="mode-recap">
      <h2>{tie ? "It's a tie" : top === mySeat ? 'You win!' : `${names[top]} wins`}</h2>
      <ol className="placings">
        {results.placements.map((s) => {
          const d = results.deltas[s] ?? 0;
          return (
            <li key={s} className={s === mySeat ? 'is-me' : ''} data-testid={`placing-${s}`}>
              <span>{who(s, mySeat, names)}</span>
              <small>{r.tonks?.[s] ?? 0} tonk · {r.drops?.[s] ?? 0} drop{(r.drops?.[s] ?? 0) === 1 ? '' : 's'} · caught {r.caught?.[s] ?? 0}×</small>
              <b data-testid={`recap-points-${s}`}>{pts(points[s] ?? 0)}</b>
              {coins && <b className={d > 0 ? 'up' : d < 0 ? 'down' : ''}>{d > 0 ? `+${d}` : d}c</b>}
            </li>
          );
        })}
      </ol>
      <p className="pp-recap-meta">{hands.length} hand{hands.length === 1 ? '' : 's'}</p>
      <ol className="pp-hands" data-testid="tk-recap-hands" aria-label="Hand by hand">
        {hands.map((h) => (
          <li key={h.n}><span>Hand {h.n + 1}</span><span>{handEndText({ ...h, hand: h.n, counts: [] }, mySeat, names)}</span></li>
        ))}
      </ol>
    </div>
  );
}
