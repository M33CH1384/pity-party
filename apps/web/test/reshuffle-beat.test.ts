// @vitest-environment happy-dom
/** Demetrius 2026-10-26: "Collecting and reshuffling…" beat after Next hand; display only, skipped under reduced motion. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RESHUFFLE_MS, ReshuffleBeat, useReshuffleBeat } from '../src/modes/reshuffle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function Probe({ phase }: { phase: string }) { return createElement(ReshuffleBeat, { on: useReshuffleBeat(phase) }); }

function mount() {
  const el = document.createElement('div');
  const root = createRoot(el);
  return { el, set: (phase: string) => act(() => { root.render(createElement(Probe, { phase })); }) };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('reshuffle beat', () => {
  it('shows after handOver → next deal, for RESHUFFLE_MS, even if play moves on meanwhile', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const m = mount();
    m.set('start'); expect(m.el.textContent).toBe('');
    m.set('handOver'); expect(m.el.textContent).toBe('');
    m.set('start'); expect(m.el.textContent).toContain('Collecting and reshuffling');
    m.set('meld'); // bots keep playing: the beat still clears on time
    act(() => { vi.advanceTimersByTime(RESHUFFLE_MS + 10); });
    expect(m.el.textContent).toBe('');
    m.set('handOver'); m.set('over'); expect(m.el.textContent).toBe('');
  });
  it('skipped under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const m = mount();
    m.set('handOver'); m.set('start');
    expect(m.el.textContent).toBe('');
  });
});
