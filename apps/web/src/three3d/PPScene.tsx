/**
 * V10a: the minimal 3D table: camera per V10-3D-SPEC §3 and a plain felt plane in the theme's --pp-felt.
 * Lazy chunk only (preload.ts). V10b brings the rail, suede felt and lighting.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Color, SRGBColorSpace } from 'three';

/** World units from the spec (§0): felt surface height and size. */
export const FELTY = 0.929;
export const FW = 2.971;
export const FD = 1.776;

export interface CameraPose { pos: [number, number, number]; target: [number, number, number]; fov: number }
/** Spec §3: portrait (aspect < .75), phone landscape (> 1.6), iPad / desktop in between. */
export function cameraFor(aspect: number): CameraPose {
  if (aspect < 0.75) return { pos: [0, 4.4, 0.75], target: [0, 0.88, -0.02], fov: 50 };
  if (aspect > 1.6) return { pos: [0, 2.05, 1.18], target: [0, 0.9, -0.3], fov: 44 };
  return { pos: [0, 2.15, 2.0], target: [0, 0.86, 0.05], fov: 44 };
}

function readFelt(): string {
  // every theme defines --pp-felt (theme.css); no colour literal here (colour-cap test)
  return getComputedStyle(document.documentElement).getPropertyValue('--pp-felt').trim();
}
/** Re-reads --pp-felt whenever the theme / accent attributes on <html> change. */
function useFelt(): string {
  const [felt, setFelt] = useState(readFelt);
  useEffect(() => {
    const mo = new MutationObserver(() => setFelt(readFelt()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent', 'style', 'class'] });
    return () => mo.disconnect();
  }, []);
  return felt;
}

function Rig() {
  const { camera, size, invalidate } = useThree();
  const aspect = size.width / Math.max(1, size.height);
  useEffect(() => {
    const c = cameraFor(aspect);
    camera.position.set(...c.pos);
    (camera as unknown as { fov: number }).fov = c.fov;
    camera.lookAt(...c.target);
    camera.updateProjectionMatrix();
    invalidate();
  }, [aspect, camera, invalidate]);
  return null;
}

function Felt() {
  const felt = useFelt();
  const color = useMemo(() => (felt ? new Color().setStyle(felt, SRGBColorSpace) : new Color()), [felt]);
  const { invalidate } = useThree();
  useEffect(() => { invalidate(); }, [color, invalidate]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELTY, 0]} name="felt">
      <planeGeometry args={[FW, FD]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

function FirstFrame({ onFirstFrame }: { onFirstFrame: () => void }) {
  const done = useRef(false);
  useFrame(() => { if (!done.current) { done.current = true; requestAnimationFrame(() => onFirstFrame()); } });
  return null;
}

export function PPScene({ onFirstFrame, onContextLost }: { onFirstFrame: () => void; onContextLost: () => void }) {
  return (
    <Canvas
      data-testid="pp-canvas"
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 50, near: 0.05, far: 50, position: [0, 4.4, 0.75] }}
      onCreated={({ gl }) => { gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onContextLost(); }, { once: true }); }}
    >
      <Rig />
      <Felt />
      <FirstFrame onFirstFrame={onFirstFrame} />
    </Canvas>
  );
}
