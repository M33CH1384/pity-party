/**
 * Milestone 3a start screens: Home → Who are you playing? → Your table (Game card + Deal me in).
 * No Spades doors, house rules, deck, venue or team-name steps remain.
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../src/App';
import { modeSummary } from '../src/Setup';
import { defaultChoice } from '../src/modes/catalog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let el: HTMLDivElement;
const $ = (id: string) => document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
const click = async (id: string) => { const b = $(id); if (!b) throw new Error(`missing ${id}`); await act(async () => { b.click(); }); };

describe('start screens', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('bwm.entryGuest', '1');
    history.replaceState(null, '', '/');
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => { act(() => root.unmount()); el.remove(); });

  it('home has PLAY and no Spades copy; PLAY goes straight to the opponent step', async () => {
    await act(async () => { root.render(createElement(App)); });
    expect($('play')).not.toBeNull();
    expect(document.body.textContent).toContain('Pity Party');
    expect(document.body.textContent).not.toMatch(/spades/i);
    await click('play');
    expect($('play-bots')).not.toBeNull();
    expect($('play-online')).not.toBeNull();
    expect($('door-team')).toBeNull();
  });

  it('vs bots: the table step is the Game card + Deal me in, which opens the picked mode', async () => {
    await act(async () => { root.render(createElement(App)); });
    await click('play');
    await click('play-bots');
    expect($('mode-setup')).not.toBeNull();
    for (const gone of ['house-rules', 'venue-row', 'setup-team-name', 'rules-stats']) expect($(gone)).toBeNull();
    expect($('setup-bar-summary')!.textContent).toBe('High Card · 2–4 players · Default rules');
    await click('start-bots');
    expect(document.querySelector('[data-testid="mode-screen"]')?.getAttribute('data-mode')).toBe('placeholder');
    await click('mode-leave');
    expect($('play')).not.toBeNull();
  });

  it('online: lobby first, the create form carries the Game card', async () => {
    await act(async () => { root.render(createElement(App)); });
    await click('play');
    await click('play-online');
    expect($('create-open')).not.toBeNull();
    expect($('mode-setup')).toBeNull();
    await click('create-open');
    expect($('mode-setup')).not.toBeNull();
    expect($('create-table')).not.toBeNull();
  });

  it('summary counts options changed from the defaults', () => {
    const c = defaultChoice('placeholder');
    expect(modeSummary({ ...c, options: { handSize: 5 } })).toBe('High Card · 2–4 players · 1 option changed');
  });
});
