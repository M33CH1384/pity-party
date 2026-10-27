/**
 * V10b scene: the re-tinted table (table.ts), ONE light rig (hemisphere + key spot; key shadow on High only),
 * the warm_bar HDRI on High only, the V10g lounge room (room.ts) and Neutral tone mapping at the theme's exposure.
 * No postprocessing. Camera per V10-3D-SPEC §3. Lazy chunk only (preload.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  EquirectangularReflectionMapping, HemisphereLight, NeutralToneMapping, PCFSoftShadowMap, PMREMGenerator,
  RepeatWrapping, SpotLight, SRGBColorSpace, type Texture, TextureLoader, type WebGLRenderer,
} from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { buildTable, FD, FELTY, FW, type Quality, type Table, type TableTextures } from './table';
import { themeUniforms, watchTheme, type ThemeId, type ThemeUniforms } from './themeUniforms';
import { HandFan } from './HandFan';
import { type MirrorCard, type TableSnap, useHandMirror, useTableMirror } from './handMirror';
import { PPTable3D } from './PPTable3D';
import { buildRoom, type Room } from './room';
import './table3d.css';

export { FELTY, FW, FD };

export interface CameraPose { pos: [number, number, number]; target: [number, number, number]; fov: number }
/** Portrait (aspect < .75), phone landscape (> 1.6), iPad / desktop in between. */
export function cameraFor(aspect: number): CameraPose {
  // V10g seated cameras (table-v2 NOTES: BWM 'sitting', low and across the felt, aimed at the far half)
  if (aspect < 0.75) return { pos: [0, 2.33, 2.55], target: [0, 0.88, -0.22], fov: 56 };
  if (aspect > 1.6) return { pos: [0, 1.71, 1.84], target: [0, 0.93, -0.3], fov: 44 };
  return { pos: [0, 1.88, 1.74], target: [0, 0.93, -0.2], fov: 50 };
}
/** Clover centre z: portrait .02, landscape / iPad −.26 (§3, §4 fix). */
export const cloverZ = (aspect: number) => (aspect < 0.75 ? 0.16 : -0.26);

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

function World({ quality, onReady, hand, onHand, snap, onTable }: { quality: Quality; onReady: () => void; hand: MirrorCard[]; onHand: (on: boolean) => void; snap: TableSnap | null; onTable: (on: boolean) => void }) {
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
  const portrait = aspect < 0.75;
  const table = useMemo<Table | null>(() => (tx ? buildTable(quality, tx, cz, portrait) : null), [tx, quality, cz, portrait]);
  useEffect(() => () => table?.dispose(), [table]);
  const room = useMemo<Room | null>(() => (tx ? buildRoom(quality, tx.wood, cz) : null), [tx, quality, cz]);
  useEffect(() => () => room?.dispose(), [room]);

  // lights: hemisphere + key spot (§1b shared key values); shadow on High only
  const lights = useMemo(() => {
    const hemi = new HemisphereLight();
    const key = new SpotLight(0xffffff, 4, 0, 0.6, 0.75, 1.2);
    key.position.set(0.35, 3.1, 0.7); key.target.position.set(0, 0.85, 0);
    key.castShadow = quality === 'high'; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.00008; key.shadow.normalBias = 0.008; key.shadow.radius = 5;
    return { hemi, key };
  }, [quality]);

  useEffect(() => {
    table?.applyTheme(u, inlay); room?.applyTheme(u);
    lights.hemi.color.copy(u.hemiSky); lights.hemi.groundColor.copy(u.hemiGround); lights.hemi.intensity = u.hemi;
    lights.key.color.copy(u.key);
    gl.toneMapping = NeutralToneMapping; gl.toneMappingExposure = u.exposure;
    scene.background = u.bgOut;
    scene.environment = env; scene.environmentIntensity = u.env;
    invalidate();
  }, [u, inlay, env, table, room, lights, gl, scene, invalidate]);

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
      {room && <primitive object={room.group} />}
      <PPTable3D snap={snap} u={u} cz={cz} aspect={aspect} onDrawn={onTable} />
      <HandFan cards={hand} u={u} onDrawn={onHand} />
    </>
  );
}

const noop = () => {};
export function PPScene({ onFirstFrame, onContextLost, quality = 'high', root = null, onHand = noop, onTable = noop }: { onFirstFrame: () => void; onContextLost: () => void; quality?: Quality; root?: HTMLElement | null; onHand?: (on: boolean) => void; onTable?: (on: boolean) => void }) {
  // V10c/d mirrors (lazy side, so they cost the first load nothing): own DOM hand + the public table snapshot
  const hand = useHandMirror(root);
  const table = useTableMirror(root);
  const high = quality === 'high';
  return (
    <Canvas
      data-testid="pp-canvas"
      frameloop="demand"
      dpr={high ? [1, 2] : 1}
      shadows={high ? { type: PCFSoftShadowMap } : false}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 50, near: 0.05, far: 50, position: [0, 2.33, 2.55] }}
      onCreated={({ gl }) => {
        gl.toneMapping = NeutralToneMapping; gl.outputColorSpace = SRGBColorSpace;
        gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onContextLost(); }, { once: true });
      }}
    >
      <Rig />
      <World quality={quality} onReady={onFirstFrame} hand={hand} onHand={onHand} snap={table} onTable={onTable} />
    </Canvas>
  );
}
