/**
 * V10g-3 held hand (Desi hand-v2 HAND-SPEC §B/§C, BWM handLift pivot fan). The fan pose is solved here from the hand
 * size and the viewport (pivot 1.12 card-heights below the cards, 14°/card for ≤ 5, roll .66 × arc, lean back
 * .10 rad, seeded human jitter), and the DOM hand (still the input + a11y layer) is then POSED onto the drawn cards:
 * every slot gets the 3D card's screen centre, size and roll, so the tap area follows the visual card exactly.
 * Cards have real thickness (an extruded rounded-rect paper edge), a gloss streak, a soft contact shadow and an overlap
 * shade on the card underneath. Faces stay cardArt's drawCard textures (unlit, tone mapping off: B whites stay white).
 */
import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending, CanvasTexture, Color, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, type PerspectiveCamera, PlaneGeometry, Shape,
} from 'three';
import type { MirrorCard } from './handMirror';
import { parseCardText } from './handMirror';
import { cardFontsReady, faceTexture } from './cardTextures';
import { CORNER, faceGeometry } from './cardGeometry';
import type { ThemeUniforms } from './themeUniforms';

const ASPECT = 1.4;
/** spec §B: degrees between cards (14 for ≤ 5, 9.5 for 7, shrinking so the outer cards stay within ~±30°) */
export function fanStep(n: number): number { return n <= 5 ? 14 : n <= 7 ? Math.min(14, 57 / (n - 1)) : 57 / (n - 1); }
/** fan angle of card i of n (deg), symmetric */
export function fanTilt(i: number, n: number): number { return (i - (n - 1) / 2) * fanStep(n); }

export interface FanPose { x: number; y: number; roll: number; cx: number; cy: number; w: number; h: number; deg: number }
/**
 * Pose of each card in camera space (depth `d`, view `vw` × `vh` world) plus its screen centre / size (px) and roll (deg).
 * `rise` (px) lifts the fan clear of a bottom action row in portrait.
 */
export function solveFan(n: number, W: number, H: number, vw: number, vh: number, rise: number, jitter: (i: number) => [number, number, number] = () => [0, 0, 0]): FanPose[] {
  const portrait = W / H < 0.75;
  const pxw = vh / H;
  const cardWpx = portrait ? 0.31 * W : (H < 400 ? 0.34 : 0.38) * H / ASPECT;
  const cw = Math.min(cardWpx, 180) * pxw, ch = cw * ASPECT;
  const R = 1.12 * ch;
  const pivX = portrait ? 0 : -0.09 * vw;
  const pivY = -vh / 2 - R + ch * 0.4 + rise * pxw + 0.06 * ch;
  const out: FanPose[] = [];
  for (let i = 0; i < n; i++) {
    const [j1, jx, jy] = jitter(i);
    const deg = fanTilt(i, n) + j1, a = (deg * Math.PI) / 180;
    const x = pivX + R * Math.sin(a) + jx * cw, y = pivY + R * Math.cos(a) + jy * cw;
    const roll = -0.66 * a;
    out.push({ x, y, roll, cx: (x / vw + 0.5) * W, cy: (0.5 - y / vh) * H, w: cw / pxw, h: ch / pxw, deg: (-roll * 180) / Math.PI });
  }
  return out;
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rnd = (seed: number, k: number) => ((hash(`${seed}:${k}`) % 2001) / 1000 - 1);

/** small canvases: one 128px soft contact shadow, one 64×8 overlap wedge, one 64px gloss streak (alpha masks, named colours) */
let masks: { shadow: CanvasTexture; ao: CanvasTexture; gloss: CanvasTexture } | null = null;
function maskTex() {
  if (masks) return masks;
  const cv = (w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')!); return new CanvasTexture(c); };
  masks = {
    shadow: cv(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 10, 64, 64, 64); r.addColorStop(0, 'black'); r.addColorStop(1, 'transparent'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }),
    ao: cv(64, 8, (g) => { const r = g.createLinearGradient(0, 0, 64, 0); r.addColorStop(0, 'transparent'); r.addColorStop(1, 'black'); g.fillStyle = r; g.fillRect(0, 0, 64, 8); }),
    gloss: cv(64, 64, (g) => { const r = g.createLinearGradient(0, 0, 64, 64); r.addColorStop(0.25, 'transparent'); r.addColorStop(0.42, 'white'); r.addColorStop(0.6, 'transparent'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }),
  };
  return masks;
}
/** the paper edge: a rounded-rect slab 1.2% of the width thick (unit width, aspect tall), shared */
let edgeGeo: ExtrudeGeometry | null = null;
function edgeGeometry(): ExtrudeGeometry {
  if (edgeGeo) return edgeGeo;
  const w = 1, h = ASPECT, r = CORNER, x = -w / 2, y = -h / 2, s = new Shape();
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  edgeGeo = new ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 6 }); edgeGeo.translate(0, 0, -0.012);
  return edgeGeo;
}
const unitPlane = new PlaneGeometry(1, 1);

export function HandFan({ cards, u, onDrawn, root }: { cards: MirrorCard[]; u: ThemeUniforms; onDrawn: (on: boolean) => void; root: HTMLElement | null }) {
  const { camera, size, invalidate } = useThree();
  const [fonts, setFonts] = useState(false);
  useEffect(() => { let live = true; void cardFontsReady().then(() => { if (live) setFonts(true); }); return () => { live = false; }; }, []);
  const group = useMemo(() => new Group(), []);

  useEffect(() => {
    group.clear();
    const hand = root?.querySelector<HTMLElement>('[data-testid="my-hand"]') ?? null;
    if (!fonts || !cards.length || !hand) { hand?.classList.remove('is-posed'); onDrawn(false); invalidate(); return; }
    const cam = camera as PerspectiveCamera;
    const portrait = size.width / size.height < 0.75;
    const D = portrait ? 0.62 : 0.6;
    const vh = 2 * D * Math.tan((cam.fov * Math.PI) / 360), vw = vh * (size.width / size.height);
    // portrait: lift the fan clear of the (fixed, bottom) action row
    const acts = root?.querySelector<HTMLElement>('.pp-actions');
    const rise = portrait ? Math.max(0.075 * size.height, (acts?.getBoundingClientRect().height ?? 0) + 20) : 0;
    const poses = solveFan(cards.length, size.width, size.height, vw, vh, rise, (i) => { const s = hash(cards[i]!.key); return [rnd(s, 1), rnd(s, 2) * 0.032, rnd(s, 3) * 0.032]; });

    const m = maskTex();
    const ink = u.theme === 'B' ? u.trim : null;
    // paper edge (B: ink edge), slightly darker toward the bottom by the shadow under it
    const edgeCol = ink ?? new Color().setRGB(0.925, 0.902, 0.855);
    const primary = new Color().setStyle(getComputedStyle(document.documentElement).getPropertyValue('--pp-primary').trim() || 'white', 'srgb');
    const mats: MeshBasicMaterial[] = [];
    const mat = (o: ConstructorParameters<typeof MeshBasicMaterial>[0]) => { const x = new MeshBasicMaterial({ toneMapped: false, depthTest: false, depthWrite: false, transparent: true, ...o }); mats.push(x); return x; };
    const shadowM = mat({ map: m.shadow, color: 0x000000, opacity: 0.6 }), aoM = mat({ map: m.ao, color: 0x000000, opacity: 0.55 });
    const glossM = mat({ map: m.gloss, blending: AdditiveBlending, opacity: u.theme === 'B' ? 0.06 : 0.12 });
    const edgeM = mat({ color: edgeCol });

    const slots = [...hand.querySelectorAll<HTMLElement>('.pp-card-slot')];
    cards.forEach((c, i) => {
      const parsed = parseCardText(c.text); const p = poses[i]!; if (!parsed) return;
      const cw = p.w * (vh / size.height), lift = c.lifted ? 0.18 * cw * ASPECT : 0;
      const g = new Group(); g.name = 'hand-card';
      g.position.set(p.x - Math.sin(p.roll) * lift, p.y + Math.cos(p.roll) * lift, -D + i * 0.0035 + (c.lifted ? 0.02 : 0));
      g.rotation.set(-0.1, (-0.25 * p.roll) / 0.66, p.roll, 'ZYX');
      const o = 1000 + i * 8;
      const add = (mesh: Mesh, k: number) => { mesh.renderOrder = o + k; g.add(mesh); return mesh; };
      const sh = add(new Mesh(unitPlane, c.lifted ? mat({ map: m.shadow, color: 0x000000, opacity: 0.45 }) : shadowM), 0);
      sh.scale.set(cw * 1.18, cw * ASPECT * 1.12, 1); sh.position.set(-0.05 * cw * (c.lifted ? 2 : 1), -0.04 * cw * ASPECT * (c.lifted ? 2 : 1), -0.004);
      if (i > 0) { const ao = add(new Mesh(unitPlane, aoM), 1); ao.scale.set(cw * 0.09, cw * ASPECT * 0.96, 1); ao.position.set(-cw * 0.545, 0, -0.003); }
      const ed = add(new Mesh(edgeGeometry(), edgeM), 2); ed.scale.set(cw, cw, cw); ed.position.set(0.004 * cw, -0.008 * cw, -0.0005);
      if (c.lifted || c.live) { const ring = add(new Mesh(faceGeometry(ASPECT), mat({ color: c.lifted ? u.accent : primary })), 3); const k = cw * (1 + (c.lifted ? 0.07 : 0.035)); ring.scale.set(k, k, 1); ring.position.z = -0.0003; }
      const face = add(new Mesh(faceGeometry(ASPECT), mat({ map: faceTexture(parsed, c.text, c.wild, false), color: new Color().setScalar(c.dim ? 0.62 : 1) })), 4);
      face.scale.set(cw, cw, 1);
      const gl = add(new Mesh(faceGeometry(ASPECT), glossM), 5); gl.scale.set(cw, cw, 1); gl.position.z = 0.0002;
      group.add(g);
      // pose the DOM tap target onto the drawn card (same centre, size and roll; lifted cards move with the lift)
      const el = slots[i];
      if (el) {
        const ly = lift / (vh / size.height);
        el.style.setProperty('--hx', `${(p.cx + Math.sin(p.roll) * -ly).toFixed(1)}px`); el.style.setProperty('--hy', `${(p.cy - Math.cos(p.roll) * ly).toFixed(1)}px`);
        el.style.setProperty('--hw', `${p.w.toFixed(1)}px`); el.style.setProperty('--hh', `${p.h.toFixed(1)}px`); el.style.setProperty('--hr', `${p.deg.toFixed(2)}deg`);
      }
    });
    hand.classList.add('is-posed');
    onDrawn(true); invalidate();
    return () => { mats.forEach((x) => x.dispose()); };
  }, [cards, fonts, u, size, camera, group, invalidate, onDrawn, root]);
  useEffect(() => () => { root?.querySelector('[data-testid="my-hand"]')?.classList.remove('is-posed'); }, [root]);

  // follow the camera (static between layout changes; frameloop is on demand)
  useFrame(() => { group.position.copy(camera.position); group.quaternion.copy(camera.quaternion); });
  return <primitive object={group} />;
}
