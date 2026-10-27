/**
 * V10c: the 3D hand mirrors the DOM hand. The DOM hand stays the input layer (taps, the Tonk two-tap pick → hit /
 * discard, keyboard focus, screen-reader labels, e2e test ids), so every flow is unchanged; the 3D fan is drawn at
 * exactly the DOM cards' rects. Only cards the DOM already shows this seat are read (its OWN hand: the views never
 * render another seat's faces), so the 3D layer can't know a hidden card. First-load side: no three import.
 */
import { useEffect, useMemo, useState } from 'react';

export interface Rect { x: number; y: number; w: number; h: number }
export interface MirrorCard {
  key: string;
  /** the card's own text as the DOM prints it ("9♥", "10♣", "JK") */
  text: string;
  wild: boolean;
  rect: Rect;
  /** Tonk: picked for a hit (DOM lifts it 8px with an accent ring) */
  lifted: boolean;
  /** playable now (DOM outlines it) */
  live: boolean;
  /** greyed (not playable) */
  dim: boolean;
}

const SUITS: Record<string, 'S' | 'H' | 'D' | 'C'> = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };
const RANKS: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
/** "9♥" → { rank 9, suit H }; "JK" → joker. */
export function parseCardText(t: string): { rank: number; suit: 'S' | 'H' | 'D' | 'C' | null } | null {
  if (t === 'JK') return { rank: 0, suit: null };
  const suit = SUITS[t.slice(-1)];
  const r = t.slice(0, -1);
  const rank = RANKS[r] ?? (/^(10|[2-9])$/.test(r) ? Number(r) : NaN);
  if (!suit || !Number.isInteger(rank)) return null;
  return { rank, suit };
}

export function readHand(root: ParentNode): MirrorCard[] {
  const out: MirrorCard[] = [];
  root.querySelectorAll<HTMLElement>('[data-testid="my-hand"] .pcard[data-card]').forEach((el, i) => {
    const text = el.dataset.card ?? '';
    if (!parseCardText(text)) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const btn = el.closest('button');
    out.push({
      key: btn?.dataset.testid ?? `c${i}`, text, wild: el.classList.contains('is-wild'),
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      lifted: !!el.closest('.tk-picked'), live: !!btn && !btn.disabled, dim: !!btn && btn.disabled && !el.closest('.tk-picked'),
    });
  });
  return out;
}

const same = (a: MirrorCard[], b: MirrorCard[]) => a.length === b.length && a.every((c, i) => {
  const d = b[i]!; return c.key === d.key && c.text === d.text && c.lifted === d.lifted && c.live === d.live && c.dim === d.dim && c.wild === d.wild
    && Math.abs(c.rect.x - d.rect.x) < 0.5 && Math.abs(c.rect.y - d.rect.y) < 0.5 && Math.abs(c.rect.w - d.rect.w) < 0.5 && Math.abs(c.rect.h - d.rect.h) < 0.5;
});

/** Live mirror of the DOM hand under `root` (re-read on DOM changes, resize, scroll and transitions). */
export function useHandMirror(root: HTMLElement | null): MirrorCard[] {
  const [cards, setCards] = useState<MirrorCard[]>([]);
  useEffect(() => {
    if (!root) return;
    let raf = 0;
    const read = () => { raf = 0; const next = readHand(root); setCards((prev) => (same(prev, next) ? prev : next)); };
    const kick = () => { if (!raf) raf = requestAnimationFrame(read); };
    const mo = new MutationObserver(kick);
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'disabled', 'data-card'] });
    const ro = new ResizeObserver(kick); ro.observe(root);
    window.addEventListener('scroll', kick, true); window.addEventListener('resize', kick);
    root.addEventListener('transitionend', kick, true);
    kick();
    return () => { mo.disconnect(); ro.disconnect(); window.removeEventListener('scroll', kick, true); window.removeEventListener('resize', kick); root.removeEventListener('transitionend', kick, true); if (raf) cancelAnimationFrame(raf); };
  }, [root]);
  return cards;
}

/** V10d: the public Pitty Pat table snapshot (`data-t3d` on the mode table), parsed; null when absent. */
export interface TableSnap { n: number; me: number | null; turn: number | null; ph: string; up: [string, boolean] | null; st: number; hc: number[]; sh: string[][]; pt: number[]; tg: number | null; on: boolean[]; nm: string[]; ev: [string, number | null, number] | null }
export function useTableMirror(root: HTMLElement | null): TableSnap | null {
  const [raw, setRaw] = useState<string | null>(null);
  useEffect(() => {
    if (!root) return;
    const read = () => setRaw(root.querySelector<HTMLElement>('[data-t3d]')?.dataset.t3d ?? null);
    const mo = new MutationObserver(read);
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-t3d'] });
    read();
    return () => mo.disconnect();
  }, [root]);
  return useMemo(() => { try { return raw ? (JSON.parse(raw) as TableSnap) : null; } catch { return null; } }, [raw]);
}
