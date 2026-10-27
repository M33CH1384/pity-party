/**
 * Loads the 3D table chunk (three / r3f + PPScene) early, e.g. from Setup, so the table lands ready.
 * Ported from BWM src/three/preload.ts (eec0a98): the import goes through importChunk so a chunk
 * deleted by a deploy retries cache-busted, and the memo is cleared on failure so a later call
 * can ask again (a memoized rejected promise was BWM's "crashes on every attempt" bug).
 * V10b: also warms the table textures (+ HDRI on High). Safe to call many times.
 */
import { importChunk } from '../chunkLoad';
import { loadSettings } from '../settings';

let scene: Promise<typeof import('./PPScene')> | null = null;
export function loadScene(): Promise<typeof import('./PPScene')> {
  if (!scene) {
    scene = importChunk(() => import('./PPScene'));
    scene.catch(() => { scene = null; });
  }
  return scene;
}

let started = false;
/** immediate: the table is already the screen; otherwise wait for an idle callback so first paint wins. */
export function preloadTable(opts?: { immediate?: boolean }): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const go = () => { loadScene().then((m) => m.preloadTableAssets(loadSettings().quality)).catch(() => { started = false; }); };
  if (opts?.immediate) { go(); return; }
  const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(go, { timeout: 1200 }); else window.setTimeout(go, 300);
}
