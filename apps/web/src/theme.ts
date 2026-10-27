/**
 * Theme preference (visual pass V1): four token sets from Desi's specs.
 *   A House Party Night · B Porch Daytime (light UI) · C Neon Lounge (DEFAULT) · K Classic BWM
 * Device-local, stored under a NEW key `pp.theme.v1`. The old key `bwm.theme.v1` came from BWM, where
 * "neon" meant Neon Royale: on first load it migrates once (neon → C, classic → K, nothing → C).
 *
 * Theming is token-driven: theme.css carries one `html[data-theme="X"]` block per theme. This store sets
 * the attribute (plus `data-fx="neon"` for C, which keeps the glass/glow layer) and the browser chrome
 * colour. public/theme-boot.js does the same before first paint (CSP-safe external script), so there is
 * no flash; `initTheme()` reconciles on boot. Keep THEME_COLORS + migration in step with theme-boot.js.
 */
import { useSyncExternalStore } from 'react';

export type ThemeName = 'A' | 'B' | 'C' | 'K';
export const THEMES: readonly ThemeName[] = ['C', 'A', 'B', 'K'];
export const DEFAULT_THEME: ThemeName = 'C';
export const THEME_LABELS: Record<ThemeName, string> = { A: 'House Party Night', B: 'Porch Daytime', C: 'Neon Lounge', K: 'Classic BWM' };

export const KEY = 'pp.theme.v1';
export const OLD_KEY = 'bwm.theme.v1';

/** Browser chrome colour per theme (each theme's --pp-bg). */
export const THEME_COLORS: Record<ThemeName, string> = { A: '#141233', B: '#F3E9DA', C: '#0C0C10', K: '#0C0712' };

const isTheme = (x: unknown): x is ThemeName => x === 'A' || x === 'B' || x === 'C' || x === 'K';

/** Stored value (new key) → theme, or null when absent/malformed/unknown. */
export function parseTheme(raw: string | null): ThemeName | null {
  try {
    if (raw) {
      const j = JSON.parse(raw) as { theme?: unknown } | null;
      if (j && isTheme(j.theme)) return j.theme;
    }
  } catch { /* corrupt */ }
  return null;
}

/** Old BWM key → theme: neon → C, classic → K, anything else (incl. absent) → C. */
export function migrateOld(raw: string | null): ThemeName {
  try {
    const j = raw ? (JSON.parse(raw) as { theme?: unknown } | null) : null;
    if (j?.theme === 'classic') return 'K';
  } catch { /* corrupt → default */ }
  return DEFAULT_THEME;
}

/** Resolve the theme from storage, migrating the old key once (the new key is written; the old one is left for BWM). */
export function resolveTheme(store: Pick<Storage, 'getItem' | 'setItem'> | null): ThemeName {
  if (!store) return DEFAULT_THEME;
  const cur = parseTheme(store.getItem(KEY));
  if (cur) return cur;
  const old = store.getItem(OLD_KEY);
  const t = migrateOld(old);
  if (old !== null) { try { store.setItem(KEY, JSON.stringify({ theme: t })); } catch { /* ignore */ } }
  return t;
}

function loadTheme(): ThemeName {
  try { return resolveTheme(localStorage); } catch { return DEFAULT_THEME; }
}

let current: ThemeName = loadTheme();
const listeners = new Set<() => void>();

/** Applies the theme to the document: `data-theme` (+ `data-fx` for C) and the theme-color meta. */
export function applyTheme(t: ThemeName): void {
  if (typeof document === 'undefined') return;
  const ds = document.documentElement.dataset;
  ds.theme = t;
  if (t === 'C') ds.fx = 'neon'; else delete ds.fx;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[t]);
}

export const themeStore = {
  get: (): ThemeName => current,
  set(t: ThemeName): void {
    current = t;
    try { localStorage.setItem(KEY, JSON.stringify({ theme: t })); } catch { /* ignore */ }
    applyTheme(t);
    listeners.forEach((f) => f());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};

/** Boot hook (main.tsx): reconcile the attribute/meta with the stored value. */
export function initTheme(): void { applyTheme(current); }

export function useTheme(): ThemeName {
  return useSyncExternalStore(themeStore.subscribe, themeStore.get, themeStore.get);
}

/** The glass/glow "neon" effects layer (ink background, reactive glow, ink transitions) belongs to Neon Lounge. */
export const isNeonFx = (t: ThemeName): boolean => t === 'C';
