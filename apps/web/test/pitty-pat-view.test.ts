/** M7b: Pitty Pat table + recap. Points are the main score; coins only with the coin pot; deuces flagged wild; Next hand on pause. */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { type PpState, type PpView, pittyPatRules as R } from '@pp/game';
import { botToAct, localApply, localBotMove, localLegal, localResults, localToAct, localView, newLocalGame } from '../src/modes/localGame';
import { ModeScreen } from '../src/modes/ModeScreen';

const names = ['You', 'Ana', 'Bo', 'Cy'];
const screen = (g: ReturnType<typeof newLocalGame>, seat: number | null = 0) => renderToStaticMarkup(createElement(ModeScreen, {
  modeId: 'pitty-pat', view: localView(g, seat ?? 'spectator'), legal: seat === null ? [] : localLegal(g, seat), toAct: localToAct(g), results: localResults(g), mySeat: seat, names, onMove: () => {}, onLeave: () => {},
}));

/** The human (seat 0) plays its first legal move; bots play theirs. */
function playOut(options: Record<string, unknown>, seed: string, stopAt?: (g: ReturnType<typeof newLocalGame>) => boolean) {
  let g = newLocalGame('pitty-pat', options, 4, seed);
  for (let i = 0; i < 20000 && !localResults(g).done; i++) {
    if (stopAt?.(g)) return g;
    const bot = botToAct(g);
    g = bot !== null ? localBotMove(g, bot) : localApply(g, 0, localLegal(g, 0)[0]);
  }
  return g;
}

describe('Pitty Pat table', () => {
  it('shows points as "n / target", the goal, upcard, stock, card counts; no coins without the pot', () => {
    const g = newLocalGame('pitty-pat', { targetPoints: 3, dealtWinAuto: false }, 4, 'v1');
    const html = screen(g);
    expect(html).toContain('First to 3 points');
    expect(html).toMatch(/data-testid="pp-points-0"><b>0<\/b><small> \/ 3<\/small>/);
    expect(html).toContain('data-testid="pp-upcard"');
    expect(html).toContain('5 cards');
    expect(html).not.toContain('data-testid="pp-pot"');
    expect(html).not.toMatch(/\d+c</);
    const coins = screen(newLocalGame('pitty-pat', { coinPot: true, dealtWinAuto: false }, 4, 'v1'));
    expect(coins).toContain('data-testid="pp-pot"');
    expect(coins).toMatch(/9c/);
  });
  it('never shows another seat\'s cards', () => {
    const g = newLocalGame('pitty-pat', { dealtWinAuto: false }, 4, 'v2');
    const html = screen(g);
    const st = g.state as PpState;
    for (const c of st.hands[1]!) expect(html).not.toContain(`pp-card-${c.id}"`);
    const spect = screen(g, null);
    expect(spect).not.toContain('pp-card-');
  });
  it('move controls: pair / flip / pass buttons and tappable shed cards come from the legal list; deuces flagged WILD', () => {
    let found: ReturnType<typeof newLocalGame> | null = null;
    for (let i = 0; i < 400 && !found; i++) {
      const g = newLocalGame('pitty-pat', { dealtWinAuto: false }, 4, `m${i}`);
      const v = localView(g, 0) as PpView;
      if (localToAct(g)[0] === 0 && v.hand.some((c) => c.rank === 2)) found = g;
    }
    expect(found).not.toBeNull();
    const html = screen(found!);
    expect(html).toContain('WILD');
    expect(html).toContain('data-testid="pp-actions"');
    for (const m of localLegal(found!, 0) as { t: string; cardIds?: string[] }[]) {
      if (m.t === 'pair') expect(html).toContain(`data-testid="pp-pair-${m.cardIds!.join('-')}"`);
      if (m.t === 'flip') expect(html).toContain('data-testid="pp-flip"');
    }
  });
  it('pauseBetweenHands: hand result + Next hand for the dealer, a wait line for everyone else', () => {
    const g = playOut({ pauseBetweenHands: true, targetPoints: 5 }, 'p1', (x) => (x.state as PpState).phase === 'handOver');
    const st = g.state as PpState;
    expect(st.phase).toBe('handOver');
    const ack = st.ackSeat!;
    const forAck = renderToStaticMarkup(createElement(ModeScreen, { modeId: 'pitty-pat', view: R.view(st, ack), legal: R.legalMoves(st, ack), toAct: [ack], results: R.results(st), mySeat: ack, names, onMove: () => {}, onLeave: () => {} }));
    expect(forAck).toContain('data-testid="pp-hand-result"');
    expect(forAck).toContain('+1 point');
    expect(forAck).toContain('data-testid="pp-next-hand"');
    const other = (ack + 1) % 4;
    const forOther = renderToStaticMarkup(createElement(ModeScreen, { modeId: 'pitty-pat', view: R.view(st, other), legal: R.legalMoves(st, other), toAct: [ack], results: R.results(st), mySeat: other, names, onMove: () => {}, onLeave: () => {} }));
    expect(forOther).toContain('data-testid="pp-hand-result"');
    expect(forOther).not.toContain('data-testid="pp-next-hand"');
    expect(forOther).toContain('Waiting for');
  });
});

describe('Pitty Pat recap', () => {
  it('points standings, hand by hand, pairs, dealt wins; coins hidden without the pot', () => {
    const g = playOut({ targetPoints: 3 }, 'r1');
    expect(localResults(g).done).toBe(true);
    const st = g.state as PpState;
    const html = screen(g);
    expect(html).toContain('data-testid="mode-recap"');
    const top = localResults(g).placements[0]!;
    expect(st.wins[top]).toBe(3);
    expect(html).toContain(`data-testid="recap-points-${top}">3 pts`);
    expect(html).toContain('data-testid="pp-recap-hands"');
    expect(html).toContain('won on the deal');
    expect(html).not.toMatch(/[+-]?\d+c</);
    const withCoins = screen(playOut({ targetPoints: 2, coinPot: true }, 'r2'));
    expect(withCoins).toMatch(/\d+c</);
  });
});
