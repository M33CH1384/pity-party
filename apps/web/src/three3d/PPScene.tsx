/**
 * V10b scene: the re-tinted table (table.ts), ONE light rig (hemisphere + key spot; key shadow on High only),
 * the warm_bar HDRI on High only, a radial-gradient backdrop and Neutral tone mapping at the theme's exposure.
 * No postprocessing. Camera per V10-3D-SPEC §3. Lazy chunk only (preload.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  CanvasTexture, EquirectangularReflectionMapping, HemisphereLight, NeutralToneMapping, PCFSoftShadowMap, PMREMGenerator,
  RepeatWrapping, SpotLight, SRGBColorSpace, type Texture, TextureLoader, type WebGLRenderer,
} from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { buildTable, FD, FELTY, FW, type Quality, type Table, type TableTextures } from './table';
import { themeUniforms, watchTheme, type ThemeId, type ThemeUniforms } from './themeUniforms';
import { HandFan } from './HandFan';
import type { MirrorCard } from './handMirror';

export { FELTY, FW, FD };

export interface CameraPose { pos: [number, number, number]; target: [number, number, number]; fov: number }
/** Spec §3: portrait (aspect < .75), phone landscape (> 1.6), iPad / desktop in between. */
export function cameraFor(aspect: number): CameraPose {
  if (aspect < 0.75) return { pos: [0, 4.4, 0.75], target: [0, 0.88, -0.02], fov: 50 };
  if (aspect > 1.6) return { pos: [0, 2.05, 1.18], target: [0, 0.9, -0.3], fov: 44 };
  return { pos: [0, 2.15, 2.0], target: [0, 0.86, 0.05], fov: 44 };
}
/** Clover centre z: portrait .02, landscape / iPad −.26 (§3, §4 fix). */
export const cloverZ = (aspect: number) => (aspect < 0.75 ? 0.02 : -0.26);

const BASE = '/three3d/';
const tl = new TextureLoader();
const cache = new Map<string, Promise<Texture>>();
function tex(name: string, srgb: boolean, repeat?: [number, number]): Promise<Texture> {
  const key = `${name}:${srgb}:${repeat?.join('x') ?? ''}`;
  let p = cache.get(key);
  if (!p) {
    p = tl.loadAsync(BASE + name).then((t) => {
      if (srgb) t.colorSpace = SRGBColorSpace;
      if (repeat) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(...repeat); }
      t.anisotropy = 8; return t;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
const sz = (q: Quality) => (q === 'high' ? '1k' : '512');
function tableTextures(q: Quality): Promise<TableTextures> {
  return Promise.all([tex(`suede-nor-${sz(q)}.webp`, false, [4, 3]), tex(`suede-rough-${sz(q)}.webp`, false, [4, 3]), tex(`wood-${sz(q)}.webp`, true, [2, 1.2])])
    .then(([suedeNor, suedeRough, wood]) => ({ suedeNor, suedeRough, wood, inlay: null }));
}
const inlayTex = (theme: ThemeId, q: Quality) => tex(`inlay-${theme}-${sz(q)}.webp`, true);
let envP: Promise<Texture> | null = null;
const envHdr = () => (envP ??= new RGBELoader().loadAsync(BASE + 'env-256.hdr').then((t) => { t.mapping = EquirectangularReflectionMapping; return t; }));

/** Warm the textures (called by preload.ts while the player is on Setup). */
export function preloadTableAssets(q: Quality): void {
  const t = (document.documentElement.dataset.theme ?? 'C') as ThemeId;
  void tableTextures(q).catch(() => {}); void inlayTex(t, q).catch(() => {});
  if (q === 'high') void envHdr().catch(() => {});
}

function backdrop(u: ThemeUniforms): CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!; const rg = g.createRadialGradient(256, 230, 0, 256, 256, 380);
  rg.addColorStop(0, `#${u.bgIn.getHexString()}`); rg.addColorStop(1, `#${u.bgOut.getHexString()}`);
  g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
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

function World({ quality, onReady, hand, onHand }: { quality: Quality; onReady: () => void; hand: MirrorCard[]; onHand: (on: boolean) => void }) {
  const { scene, gl, size, invalidate } = useThree();
  const aspect = size.width / Math.max(1, size.height);
  const cz = cloverZ(aspect);
  const [tx, setTx] = useState<TableTextures | null>(null);
  const [env, setEnv] = useState<Texture | null>(null);
  const [u, setU] = useState<ThemeUniforms>(() => themeUniforms());
  const [inlay, setInlay] = useState<Texture | null>(null);

  useEffect(() => watchTheme(() => setU(themeUniforms())), []);
  useEffect(() => { let live = true; tableTextures(quality).then((t) => { if (live) setTx(t); }); return () => { live = false; }; }, [quality]);
  useEffect(() => { let live = true; inlayTex(u.theme, quality).then((t) => { if (live) { setInlay(t); invalidate(); } }).catch(() => {}); return () => { live = false; }; }, [u.theme, quality, invalidate]);
  useEffect(() => {
    if (quality !== 'high') { setEnv(null); return; }
    let live = true; let pm: PMREMGenerator | null = null; let out: Texture | null = null;
    envHdr().then((hdr) => { if (!live) return; pm = new PMREMGenerator(gl as WebGLRenderer); out = pm.fromEquirectangular(hdr).texture; setEnv(out); }).catch(() => {});
    return () => { live = false; out?.dispose(); pm?.dispose(); };
  }, [quality, gl]);

  // the table: rebuilt only for quality / layout (clover z), re-tinted for theme
  const table = useMemo<Table | null>(() => (tx ? buildTable(quality, tx, cz) : null), [tx, quality, cz]);
  useEffect(() => () => table?.dispose(), [table]);

  // lights: hemisphere + key spot (§1b shared key values); shadow on High only
  const lights = useMemo(() => {
    const hemi = new HemisphereLight();
    const key = new SpotLight(0xffffff, 4, 0, 0.6, 0.75, 1.2);
    key.position.set(0.35, 3.1, 0.7); key.target.position.set(0, 0.85, 0);
    key.castShadow = quality === 'high'; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.00008; key.shadow.normalBias = 0.008; key.shadow.radius = 5;
    return { hemi, key };
  }, [quality]);

  useEffect(() => {
    table?.applyTheme(u, inlay);
    lights.hemi.color.copy(u.hemiSky); lights.hemi.groundColor.copy(u.hemiGround); lights.hemi.intensity = u.hemi;
    lights.key.color.copy(u.key);
    gl.toneMapping = NeutralToneMapping; gl.toneMappingExposure = u.exposure;
    const bg = backdrop(u); const old = scene.background; scene.background = bg; if (old instanceof CanvasTexture) old.dispose();
    scene.environment = env; scene.environmentIntensity = u.env;
    invalidate();
  }, [u, inlay, env, table, lights, gl, scene, invalidate]);

  const fired = useRef(false);
  useFrame(() => {
    const info = gl.info.render;
    (window as unknown as { __pp3d?: object }).__pp3d = { calls: info.calls, triangles: info.triangles, quality, theme: u.theme };
    if (table && !fired.current) { fired.current = true; requestAnimationFrame(onReady); }
  });
  if (!table) return null;
  return (
    <>
      <primitive object={lights.hemi} />
      <primitive object={lights.key} />
      <primitive object={lights.key.target} />
      <primitive object={table.group} />
      <HandFan cards={hand} u={u} onDrawn={onHand} />
    </>
  );
}

export function PPScene({ onFirstFrame, onContextLost, quality = 'high', hand = [], onHand = () => {} }: { onFirstFrame: () => void; onContextLost: () => void; quality?: Quality; hand?: MirrorCard[]; onHand?: (on: boolean) => void }) {
  const high = quality === 'high';
  return (
    <Canvas
      data-testid="pp-canvas"
      frameloop="demand"
      dpr={high ? [1, 2] : 1}
      shadows={high ? { type: PCFSoftShadowMap } : false}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 50, near: 0.05, far: 50, position: [0, 4.4, 0.75] }}
      onCreated={({ gl }) => {
        gl.toneMapping = NeutralToneMapping; gl.outputColorSpace = SRGBColorSpace;
        gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onContextLost(); }, { once: true });
      }}
    >
      <Rig />
      <World quality={quality} onReady={onFirstFrame} hand={hand} onHand={onHand} />
    </Canvas>
  );
}
