import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HcView } from '@pp/game';
import { defaultChoice } from '../src/modes/catalog';
import { botToAct, localApply, localBotMove, localLegal, localResults, localToAct, localView, newLocalGame } from '../src/modes/localGame';
import { ModeScreen } from '../src/modes/ModeScreen';
import { modeViews } from '../src/modes/views';
import { seatNames } from '../src/online/OnlineModeTable';

/** Plays a whole offline game the way LocalModeGame does: bots move on their turn, the human taps the first legal card. */
function playOut(seed: string) {
  const c = defaultChoice('placeholder');
  let g = newLocalGame(c.modeId, c.options, 4, seed);
  let humanMoves = 0;
  for (let i = 0; i < 100 && !localResults(g).done; i++) {
    const bot = botToAct(g);
    if (bot !== null) { g = localBotMove(g, bot); continue; }
    expect(localToAct(g)).toEqual([0]);
    g = localApply(g, 0, localLegal(g, 0)[0]);
    humanMoves++;
  }
  return { g, humanMoves };
}

describe('offline registry game (vs bots)', () => {
  it('plays to the end: 3 cards each, results zero-sum, deterministic per seed', () => {
    const a = playOut('s1');
    expect(a.humanMoves).toBe(3);
    const r = localResults(a.g);
    expect(r.done).toBe(true);
    expect(r.deltas.reduce((x, y) => x + y, 0)).toBe(0);
    expect(localResults(playOut('s1').g)).toEqual(r);
  });

  it('a bot never sees the human hand; the human view shows only their cards', () => {
    const c = defaultChoice('placeholder');
    const g = newLocalGame(c.modeId, c.options, 4, 'v');
    const v = localView(g, 0) as HcView;
    expect(v.hand).toHaveLength(3);
    expect(v.handSizes).toEqual([3, 3, 3, 3]);
    expect((localView(g, 'spectator') as HcView).hand).toEqual([]);
  });
});

describe('web mode views', () => {
  it('looks views up per mode; unknown modes get none', () => {
    expect(modeViews('placeholder')?.title).toBe('High Card');
    expect(modeViews('pitty-pat')).toBeNull();
  });

  it('table: only legal cards are tappable, turn line names the player', () => {
    const c = defaultChoice('placeholder');
    const g = newLocalGame(c.modeId, c.options, 4, 't');
    const html = renderToStaticMarkup(createElement(ModeScreen, { modeId: 'placeholder', view: localView(g, 0), legal: localLegal(g, 0), toAct: localToAct(g), results: localResults(g), mySeat: 0, names: ['You', 'A', 'B', 'C'], onMove: () => {}, onLeave: () => {} }));
    expect(html).toContain('data-my-turn="yes"');
    expect(html).toContain('Your turn');
    expect(html.match(/aria-label="Play [^"]+"/g)).toHaveLength(3);
    expect(html).not.toContain('mode-recap');
  });

  it('recap: winner line, rounds and coin changes, Play again', () => {
    const { g } = playOut('s1');
    const r = localResults(g);
    const names = ['You', 'Big Ray', 'Cuz', 'Unc'];
    const html = renderToStaticMarkup(createElement(ModeScreen, { modeId: 'placeholder', view: localView(g, 0), legal: [], toAct: [], results: r, mySeat: 0, names, onMove: () => {}, onLeave: () => {}, onAgain: () => {} }));
    expect(html).toContain('data-testid="mode-recap"');
    for (const s of r.placements) expect(html).toContain(`data-testid="placing-${s}"`);
    expect(html).toContain('coins');
    expect(html).toContain('Play again');
  });

  it('online seat names come from the room seats', () => {
    const room = { seats: [{ kind: 'human', name: 'Ann' }, { kind: 'bot', name: 'Cuz' }, { kind: 'empty' }] } as never;
    expect(seatNames(room)).toEqual(['Ann', 'Cuz', 'Seat 3']);
  });
});
