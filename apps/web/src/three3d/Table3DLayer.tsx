/**
 * The 3D layer under a mode's 2D table (first-load side: no three import here).
 * Loads PPScene lazily; if the chunk fails, the context is lost or the first frame
 * takes over 6 s, it marks the renderer failed and the table stays 2D for the session.
 */
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { markRendererFailed } from './renderer';
import { loadScene } from './preload';
import { loadSettings } from '../settings';

export const FIRST_FRAME_TIMEOUT_MS = 6000;
type SceneProps = { onFirstFrame: () => void; onContextLost: () => void; quality?: 'high' | 'low' };

export function Table3DLayer({ onReady }: { onReady: (ready: boolean) => void }) {
  const [Scene, setScene] = useState<ComponentType<SceneProps> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    let live = true;
    timer.current = window.setTimeout(() => { if (live) markRendererFailed('timeout'); }, FIRST_FRAME_TIMEOUT_MS);
    loadScene().then((m) => { if (live) setScene(() => m.PPScene); }).catch(() => { if (live) markRendererFailed('error'); });
    return () => { live = false; window.clearTimeout(timer.current); onReady(false); };
  }, [onReady]);
  if (!Scene) return null;
  return (
    <div className="table3d-layer" data-testid="table3d" aria-hidden="true">
      <Scene
        quality={loadSettings().quality}
        onFirstFrame={() => { window.clearTimeout(timer.current); onReady(true); }}
        onContextLost={() => { onReady(false); markRendererFailed('context-lost'); }}
      />
    </div>
  );
}
