/**
 * Pitty Pat table + recap (milestone 7b). POINTS are the main score (1 per hand won, "3 / 5" to the target);
 * coins show only when the coin ante & pot option is on. iPhone-first at 390px, neutral --pp-* tokens.
 * Everything here comes from the seat's own view (own hand + public table), never another hand.
 */
import { type Card, type PpEvent, type PpMove, type PpRecap, type PpView, rankLabel } from '@pp/game';
import { type ModeRecapProps, type ModeTableProps, PlainCard, cardText } from './views';

const who = (seat: number, mySeat: number | null, names: readonly string[]) => (seat === mySeat ? 'You' : names[seat] ?? `Seat ${seat + 1}`);
const pts = (n: number) => `${n} pt${n === 1 ? '' : 's'}`;
const isWild = (c: Card, v: PpView) => v.options.deucesWild && c.rank === 2;

function goalText(v: PpView): string {
  const o = v.options;
  if (o.gameEnd === 'fixedHands') return `${o.gameTarget} hands · most points wins`;
  if (o.gameEnd === 'lastWithChips') return 'Last player with coins wins';
  return `First to ${v.targetPoints} point${v.targetPoints === 1 ? '' : 's'}`;
}

function eventText(e: PpEvent, mySeat: number | null, names: readonly string[]): string {
  const w = (s: number) => who(s, mySeat, names);
  switch (e.e) {
    case 'deal': return `Hand ${e.hand + 1} dealt · upcard ${cardText(e.upcard)}`;
    case 'pair': return `${w(e.seat)} ${e.steal ? 'stole' : 'paired'} ${e.cards.map(cardText).join(' ')}`;
    case 'discard': return `${w(e.seat)} shed ${cardText(e.card)}`;
    case 'flip': return `${w(e.seat)} flipped ${cardText(e.card)}`;
    case 'pass': return `${w(e.seat)} passed on ${rankLabel(e.upcard.rank)}`;
    case 'waive': return `${w(e.seat)} let the steal go`;
    case 'reshuffle': return 'Discards reshuffled into the stock';
    case 'out': return `${w(e.seat)} went out${e.how === 'dealt' ? ' on the deal' : ''}!`;
    case 'void': return 'Hand void: nobody scores';
    case 'redeal': return 'Two winners on the deal: redeal';
  }
}

function handResultText(v: PpView, mySeat: number | null, names: readonly string[]): string {
  const h = v.lastHand;
  if (!h) return '';
  if (h.winner === null) return `Hand ${h.hand + 1} void: nobody scores`;
  const name = who(h.winner, mySeat, names);
  return `${name} went out${h.how === 'dealt' ? ' on the deal' : ''}: +1 point`;
}

function moveLabel(m: PpMove, v: PpView, hand: Map<string, Card>): string {
  if (m.t === 'pair' || m.t === 'steal') {
    const cs = m.cardIds.map((id) => hand.get(id)!).filter(Boolean);
    const wild = cs.some((c) => isWild(c, v)) || (v.upcard ? isWild(v.upcard, v) : false);
    return `${m.t === 'steal' ? 'Steal' : 'Pair'} ${cs.map(cardText).join(' + ')}${v.upcard ? ` with ${cardText(v.upcard)}` : ''}${wild ? ' (wild)' : ''}`;
  }
  return m.t === 'flip' ? 'Flip from the stock' : m.t === 'pass' ? 'Pass' : m.t === 'waive' ? 'Let it go' : m.t === 'nextHand' ? 'Next hand' : '';
}

export function PittyPatTable({ view, legal, mySeat, names, onMove, busy }: ModeTableProps) {
  const v = view as PpView;
  const moves = legal as PpMove[];
  const hand = new Map(v.hand.map((c) => [c.id, c]));
  const shed = new Set(moves.flatMap((m) => (m.t === 'discard' ? [m.cardId] : [])));
  const buttons = moves.filter((m) => m.t !== 'discard' && m.t !== 'nextHand');
  const next = moves.find((m) => m.t === 'nextHand');
  const myTurn = mySeat !== null && moves.length > 0;
  const n = v.handCounts.length;
  const lastEvent = v.log.length ? v.log[v.log.length - 1]! : null;
  const turnLine = v.phase === 'over' ? 'Game over'
    : v.phase === 'handOver' ? (next ? 'Your deal: tap Next hand' : `Waiting for ${who(v.turn ?? 0, mySeat, names)} to deal`)
    : v.phase === 'steal' ? (myTurn ? 'Steal chance: take the pair or let it go' : 'Steal chance…')
    : myTurn ? (shed.size ? 'Shed a card: tap one' : 'Your turn') : v.turn !== null ? `${who(v.turn, mySeat, names)}'s turn` : '';
  return (
    <div className="mode-table pp-table" data-testid="mode-table" data-pp-phase={v.phase} data-my-turn={myTurn ? 'yes' : 'no'}>
      <div className="pp-goal" data-testid="pp-goal"><b>{goalText(v)}</b><span>Hand {v.phase === 'handOver' && v.lastHand ? v.lastHand.hand + 1 : v.handNo + 1}{v.options.deucesWild ? ' · 2s wild' : ''}</span></div>
      <ol className="pp-seats" data-testid="seat-strip">
        {Array.from({ length: n }, (_, i) => {
          const pairs = Math.floor((v.shelves[i]?.length ?? 0) / 2);
          return (
            <li key={i} className={`pp-seat${i === v.turn && v.phase !== 'over' ? ' turn' : ''}${i === mySeat ? ' is-me' : ''}${v.active[i] ? '' : ' out'}`} data-testid={`seat-${i}`}>
              <span className="pp-seat-name">{who(i, mySeat, names)}</span>
              <span className="pp-points" data-testid={`pp-points-${i}`}><b>{v.points[i] ?? 0}</b>{v.options.gameEnd === 'firstToPoints' && <small> / {v.targetPoints}</small>}<small> pts</small></span>
              <span className="pp-seat-sub">{v.handCounts[i] ?? 0} card{v.handCounts[i] === 1 ? '' : 's'} · {pairs} pair{pairs === 1 ? '' : 's'}{v.coinPot ? ` · ${v.chips[i] ?? 0}c` : ''}</span>
              {(v.shelves[i]?.length ?? 0) > 0 && (
                <span className="pp-shelf" aria-label={`Pairs laid down by ${who(i, mySeat, names)}`}>
                  {v.shelves[i]!.map((c) => <i key={c.id} className={`pp-mini${c.suit === 'D' || c.suit === 'H' ? ' red' : ''}`}>{cardText(c)}</i>)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="pp-center" data-testid="trick-area" aria-live="polite">
        <div className="pp-pile">
          <span className="pp-label">Upcard</span>
          {v.upcard ? <span className="pp-up" data-testid="pp-upcard"><PlainCard card={v.upcard} />{isWild(v.upcard, v) && <em className="pp-wild">WILD</em>}</span> : <span className="pp-up empty">—</span>}
        </div>
        <div className="pp-pile">
          <span className="pp-label">Stock</span>
          <span className="pp-stock" data-testid="pp-stock">{v.stockCount}</span>
          {v.coinPot && <span className="pp-pot" data-testid="pp-pot">Pot {v.pot}c</span>}
        </div>
      </div>
      {v.lastHand && v.phase !== 'handOver' && v.phase !== 'over' && <p className="pp-last" data-testid="pp-last-hand">Last hand: {handResultText(v, mySeat, names)}</p>}
      {lastEvent && v.phase !== 'handOver' && <p className="pp-event" data-testid="pp-event">{eventText(lastEvent, mySeat, names)}</p>}
      {v.phase === 'handOver' && v.lastHand && (
        <section className="pp-result" data-testid="pp-hand-result" aria-live="assertive">
          <h2>{handResultText(v, mySeat, names)}</h2>
          <ol className="pp-result-scores">
            {Array.from({ length: n }, (_, i) => (
              <li key={i} className={i === v.lastHand!.winner ? 'won' : ''}><span>{who(i, mySeat, names)}</span><b>{pts(v.points[i] ?? 0)}</b>{v.coinPot && <small>{(v.lastHand!.deltas[i] ?? 0) > 0 ? '+' : ''}{v.lastHand!.deltas[i] ?? 0}c</small>}</li>
            ))}
          </ol>
          {next ? <button type="button" className="pp-move pp-primary" data-testid="pp-next-hand" disabled={busy} onClick={() => onMove(next)}>Next hand</button>
            : <p className="pp-wait">Waiting for {who(v.turn ?? 0, mySeat, names)} to deal…</p>}
        </section>
      )}
      <p className="turn-line" data-testid="turn-line">{turnLine}</p>
      {buttons.length > 0 && (
        <div className="pp-actions" data-testid="pp-actions">
          {buttons.map((m, i) => (
            <button key={i} type="button" className={`pp-move${m.t === 'pair' || m.t === 'steal' ? ' pp-primary' : ''}`} data-testid={`pp-${m.t}${'cardIds' in m ? `-${m.cardIds.join('-')}` : ''}`} disabled={busy} onClick={() => onMove(m)}>
              {moveLabel(m, v, hand)}
            </button>
          ))}
        </div>
      )}
      {mySeat !== null && (
        <div className="my-hand pp-hand" data-testid="my-hand">
          {v.hand.map((c) => (
            <span key={c.id} className="pp-card-slot">
              <PlainCard card={c} testid={`pp-card-${c.id}`} disabled={busy || !shed.has(c.id)} onClick={shed.has(c.id) ? () => onMove({ t: 'discard', cardId: c.id } satisfies PpMove) : undefined} />
              {isWild(c, v) && <em className="pp-wild">WILD</em>}
            </span>
          ))}
          {v.hand.length === 0 && v.phase !== 'over' && <p className="trick-empty">No cards</p>}
        </div>
      )}
    </div>
  );
}

export function PittyPatRecap({ results, names, mySeat }: ModeRecapProps) {
  const r = (results.recap ?? {}) as Partial<PpRecap>;
  const points = r.points ?? r.wins ?? [];
  const coins = r.coinPot === true;
  const top = results.placements[0]!;
  const tie = results.placements.length > 1 && (points[top] ?? 0) === (points[results.placements[1]!] ?? 0) && (!coins || (r.chips?.[top] ?? 0) === (r.chips?.[results.placements[1]!] ?? 0));
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
              <small>{r.pairs?.[s] ?? 0} pairs{coins ? ` · ${r.chips?.[s] ?? 0}c` : ''}</small>
              <b data-testid={`recap-points-${s}`}>{pts(points[s] ?? 0)}</b>
              {coins && <b className={d > 0 ? 'up' : d < 0 ? 'down' : ''}>{d > 0 ? `+${d}` : d}c</b>}
            </li>
          );
        })}
      </ol>
      <p className="pp-recap-meta">{hands.length} hand{hands.length === 1 ? '' : 's'} · {r.dealtWins ?? 0} won on the deal</p>
      <ol className="pp-hands" data-testid="pp-recap-hands" aria-label="Hand by hand">
        {hands.map((h) => (
          <li key={h.n}><span>Hand {h.n + 1}</span><span>{h.winner === null ? 'Void' : `${who(h.winner, mySeat, names)}${h.how === 'dealt' ? ' · on the deal' : ''}`}</span>{coins && <small>pot {h.pot}c</small>}</li>
        ))}
      </ol>
    </div>
  );
}
