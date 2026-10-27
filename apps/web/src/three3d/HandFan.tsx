/**
 * V10c/V10g 3D hand fan. Each card is a camera-attached quad at its DOM card's rect (the DOM hand stays the input
 * layer), on a curved fan (tilt + arc drop per row, a little card thickness and a soft contact shadow), a primary ring on playable cards, an accent plate behind the lifted
 * (Tonk-picked) card, and in theme B the 1.5px ink edge on every face. Faces are unlit MeshBasic with tone
 * mapping off, so B's pure-white faces stay untinted. Ported from BWM Card3D's hand path (handLift fan pose).
 */
import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, type PerspectiveCamera, PlaneGeometry } from 'three';
import type { MirrorCard } from './handMirror';
import { parseCardText } from './handMirror';
import { cardFontsReady, faceTexture } from './cardTextures';
import { faceGeometry } from './cardGeometry';
import type { ThemeUniforms } from './themeUniforms';

const D = 1; // camera-local depth of the hand plane
/** V10g curved fan (table-v2 / BWM handFan): tilt per card from the row centre (deg), ~10° a card, the whole fan capped at 44°. */
export function fanTilt(i: number, n: number): number { const step = Math.min(10, 44 / Math.max(1, n - 1)); return (i - (n - 1) / 2) * step; }
/** the arc drop (px) for a card tilted `deg` on a radius of 2.6 card widths */
export const fanDrop = (deg: number, w: number) => 2.6 * w * (1 - Math.cos((deg * Math.PI) / 180));

/** one shared 128px soft contact shadow (alpha mask drawn with named colours) */
let shadowTex: CanvasTexture | null = null;
function contactShadow(): CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!; const r = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  r.addColorStop(0, 'black'); r.addColorStop(1, 'transparent'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return (shadowTex = new CanvasTexture(c));
}
const shadowGeo = new PlaneGeometry(1, 1);

export function HandFan({ cards, u, onDrawn }: { cards: MirrorCard[]; u: ThemeUniforms; onDrawn: (on: boolean) => void }) {
  const { camera, size, invalidate } = useThree();
  const [fonts, setFonts] = useState(false);
  useEffect(() => { let live = true; void cardFontsReady().then(() => { if (live) setFonts(true); }); return () => { live = false; }; }, []);
  const group = useMemo(() => new Group(), []);

  useEffect(() => {
    group.clear();
    if (!fonts || !cards.length) { onDrawn(false); invalidate(); return; }
    const cam = camera as PerspectiveCamera;
    const H = 2 * D * Math.tan((cam.fov * Math.PI) / 360); const px = H / size.height;
    // rows (the DOM hand wraps): tilt within each row
    const rows = new Map<number, MirrorCard[]>();
    for (const c of cards) { const k = Math.round(c.rect.y / 8); rows.set(k, [...(rows.get(k) ?? []), c]); }
    const ink = u.theme === 'B' ? u.trim : null; // B ink edge = --pp-3d-trim
    const primary = new Color().setStyle(getComputedStyle(document.documentElement).getPropertyValue('--pp-primary').trim() || 'white', 'srgb');
    let order = 0;
    for (const row of rows.values()) row.forEach((c, i) => {
      const parsed = parseCardText(c.text); if (!parsed) return;
      const w = c.rect.w * px, h = c.rect.h * px;
      const card = new Group();
      const tilt = fanTilt(i, row.length);
      card.position.set((c.rect.x + c.rect.w / 2 - size.width / 2) * px, (size.height / 2 - (c.rect.y + c.rect.h / 2) - fanDrop(tilt, c.rect.w)) * px, -D);
      card.rotation.set(-0.12, (-tilt * 0.35 * Math.PI) / 180, (-tilt * Math.PI) / 180);
      // contact shadow (down-right) + a dark 3.5 mm-ish edge under the face for card thickness
      const sh = new Mesh(shadowGeo, new MeshBasicMaterial({ map: contactShadow(), transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
      sh.scale.set(w * 1.25, h * 1.18, 1); sh.position.set(0.1 * w, -0.08 * w, -0.0006); sh.renderOrder = 1000 + order * 4; card.add(sh);
      const edge = new Mesh(faceGeometry(h / w), new MeshBasicMaterial({ color: new Color().copy(u.bgOut).multiplyScalar(0.6), toneMapped: false, depthTest: false, transparent: true }));
      edge.scale.set(w, w, 1); edge.position.set(0.012 * w, -0.03 * w, -0.0004); edge.renderOrder = 1000 + order * 4; card.add(edge);
      const ring = (grow: number, col: Color, z: number) => {
        const m = new Mesh(faceGeometry(h / w), new MeshBasicMaterial({ color: col, toneMapped: false, depthTest: false, transparent: true }));
        m.scale.set(w + grow * 2 * px, w + grow * 2 * px, 1); m.position.z = z; m.renderOrder = 1000 + order * 4; card.add(m);
      };
      if (c.lifted) ring(6, u.accent, -0.0003);
      else if (c.live) ring(3, primary, -0.0003);
      if (ink) ring(1.5, ink, -0.0002);
      const tex = faceTexture(parsed, c.text, c.wild, c.rect.w <= 90);
      // transparent pass on purpose: three draws every transparent mesh (felt glow shells, plates) after the opaque pass, so the
      // hand must be in that pass too for its high renderOrder to keep it on top. dim (not playable now) = an opaque grey tint, not alpha: a see-through face read as half-greyed where it crossed the rail
      const face = new Mesh(faceGeometry(h / w), new MeshBasicMaterial({ map: tex, toneMapped: false, depthTest: false, transparent: true, color: new Color().setScalar(c.dim ? 0.62 : 1) }));
      face.scale.set(w, w, 1); face.renderOrder = 1001 + order * 4; card.add(face);
      card.userData.key = c.key; card.name = 'hand-card';
      group.add(card); order++;
    });
    onDrawn(true); invalidate();
    return () => { group.traverse((o) => { if (o instanceof Mesh) (o.material as MeshBasicMaterial).dispose(); }); };
  }, [cards, fonts, u, size, camera, group, invalidate, onDrawn]);

  // follow the camera (static between layout changes; frameloop is on demand)
  useFrame(() => { group.position.copy(camera.position); group.quaternion.copy(camera.quaternion); });
  return <primitive object={group} />;
}
