/**
 * @vitest-environment happy-dom
 *
 * COLLAPSIBLE SETTINGS SECTIONS + HOUSE RULES FIRST (owner, 2026-10-23):
 * "The game setting sections should be collapsible given some people only
 * want to change the house rules. (Should be at top)"
 *
 * Pins: House rules is the first group and the only one open on a fresh
 * device; every group header toggles its group (bodies stay MOUNTED —
 * folding is presentation, so a folded group's controls remain in the DOM
 * and keep their state); a player's arrangement persists per device under
 * bwm.settingsSections.v1 and is honored on the next open; a targeted entry
 * (the speaker's initialSection="sound") forces its group open for that
 * open WITHOUT rewriting the stored arrangement, until the player toggles
 * it themselves; reduced motion makes the fold instant (CSS pin).
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../src/styles.css');

let root: Root | null = null;
let el: HTMLDivElement | null = null;

function unmount() {
  if (root) act(() => root!.unmount());
  root = null;
  el?.remove();
  el = null;
}

afterEach(() => {
  unmount();
  localStorage.clear();
  sessionStorage.clear();
});

async function renderSheet(extra: Record<string, unknown> = {}) {
  const { default: MoreOptions } = await import('../src/MoreOptions');
  const { DEFAULT_SETTINGS } = await import('../src/settings');
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  const props = {
    settings: DEFAULT_SETTINGS,
    onChange: () => {},
    tips: { on: false, asked: true },
    onTips: () => {},
    onClose: () => {},
    ...extra,
  };
  await act(async () => {
    root!.render(createElement(MoreOptions, props));
  });
  return { c: el, props };
}

const group = (c: HTMLElement, label: string) => c.querySelector(`.set-group[aria-label="${label}"]`)!;
const toggleOf = (g: Element) => g.querySelector('button.set-group-toggle') as HTMLButtonElement;
const bodyOf = (g: Element) => g.querySelector('.set-group-body')!;
const isOpen = (g: Element) => toggleOf(g).getAttribute('aria-expanded') === 'true' && bodyOf(g).classList.contains('open');

async function click(btn: HTMLButtonElement) {
  await act(async () => {
    btn.click();
  });
}

const storedMap = () => JSON.parse(localStorage.getItem('bwm.settingsSections.v1') ?? 'null');



describe('targeted entry (the speaker lands on Sound & music)', () => {
  it('forces Sound open for that open without rewriting the stored arrangement', async () => {
    localStorage.setItem('bwm.settingsSections.v1', JSON.stringify({ house: true, play: false, sound: false, look: false, beta: false }));
    const spy = vi.fn();
    (window.HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView = spy;
    const { c } = await renderSheet({ initialSection: 'sound', anchorSeq: 1 });
    expect(isOpen(group(c, 'Sound & music'))).toBe(true);
    expect(spy).toHaveBeenCalled();
    // the stored map still says sound is folded — the landing rewrote nothing
    expect(storedMap()).toEqual({ house: true, play: false, sound: false, look: false, beta: false });
  });

  it('a manual toggle of the forced group takes over and persists', async () => {
    const { c } = await renderSheet({ initialSection: 'sound', anchorSeq: 1 });
    expect(isOpen(group(c, 'Sound & music'))).toBe(true);
    await click(toggleOf(group(c, 'Sound & music')));
    expect(isOpen(group(c, 'Sound & music'))).toBe(false);
    expect(storedMap()?.sound).toBe(false);
  });
});

describe('fold mechanics', () => {
  it('the fold animates on the grid-rows track and reduced motion makes it instant', () => {
    const tail = css.slice(css.indexOf('Collapsible Settings sections'));
    expect(tail).toContain('.set-group-body { display: grid; grid-template-rows: 0fr;');
    expect(tail).toContain('.set-group-body.open { grid-template-rows: 1fr;');
    const reduced = tail.slice(tail.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('.set-group-body, .set-group-body.open { transition: none; }');
    expect(reduced).toContain('.set-chev { transition: none; }');
  });
});
