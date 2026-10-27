/** Card options (V3): suit colours "4-colour" (default) or "Classic" (black/red) — Desi (c). Device-local, `pp.cards.v1`. */
import { useSyncExternalStore } from 'react';
import type { SuitMode } from './cardArt';

export const CARDS_KEY = 'pp.cards.v1';
export function parseCardPrefs(raw: string | null): { suits: SuitMode } {
  try { const j = raw ? (JSON.parse(raw) as { suits?: unknown }) : null; if (j?.suits === 'classic') return { suits: 'classic' }; } catch { /* corrupt */ }
  return { suits: 'four' };
}
let prefs = (() => { try { return parseCardPrefs(localStorage.getItem(CARDS_KEY)); } catch { return { suits: 'four' as SuitMode }; } })();
const ls = new Set<() => void>();
export const cardPrefs = {
  get: () => prefs,
  set(p: { suits: SuitMode }) { prefs = p; try { localStorage.setItem(CARDS_KEY, JSON.stringify(p)); } catch { /* ignore */ } ls.forEach((f) => f()); },
  subscribe(f: () => void) { ls.add(f); return () => { ls.delete(f); }; },
};
export const useCardPrefs = () => useSyncExternalStore(cardPrefs.subscribe, cardPrefs.get, cardPrefs.get);
