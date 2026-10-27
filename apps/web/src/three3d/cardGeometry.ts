/**
 * V10c card geometry, ported from BWM src/three/geometry.ts: a rounded-rect face (ShapeGeometry with planar UVs)
 * and the outline ring used for the B ink edge / live and lifted rings. Unit-size (1 × 1); the fan scales each
 * card to its DOM rect, so every card shares one geometry.
 */
import { BufferAttribute, type BufferGeometry, Path, Shape, ShapeGeometry } from 'three';

function rr(s: Shape | Path, w: number, h: number, r: number) {
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
}
function remapUV(g: BufferGeometry, w: number, h: number) {
  const pos = g.getAttribute('position'); const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) + w / 2) / w; uv[i * 2 + 1] = (pos.getY(i) + h / 2) / h; }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
}
/** corner radius as a fraction of the card width (cardArt: 56 / 640) */
export const CORNER = 56 / 640;
const faces = new Map<number, BufferGeometry>();
/** Face of a card `aspect` = h / w wide 1, tall `aspect`. */
export function faceGeometry(aspect: number): BufferGeometry {
  const k = Math.round(aspect * 100);
  let g = faces.get(k);
  if (!g) { const s = new Shape(); rr(s, 1, k / 100, CORNER); g = new ShapeGeometry(s, 6); remapUV(g, 1, k / 100); faces.set(k, g); }
  return g;
}
