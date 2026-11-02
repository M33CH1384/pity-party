/**
 * V10h part 1 gestures on the posed DOM hand (HAND-SPEC §D/§F1/§F3). The DOM slots stay the input + a11y layer: a tap is
 * still the native button click (tap-to-lift / tap targets / the action buttons are unchanged), and every gesture ends
 * in the SAME existing action a tap would take (the card's own discard click, or Tonk's pick + "Discard" button).
 *  - drag a hand card: it follows the finger (DOM slot + its 3D card, via `dragOffsets`)
 *  - flick up (≥ 900 px/s, ≥ 40 px) on a card you may discard → discard; the 3D flight keeps the release velocity
 *  - weak / illegal flick → springs back in ~280 ms (reduced motion: snaps back)
 *  - the 3D stock gets a ≥ 44 px tap box (PPTable3D) that presses the existing Flip / Draw button
 * Classification and physics are pure (./physics); this file only wires pointer events.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { classifyRelease, type PointerSample } from './physics/gesture';
import { SPRING_MS, springBack } from './physics/flight';

/** per hand index: the finger offset (px) HandFan applies to the drawn card */
export const dragOffsets = new Map<number, { dx: number; dy: number }>();
let lastFlick: { v: { x: number; y: number }; at: number } | null = null;
/** the release velocity of the flick that just discarded (consumed once by the table flight, valid 2 s) */
export function takeFlick(): { x: number; y: number } | null { const f = lastFlick; lastFlick = null; return f && performance.now() - f.at < 2000 ? f.v : null; }
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let redraw: () => void = () => {};
export function onDragFrame(fn: () => void) { redraw = fn; }

/** the 3D stock's screen centre (px), published by PPTable3D after each layout */
let stockAt: { x: number; y: number } | null = null; let stockSub: (() => void) | null = null;
export function setStockScreen(p: { x: number; y: number } | null) { stockAt = p; stockSub?.(); }
/** tap the deck: press the existing Flip (Pitty Pat) / Draw from stock (Tonk) button, same action as tapping it */
function pressStock(): boolean {
  const b = document.querySelector<HTMLButtonElement>('[data-testid="pp-flip"]:not([disabled]), [data-testid="tk-drawStock"]:not([disabled])');
  if (!b) return false; b.click(); coachDone(); return true;
}

const COACH_KEY = 'pp.coach.v10h';
export function coachDone() { try { localStorage.setItem(COACH_KEY, 'done'); } catch { /* private mode */ } window.dispatchEvent(new Event('pp-coach-done')); }

/** press the existing discard action for this slot's card (same path as a tap) */
function discardVia(slot: HTMLElement): boolean {
  const btn = slot.querySelector<HTMLButtonElement>('button:not([disabled])'); if (!btn) return false;
  if (slot.dataset.discard === 'self') { btn.click(); return true; }
  if (slot.dataset.discard === 'pick') {
    const press = () => { const d = document.querySelector<HTMLButtonElement>('[data-testid="tk-discard-btn"]:not([disabled])'); if (d) d.click(); };
    if (slot.classList.contains('tk-picked')) press(); else { btn.click(); requestAnimationFrame(() => requestAnimationFrame(press)); }
    return true;
  }
  return false;
}

export function HandGestures({ root }: { root: HTMLElement | null }) {
  const [coach, setCoach] = useState(false);
  useEffect(() => {
    if (!root) return undefined;
    let st: { slot: HTMLElement; idx: number; id: number; s: PointerSample[] } | null = null;
    let swallow = false;
    const setOff = (slot: HTMLElement, idx: number, dx: number, dy: number) => {
      if (dx === 0 && dy === 0) { slot.style.removeProperty('translate'); dragOffsets.delete(idx); } else { slot.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`; dragOffsets.set(idx, { dx, dy }); }
      redraw();
    };
    const spring = (slot: HTMLElement, idx: number, dx: number, dy: number) => {
      if (reduced()) { setOff(slot, idx, 0, 0); return; }
      const t0 = performance.now();
      const step = () => { const ms = performance.now() - t0; const k = ms >= SPRING_MS + 120 ? 0 : springBack(ms); setOff(slot, idx, dx * k, dy * k); if (k !== 0) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || st) return;
      if ((e.target as HTMLElement).closest('.t3d-stock-hit')) { e.preventDefault(); pressStock(); return; } // tap the deck: acts on touch-down
      const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-testid="my-hand"].is-posed .pp-card-slot'); if (!slot) return;
      const slots = [...slot.parentElement!.querySelectorAll<HTMLElement>('.pp-card-slot')];
      st = { slot, idx: slots.indexOf(slot), id: e.pointerId, s: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
    };
    const move = (e: PointerEvent) => {
      if (!st || e.pointerId !== st.id) return;
      st.s.push({ x: e.clientX, y: e.clientY, t: e.timeStamp }); if (st.s.length > 40) st.s.shift();
      const a = st.s[0]!; const dx = e.clientX - a.x, dy = e.clientY - a.y;
      if (Math.hypot(dx, dy) >= 10) { try { st.slot.setPointerCapture(e.pointerId); } catch { /* gone */ } setOff(st.slot, st.idx, dx, dy); }
    };
    const up = (e: PointerEvent) => {
      if (!st || e.pointerId !== st.id) return;
      const cur = st; st = null;
      cur.s.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      const r = classifyRelease(cur.s);
      (window as unknown as { __ppGesture?: unknown }).__ppGesture = { kind: r.kind, vy: Math.round(r.v.y), travel: Math.round(r.travel), discard: cur.slot.dataset.discard ?? null };
      if (r.kind === 'tap') { setOff(cur.slot, cur.idx, 0, 0); return; } // the native click does the tap action
      swallow = true; window.setTimeout(() => { swallow = false; }, 400);
      const a = cur.s[0]!, dx = e.clientX - a.x, dy = e.clientY - a.y;
      if (r.kind === 'flick' && cur.slot.dataset.discard) {
        lastFlick = { v: r.v, at: performance.now() };
        setOff(cur.slot, cur.idx, 0, 0);
        if (discardVia(cur.slot)) { coachDone(); return; }
      }
      spring(cur.slot, cur.idx, dx, dy);
    };
    const cancel = (e: PointerEvent) => { if (st && e.pointerId === st.id) { const c = st; st = null; const a = c.s[0]!, b = c.s[c.s.length - 1]!; spring(c.slot, c.idx, b.x - a.x, b.y - a.y); } };
    // a drag / flick must not also fire the card's tap action (programmatic clicks are not trusted, so they pass)
    const click = (e: MouseEvent) => { if (swallow && e.isTrusted && (e.target as HTMLElement).closest('.pp-card-slot')) { e.stopPropagation(); e.preventDefault(); swallow = false; } };
    root.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    root.addEventListener('click', click, true);
    return () => { root.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); root.removeEventListener('click', click, true); dragOffsets.clear(); };
  }, [root]);

  // coach hint: shown on the first games (until the first successful flick / stock tap), 3 s, never over the cards
  useEffect(() => {
    let done = false; try { done = localStorage.getItem(COACH_KEY) === 'done'; } catch { /* */ }
    if (done) return undefined;
    setCoach(true);
    const t = window.setTimeout(() => setCoach(false), 3000);
    const off = () => setCoach(false); window.addEventListener('pp-coach-done', off);
    return () => { window.clearTimeout(t); window.removeEventListener('pp-coach-done', off); };
  }, []);
  const [stock, setStock] = useState(stockAt);
  const [canFlip, setCanFlip] = useState(false);
  useEffect(() => { stockSub = () => setStock(stockAt); setStock(stockAt); return () => { stockSub = null; }; }, []);
  useEffect(() => {
    if (!root) return undefined;
    const check = () => setCanFlip(!!root.querySelector('[data-testid="pp-flip"]:not([disabled]), [data-testid="tk-drawStock"]:not([disabled])'));
    const mo = new MutationObserver(check); mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] }); check();
    return () => mo.disconnect();
  }, [root]);
  if (!root) return null;
  return createPortal(
    <>
      {stock && canFlip && (
        // pointer-only shortcut: the labelled Flip / Draw button stays the accessible control
        <button type="button" className="t3d-stock-hit" data-testid="stock-hit" tabIndex={-1} aria-hidden="true" style={{ left: `${stock.x}px`, top: `${stock.y}px` }} />
      )}
      {coach && <div className="t3d-coach" role="status" data-testid="gesture-coach">Tap a card to play · Flick up to discard · Tap the deck to flip</div>}
    </>,
    root,
  );
}
