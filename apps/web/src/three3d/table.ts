/**
 * V10b table: wood top, padded rail ring, suede felt, trim line, clover inlay decal, and the no-post glow recipe
 * (V10-3D-SPEC §1a geometry, §1c glow, §2 clover, §5 B gingham). Ported from BWM's TableModel (rail + suede felt,
 * Scene.tsx) re-cut to the hero-scene sizes. Built once; `applyTheme` only re-tints (A/B/C/K + C accent presets).
 * Lazy-chunk only.
 */
import {
  AdditiveBlending, CanvasTexture, CatmullRomCurve3, CircleGeometry, Color, ExtrudeGeometry, Group, LinearFilter,
  LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Path, PlaneGeometry,
  RepeatWrapping, RingGeometry, Shape, SRGBColorSpace, type Texture, TubeGeometry, Vector2, Vector3,
} from 'three';
import type { ThemeUniforms } from './themeUniforms';

export const TOPY = 0.877;
export const FELTY = 0.929;
export const FW = 2.971;
export const FD = 1.776;
export const CLOVER_R = 0.5;
export type Quality = 'high' | 'low';

function rr(w: number, d: number, r: number): Shape {
  const s = new Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** Extruded rounded slab whose TOP sits at `top`; planar xz UVs (0..1). */
function slab(w: number, d: number, r: number, h: number, top: number, bevel = 0, hole?: [number, number, number]) {
  const sh = rr(w, d, r);
  if (hole) sh.holes.push(new Path(rr(hole[0], hole[1], hole[2]).getPoints(48).reverse()));
  const g = new ExtrudeGeometry(sh, { depth: h, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 12 });
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position!, uv = g.attributes.uv!;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getZ(i) + d / 2) / d);
  g.translate(0, top, 0);
  return g;
}

/** §5: 64px gingham tile, 0 bytes downloaded: base felt + a white .14 band over the bottom and right halves. */
export function ginghamTexture(base: Color, band: string): CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = `#${base.getHexString('srgb' as never)}`; g.fillRect(0, 0, 64, 64);
  g.fillStyle = band; g.fillRect(0, 32, 64, 32); g.fillRect(32, 0, 32, 64);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(FW / 0.06, FD / 0.06); t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.anisotropy = 8;
  return t;
}

/** Alpha masks drawn with named colours (white / black → transparent); the material opacity sets the strength. */
function radial(size: number, stops: [number, string][]): CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!; const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, s] of stops) rg.addColorStop(o, s);
  g.fillStyle = rg; g.fillRect(0, 0, size, size);
  return new CanvasTexture(c);
}

export interface TableTextures { suedeNor: Texture; suedeRough: Texture; wood: Texture; inlay: Texture | null }

export interface Table {
  group: Group;
  applyTheme(u: ThemeUniforms, inlay: Texture | null): void;
  dispose(): void;
}

/** Build the table. `cz` = clover centre z (portrait .02, landscape −.26 per §3/§4). */
export function buildTable(q: Quality, tx: TableTextures, cz: number): Table {
  const group = new Group(); group.name = 'pp-table';
  const disposables: { dispose(): void }[] = [];
  const add = (m: Mesh) => { group.add(m); disposables.push(m.geometry); return m; };
  const shadows = q === 'high';

  // wood top (BWM dining-table top stand-in), rail ring, felt, trim
  const woodM = new MeshStandardMaterial({ map: tx.wood, roughness: 0.6 }); disposables.push(woodM);
  add(new Mesh(slab(FW + 0.3, FD + 0.24, 0.2, 0.06, TOPY, 0.01), woodM)).receiveShadow = shadows;
  const railM = new MeshPhysicalMaterial({ roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.15 }); disposables.push(railM);
  const rail = add(new Mesh(slab(FW + 0.16, FD + 0.16, 0.16, 0.04, TOPY + 0.044, 0.018, [FW - 0.03, FD - 0.03, 0.09]), railM));
  rail.castShadow = shadows; rail.receiveShadow = shadows;
  const feltM = new MeshPhysicalMaterial({ roughness: 0.95, sheen: 1, sheenRoughness: 0.45, normalMap: tx.suedeNor, roughnessMap: tx.suedeRough, normalScale: new Vector2(0.8, 0.8) });
  disposables.push(feltM);
  add(new Mesh(slab(FW, FD, 0.1, 0.03, FELTY), feltM)).receiveShadow = shadows;
  const trimM = new MeshStandardMaterial({ metalness: 0.9, roughness: 0.3 }); disposables.push(trimM);
  add(new Mesh(slab(FW + 0.03, FD + 0.03, 0.11, 0.004, TOPY + 0.0515), trimM));

  // clover: inner disc + lip ring + baked inlay decal (§2; 1 world = 880px of the 1024 PNG, z squashed .92)
  const discM = new MeshPhysicalMaterial({ roughness: 0.95, sheen: 1 }); disposables.push(discM);
  const disc = add(new Mesh(new CircleGeometry(CLOVER_R - 0.02, 96), discM)); disc.rotation.x = -Math.PI / 2; disc.position.set(0, FELTY + 0.0004, cz); disc.scale.set(1, 0.92, 1); disc.receiveShadow = shadows;
  const lipM = new MeshPhysicalMaterial({ metalness: 0.85, roughness: 0.32 }); disposables.push(lipM);
  const lip = add(new Mesh(new RingGeometry(CLOVER_R - 0.02, CLOVER_R, 96), lipM)); lip.rotation.x = -Math.PI / 2; lip.position.set(0, FELTY + 0.0012, cz); lip.scale.set(1, 0.92, 1);
  const inlayM = new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }); disposables.push(inlayM);
  const S = 1024 / 880;
  const inlay = add(new Mesh(new PlaneGeometry(S, S * 0.92), inlayM)); inlay.rotation.x = -Math.PI / 2; inlay.position.set(0, FELTY + 0.0016, cz);

  // neon: glyph tubes (High), halo ring, turn arc at "you" (+π/2), C rail tube; shells per §1c
  const tubes: { mesh: Mesh; k: number; color: 'accent' | 'accent2' | 'spade'; shells: Mesh[] }[] = [];
  const Y = FELTY + 0.007;
  const tube = (pts: Vector3[], color: 'accent' | 'accent2' | 'spade', r: number, k: number, closed: boolean, seg: number) => {
    const curve = new CatmullRomCurve3(pts, closed);
    const m = new MeshStandardMaterial({ roughness: 0.4 }); disposables.push(m);
    const mesh = add(new Mesh(new TubeGeometry(curve, seg, r, 8, closed), m));
    const shells: Mesh[] = [];
    // shell 2 (×6.5, .10) is High only; Low keeps shell 1 (×2.6, .32)
    for (const [mul, op] of (q === 'high' ? [[2.6, 0.32], [6.5, 0.1]] : [[2.6, 0.32]]) as [number, number][]) {
      const sm = new MeshBasicMaterial({ transparent: true, opacity: op, blending: AdditiveBlending, depthWrite: false, toneMapped: false }); disposables.push(sm);
      const s = add(new Mesh(new TubeGeometry(curve, seg, r * mul, 8, closed), sm)); s.userData.op = op; shells.push(s);
    }
    tubes.push({ mesh, k, color, shells });
  };
  const P = (x: number, z: number) => new Vector3(x, Y, z);
  if (q === 'high') {
    const at = (a: number) => [Math.cos(a) * (CLOVER_R - 0.11), cz + Math.sin(a) * (CLOVER_R - 0.11) * 0.92] as const;
    const heart = (cx: number, cz2: number, s: number, c: 'accent' | 'spade', flip = 1) => {
      const p: Vector3[] = []; for (let i = 0; i < 64; i++) { const t = (i / 64) * Math.PI * 2; p.push(P(cx + (16 * Math.sin(t) ** 3 / 17) * s, cz2 - (flip * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))) / 17 * s)); }
      tube(p, c, 0.005, 5, true, 128);
    };
    const [sx, sz] = at(-Math.PI * 0.75); heart(sx, sz + 0.01, 0.075 * 0.95, 'spade', -1); tube([P(sx, sz + 0.03), P(sx - 0.019, sz + 0.079), P(sx + 0.019, sz + 0.079)], 'spade', 0.005, 5, true, 30);
    const [hx, hz] = at(-Math.PI * 0.25); heart(hx, hz, 0.075, 'accent');
    const [kx, kz] = at(Math.PI * 0.25);
    for (const [dx, dz] of [[0, -0.45], [-0.45, 0.12], [0.45, 0.12]] as const) { const p: Vector3[] = []; for (let i = 0; i < 40; i++) { const t = (i / 40) * Math.PI * 2; p.push(P(kx + dx * 0.075 + Math.cos(t) * 0.0285, kz + dz * 0.075 + Math.sin(t) * 0.0285)); } tube(p, 'accent2', 0.005, 5, true, 64); }
    const [dx0, dz0] = at(Math.PI * 0.75); { const p: Vector3[] = []; for (let i = 0; i < 64; i++) { const t = (i / 64) * Math.PI * 2; const c = Math.cos(t), sn = Math.sin(t); const k = 1 / (Math.abs(c) / 0.72 + Math.abs(sn)); p.push(P(dx0 + c * k * 0.075 * 0.72, dz0 + sn * k * 0.075)); } tube(p, 'accent', 0.005, 5, true, 96); }
  }
  { const ring: Vector3[] = []; for (let i = 0; i < 160; i++) { const a = (i / 160) * Math.PI * 2; ring.push(new Vector3(Math.cos(a) * (CLOVER_R + 0.03), FELTY + 0.004, cz + Math.sin(a) * (CLOVER_R + 0.03) * 0.92)); } tube(ring, 'accent2', 0.0025, 1.4, true, 240); }
  { const sw: Vector3[] = []; for (let i = 0; i <= 40; i++) { const a = Math.PI / 2 + (i / 40 - 0.5) * 1.1; sw.push(new Vector3(Math.cos(a) * (CLOVER_R + 0.03), FELTY + 0.006, cz + Math.sin(a) * (CLOVER_R + 0.03) * 0.92)); } tube(sw, 'accent', 0.0065, 7, false, 80); }
  // C: neon rail tube along the trim line (rounded rect)
  const railTube = (() => {
    const pts = rr(FW + 0.05, FD + 0.05, 0.12).getPoints(24).map((v) => new Vector3(v.x, TOPY + 0.056, v.y));
    pts.pop();
    const before = tubes.length; tube(pts, 'accent', 0.005, 2.2 / 0.32, true, 400); return tubes[before]!;
  })();

  // underglow + centre spot (High only, §1c)
  const glowPlanes: { mesh: Mesh; base: number; color: 'accent' | 'accent2' }[] = [];
  if (q === 'high') {
    const ugT = radial(256, [[0, 'transparent'], [0.42, 'transparent'], [0.62, 'white'], [1, 'transparent']]);
    const ugM = new MeshBasicMaterial({ map: ugT, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }); disposables.push(ugM, ugT);
    const ug = add(new Mesh(new PlaneGeometry(1.5, 1.5 * 0.92), ugM)); ug.rotation.x = -Math.PI / 2; ug.position.set(0, FELTY + 0.0009, cz);
    glowPlanes.push({ mesh: ug, base: 0.35 * 0.55, color: 'accent2' });
    const spT = radial(128, [[0, 'white'], [1, 'transparent']]);
    const spM = new MeshBasicMaterial({ map: spT, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }); disposables.push(spM, spT);
    const sp = add(new Mesh(new PlaneGeometry(0.42, 0.42), spM)); sp.rotation.x = -Math.PI / 2; sp.position.set(0, FELTY + 0.001, cz);
    glowPlanes.push({ mesh: sp, base: 0.45 * 0.7, color: 'accent' });
  }
  // contact shadow under the table (§1d)
  const csT = radial(256, [[0, 'black'], [1, 'transparent']]);
  const csM = new MeshBasicMaterial({ map: csT, transparent: true, opacity: 0.55, depthWrite: false }); disposables.push(csM, csT);
  const cs = add(new Mesh(new PlaneGeometry(4, 3.2), csM)); cs.rotation.x = -Math.PI / 2; cs.position.y = 0.002;

  let gingham: CanvasTexture | null = null;
  const applyTheme = (u: ThemeUniforms, inlayTex: Texture | null) => {
    woodM.color.copy(u.wood);
    railM.color.copy(u.rail); railM.roughness = u.railRough; railM.sheen = u.railSheen; railM.sheenColor.copy(u.railSheenColor);
    if (u.gingham) {
      gingham?.dispose(); gingham = ginghamTexture(u.felt, u.ginghamBand);
      feltM.map = gingham; feltM.color.set(1, 1, 1); feltM.roughness = 0.9; feltM.sheen = 0.4; feltM.sheenRoughness = 0.6; feltM.roughnessMap = null; feltM.normalScale.set(0.35, 0.35);
    } else {
      feltM.map = null; feltM.color.copy(u.felt); feltM.roughness = 0.95; feltM.sheen = 1; feltM.sheenRoughness = 0.45; feltM.roughnessMap = tx.suedeRough; feltM.normalScale.set(0.8, 0.8);
    }
    feltM.sheenColor.copy(u.feltSheen); feltM.needsUpdate = true;
    trimM.color.copy(u.trim); trimM.emissive.copy(u.trimEmissive > 0 ? u.trim : new Color(0, 0, 0)); trimM.emissiveIntensity = u.trimEmissive;
    lipM.color.copy(u.lip);
    discM.color.copy(u.disc); discM.sheenColor.copy(u.accent).multiplyScalar(0.25);
    inlayM.map = inlayTex; inlayM.visible = !!inlayTex; inlayM.needsUpdate = true;
    const colorOf = (c: 'accent' | 'accent2' | 'spade') => (c === 'accent' ? u.accent : c === 'accent2' ? u.accent2 : u.spade);
    for (const t of tubes) {
      const m = t.mesh.material as MeshStandardMaterial; const c = colorOf(t.color);
      const isRail = t === railTube;
      t.mesh.visible = isRail ? u.theme === 'C' : true;
      const ei = isRail ? u.trimEmissive : t.k * 0.32 * u.neon;
      m.color.copy(c); m.emissive.copy(c); m.emissiveIntensity = ei; m.metalness = u.gingham ? 0.3 : 0;
      for (const s of t.shells) {
        const sm = s.material as MeshBasicMaterial; sm.color.copy(c);
        sm.opacity = (s.userData.op as number) * Math.min(1, ei / 1.6);
        // §1c: shells only for emissive ≥ .5; B never glows
        s.visible = t.mesh.visible && u.glow && ei >= 0.5;
      }
    }
    for (const g of glowPlanes) { const m = g.mesh.material as MeshBasicMaterial; m.color.copy(colorOf(g.color)); m.opacity = g.base * u.neon; g.mesh.visible = u.glow; }
  };
  return { group, applyTheme, dispose: () => { gingham?.dispose(); disposables.forEach((d) => d.dispose()); } };
}
