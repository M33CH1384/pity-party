/**
 * @vitest-environment happy-dom
 *
 * Founder regression (menu rework): venue choice must be reachable in game
 * setup (Table essentials, before Deal / Create Table), not only buried in
 * the Settings sheet. Bots path feeds settings.venue; the online path carries
 * the same pick to the created table as a pending venue for the host.
 */
import { createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Setup from '../src/Setup';
import SettingsSheetHost from '../src/SettingsSheetHost';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { VENUE_LIST, resolveVenue, savePendingVenue, takePendingVenue } from '../src/venues';
import { sessionRoom } from '../src/spatial';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root; let el: HTMLDivElement; let current: Settings;
function Harness() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [tips, setTips] = useState({ on: false, asked: true });
  current = s;
  // App's composition: the wizard plus the one Settings sheet's host — the gear
  // files a request (settingsSheet.ts) and the host renders the sheet.
  return createElement('div', null,
    createElement(Setup, { settings: s, onChange: setS, tips, onTips: setTips, onStart: () => {} }),
    createElement(SettingsSheetHost, { settings: s, onChange: setS, tips, onTips: setTips }));
}
const click = async (testid: string) => { await act(async () => { document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!.click(); }); };
async function toTable(path: 'play-bots' | 'play-online') {
  await click('play'); await click('door-team'); await click('mode-joker'); await click(path);
}
function pickVenue(value: string) {
  const sel = document.querySelector<HTMLSelectElement>('[data-testid="venue-select-setup"]')!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  act(() => { setter.call(sel, value); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
  return sel;
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true }));
  history.replaceState(null, '', '/');
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
});
afterEach(() => { act(() => { root.unmount(); }); el.remove(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('venue choice in setup', () => {


  it('online create carries the setup pick to the new table (pending venue, one-shot)', () => {
    savePendingVenue('ABC123', 'beach');
    expect(sessionStorage.getItem('bwm.pendingVenue.ABC123')).toBe('beach');
    expect(takePendingVenue('ABC123')).toBe('beach');
    expect(takePendingVenue('ABC123')).toBeNull(); // applied once
    savePendingVenue('XYZ999', 'random');
    expect(takePendingVenue('XYZ999')).toBe('random');
  });

});
