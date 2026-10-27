/**
 * V10c 3D hand fan. Each card is a camera-attached quad at its DOM card's rect (the DOM hand stays the input
 * layer), with a slight fan tilt per row, a primary ring on playable cards, an accent plate behind the lifted
 * (Tonk-picked) card, and in theme B the 1.5px ink edge on every face. Faces are unlit MeshBasic with tone
 * mapping off, so B's pure-white faces stay untinted. Ported from BWM Card3D's hand path (handLift fan pose).
 */
import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Group, Mesh, MeshBasicMaterial, type PerspectiveCamera } from 'three';
import type { MirrorCard } from './handMirror';
import { parseCardText } from './handMirror';
import { cardFontsReady, faceTexture } from './cardTextures';
import { faceGeometry } from './cardGeometry';
import type { ThemeUniforms } from './themeUniforms';

const D = 1; // camera-local depth of the hand plane
/** fan tilt per card from the row centre (deg), capped; small so the quad never leaves its DOM tap rect */
export function fanTilt(i: number, n: number): number { const step = Math.min(3, 12 / Math.max(1, n - 1)); return (i - (n - 1) / 2) * step; }

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
      card.position.set((c.rect.x + c.rect.w / 2 - size.width / 2) * px, (size.height / 2 - (c.rect.y + c.rect.h / 2)) * px, -D);
      card.rotation.z = (-fanTilt(i, row.length) * Math.PI) / 180;
      const ring = (grow: number, col: Color, z: number) => {
        const m = new Mesh(faceGeometry(h / w), new MeshBasicMaterial({ color: col, toneMapped: false, depthTest: false }));
        m.scale.set(w + grow * 2 * px, w + grow * 2 * px, 1); m.position.z = z; m.renderOrder = 1000 + order * 4; card.add(m);
      };
      if (c.lifted) ring(6, u.accent, -0.0003);
      else if (c.live) ring(3, primary, -0.0003);
      if (ink) ring(1.5, ink, -0.0002);
      const tex = faceTexture(parsed, c.text, c.wild, c.rect.w <= 90);
      // dim (not playable now) = an opaque grey tint, not alpha: a see-through face read as half-greyed where it crossed the rail
      const face = new Mesh(faceGeometry(h / w), new MeshBasicMaterial({ map: tex, toneMapped: false, depthTest: false, color: new Color().setScalar(c.dim ? 0.62 : 1) }));
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
