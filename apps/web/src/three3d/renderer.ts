/**
 * V10a: which table renderer to use, 3D or 2D. This file is on the first-load graph,
 * so it must never import three / @react-three (entry-graph.test.ts walks src/three3d/**).
 * The 2D views are always mounted; 3D is a layer under them that can drop out at any time.
 */
import { useSyncExternalStore } from 'react';
import { fx } from '../fx';

export type Renderer = '3d' | '2d';
export type TablePref = '3d' | '2d';
export type FailReason = 'context-lost' | 'timeout' | 'error';

export interface RendererInputs {
  /** `?table=2d` / `?table=3d` in the URL (tests, support) */
  query: Renderer | null;
  /** Settings "Table: 3D / 2D" */
  pref: TablePref;
  webgl2: boolean;
  /** WebGL2 only works with failIfMajorPerformanceCaveat off (software GPU) */
  majorCaveat: boolean;
  deviceMemory?: number;
  /** Settings "Reduce effects" */
  reduceEffects: boolean;
  /** OS prefers-reduced-motion */
  osReducedMotion: boolean;
  /** the 3D layer lost its context, errored or missed the 6 s first frame this session */
  failed: FailReason | null;
}

/** Pure decision. `?table=3d` still needs WebGL2; every other rule only ever picks 2D. */
export function decideRenderer(i: RendererInputs): Renderer {
  if (i.query === '2d') return '2d';
  if (!i.webgl2) return '2d';
  if (i.query === '3d') return '3d';
  if (i.failed) return '2d';
  if (i.pref === '2d') return '2d';
  if (i.majorCaveat) return '2d';
  if (i.deviceMemory !== undefined && i.deviceMemory <= 2) return '2d';
  if (i.reduceEffects || i.osReducedMotion) return '2d';
  return '3d';
}

/** One probe per page: WebGL2 with and without failIfMajorPerformanceCaveat. */
let probe: { webgl2: boolean; majorCaveat: boolean } | null = null;
export function probeWebGL(): { webgl2: boolean; majorCaveat: boolean } {
  if (probe) return probe;
  probe = { webgl2: false, majorCaveat: false };
  try {
    const get = (caveat: boolean) => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: caveat }) as WebGL2RenderingContext | null;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return !!gl;
    };
    if (get(true)) probe = { webgl2: true, majorCaveat: false };
    else if (get(false)) probe = { webgl2: true, majorCaveat: true };
  } catch { /* no WebGL */ }
  return probe;
}

const KEY = 'pp.table3d.v1';
const listeners = new Set<() => void>();
let pref: TablePref = (() => { try { return localStorage.getItem(KEY) === '2d' ? '2d' : '3d'; } catch { return '3d'; } })();
let failed: FailReason | null = null;
let version = 0;
const emit = () => { version++; listeners.forEach((f) => f()); };

export function getTablePref(): TablePref { return pref; }
export function setTablePref(p: TablePref): void {
  pref = p; failed = null;
  try { localStorage.setItem(KEY, p); } catch { /* ignore */ }
  emit();
}
/** The 3D layer calls this on context loss / error / 6 s first-frame timeout: the table drops to 2D for the session. */
export function markRendererFailed(r: FailReason): void { if (failed) return; failed = r; emit(); }
export function rendererFailure(): FailReason | null { return failed; }

function queryFlag(): Renderer | null {
  try { const q = new URLSearchParams(location.search).get('table'); return q === '2d' || q === '3d' ? q : null; } catch { return null; }
}
function osReduced(): boolean {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function currentRenderer(): Renderer {
  if (typeof window === 'undefined') return '2d';
  const g = probeWebGL();
  return decideRenderer({
    query: queryFlag(), pref, ...g,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    reduceEffects: fx.reduced, osReducedMotion: osReduced(), failed,
  });
}

function subscribe(f: () => void): () => void {
  listeners.add(f);
  const unPrefs = fx.subscribePrefs(f);
  const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
  mq?.addEventListener?.('change', f);
  return () => { listeners.delete(f); unPrefs(); mq?.removeEventListener?.('change', f); };
}

/** '3d' | '2d' for the table, live: Settings, Reduce effects, OS reduced motion and a 3D failure all re-decide. */
export function useTableRenderer(): Renderer {
  return useSyncExternalStore(subscribe, currentRenderer, () => '2d');
}
export function useTablePref(): TablePref {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => pref, () => '3d');
}
export const _rendererVersion = () => version;
