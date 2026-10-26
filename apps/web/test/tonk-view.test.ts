/** M9b: Tonk table + recap. Points main score; coins only with stakes; wild badges; spreads/hits/slap controls; Next hand on pause. */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TkMove, TkView } from '@pp/game';
import { botToAct, localApply, localBotMove, localLegal, localResults, localToAct, localView, newLocalGame } from '../src/modes/localGame';
import { ModeScreen } from '../src/modes/ModeScreen';

type G = ReturnType<typeof newLocalGame>;
const names = ['You', 'Ana', 'Bo', 'Cy'];
const screen = (g: G, seat: number | null = 0) => renderToStaticMarkup(createElement(ModeScreen, {
  modeId: 'tonk', view: localView(g, seat ?? 'spectator'), legal: seat === null ? [] : localLegal(g, seat), toAct: localToAct(g), results: localResults(g), mySeat: seat, names, onMove: () => {}, onLeave: () => {},
}));
/** Seat 0 draws from the stock, spreads, hits, else sheds; bots play their tier. */
function playOut(options: Record<string, unknown>, seed: string, stopAt?: (g: G) => boolean, seats = 4) {
  let g = newLocalGame('tonk', options, seats, seed);
  for (let i = 0; i < 50000 && !localResults(g).done; i++) {
    if (stopAt?.(g)) return g;
    const bot = botToAct(g);
    if (bot !== null) { g = localBotMove(g, bot); continue; }
    const legal = localLegal(g, 0) as TkMove[];
    g = localApply(g, 0, ['nextHand', 'spread', 'hit', 'drawStock', 'waive'].map((t) => legal.find((m) => m.t === t)).find(Boolean) ?? legal.find((m) => m.t !== 'drop') ?? legal[0]);
  }
  return g;
}
const view0 = (g: G) => localView(g, 0) as TkView;

describe('Tonk table', () => {
  it('points as "n / target", goal, discard + stock, card counts; no coins without stakes', () => {
    const g = newLocalGame('tonk', { gameTarget: 6 }, 4, 't1');
    const html = screen(g);
    expect(html).toContain('First to 6 points');
    expect(html).toMatch(/data-testid="tk-points-0"><b>0 pts<\/b><small> \/ 6<\/small>/);
    expect(html).toContain('data-testid="tk-stock"');
    expect(html).not.toContain('tk-stake');
    expect(screen(newLocalGame('tonk', { coinStakes: true, stake: 3 }, 4, 't1'))).toContain('3c / pt');
  });
  it('never shows another seat\'s cards; spectators see no hand', () => {
    const g = playOut({}, 't2', (x) => view0(x).spreads.length > 0 && localToAct(x)[0] === 0);
    const v = view0(g);
    const html = screen(g);
    for (const c of v.hand) expect(html).toContain(`tk-card-${c.id}`);
    const others = (localView(g, 1) as TkView).hand;
    for (const c of others) expect(html).not.toContain(`tk-card-${c.id}`);
    expect(screen(g, null)).not.toContain('data-testid="my-hand"');
  });
  it('draw/drop controls at turn start; spread buttons when a meld is in hand; wild badges', () => {
    const g = playOut({ wilds: 'jokers' }, 't3', (x) => localToAct(x)[0] === 0 && (localLegal(x, 0) as TkMove[]).some((m) => m.t === 'spread'));
    const html = screen(g);
    expect(html).toMatch(/data-testid="tk-spread-[^"]+"/);
    const start = screen(newLocalGame('tonk', {}, 2, 't3b'));
    expect(start).toMatch(/tk-drawStock|Waiting|turn/);
    const wild = playOut({ wilds: 'jokers' }, 't3c', (x) => view0(x).hand.some((c) => c.rank === 0));
    if (view0(wild).hand.some((c) => c.rank === 0)) expect(screen(wild)).toContain('WILD');
  });
  it('slap window: slap and let-it-go buttons', () => {
    const g = playOut({ slap: true }, 't4', (x) => localToAct(x)[0] === 0 && (localLegal(x, 0) as TkMove[]).some((m) => m.t === 'slap'));
    if ((localLegal(g, 0) as TkMove[]).some((m) => m.t === 'slap')) {
      const html = screen(g);
      expect(html).toMatch(/tk-slap-\d+/);
      expect(html).toContain('Let it go');
    }
  });
  it('pauseBetweenHands: hand result panel with points; Next hand for the dealer-to-be, waiting for others', () => {
    const g = playOut({ pauseBetweenHands: true }, 't5', (x) => view0(x).phase === 'handOver');
    const v = view0(g);
    expect(v.phase).toBe('handOver');
    const html = screen(g);
    expect(html).toContain('data-testid="tk-hand-result"');
    const ack = localToAct(g)[0]!;
    expect(screen(g, ack)).toContain('Next hand');
    const other = [0, 1, 2, 3].find((s) => s !== ack)!;
    expect(screen(g, other)).toContain('Waiting for');
  });
});

describe('Tonk recap', () => {
  it('points standings, hand-by-hand endings, tonk/drop/caught counts; coins only with stakes', () => {
    const g = playOut({ gameTarget: 3 }, 't6');
    expect(localResults(g).done).toBe(true);
    const html = screen(g);
    expect(html).toContain('data-testid="mode-recap"');
    expect(html).toMatch(/recap-points-\d/);
    expect(html).toContain('data-testid="tk-recap-hands"');
    expect(html).toMatch(/tonk · \d+ drops? · caught \d+×/);
    expect(html).not.toMatch(/[+-]?\d+c</);
    const c = playOut({ gameTarget: 3, coinStakes: true, stake: 2 }, 't6');
    expect(screen(c)).toMatch(/-?\d+c</);
  });
});
