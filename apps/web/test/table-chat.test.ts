/** @vitest-environment happy-dom */
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { defaultChoice } from '../src/modes/catalog';
import { localResults, localToAct, localView, newLocalGame } from '../src/modes/localGame';
import type { RoomInfo } from '@pp/protocol';
import OnlineModeTable from '../src/online/OnlineModeTable';
import type { ConnState, TableConnection } from '../src/online/connection';
import { openTableModeName } from '../src/offeredModes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function state(spectator: boolean): ConnState {
  const c = defaultChoice('placeholder');
  const g = newLocalGame(c.modeId, c.options, 2, 'seed');
  const room = { code: 'ABCDE', hostId: 'h', phase: 'playing', rules: { playerCount: 2, turnTimerSec: 30 }, seats: [{ kind: 'human', name: 'Host' }, { kind: 'bot', name: 'Pop' }], spectators: [{ playerId: 'w', name: 'Watcher' }], modeId: 'placeholder' } as unknown as RoomInfo;
  return {
    status: 'open', you: spectator ? 'w' : 'h', room, seat: spectator ? null : 0, spectator,
    mode: { modeId: 'placeholder', view: localView(g, 0), toAct: localToAct(g), legal: [], results: localResults(g) } as never,
    chat: [{ id: 1, from: 'h', name: 'Host', text: 'gl' }, { id: 2, from: 'w', name: 'Watcher', text: 'go!', spectator: true }] as never,
    error: null, statsOff: false, joinFault: null,
  };
}

describe('registry table chat (milestone 4)', () => {
  it('the mode table has a chat tab; the drawer shows players and tagged spectators, and sends chat', async () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }) });
    const send = vi.fn();
    const el = document.createElement('div'); document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(createElement(OnlineModeTable, { conn: { send, sendMove: vi.fn() } as unknown as TableConnection, cs: state(false), onLobby() {}, onLeave() {} })); });
    expect(el.querySelector('[data-testid="mode-status"], .mode-status')!.textContent).toContain('👁 1');
    const tab = el.querySelector('[data-testid="table-chat-tab"]') as HTMLButtonElement;
    await act(async () => { tab.click(); });
    const chat = document.querySelector('[data-testid="lobby-chat"]')!;
    expect(chat.className).toContain('open');
    expect(chat.textContent).toContain('go!');
    expect(chat.querySelectorAll('[data-testid="chat-watching"]')).toHaveLength(1);
    const input = chat.querySelector('input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(input, 'hi table'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (chat.querySelector('form') as HTMLFormElement).requestSubmit(); });
    expect(send).toHaveBeenCalledWith({ t: 'chat', text: 'hi table' });
    await act(async () => { root.unmount(); }); el.remove();
  });

  it('open tables name registry modes', () => {
    expect(openTableModeName({ mode: 'placeholder' })).toBe('High Card');
  });
});
