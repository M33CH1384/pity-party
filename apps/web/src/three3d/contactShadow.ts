/** V10g-4: one shared 64px soft contact-shadow mask (alpha only, painted black → transparent) for table cards and piles.
 *  No shadow maps: a flat blob just above the felt grounds each pile on every quality tier (4 KB of GPU memory). */
import { CanvasTexture } from 'three';

let tex: CanvasTexture | null = null;
export function contactTexture(): CanvasTexture {
  if (tex) return tex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 6, 32, 32, 32); r.addColorStop(0, 'black'); r.addColorStop(0.55, 'black'); r.addColorStop(1, 'transparent');
  g.globalAlpha = 1; g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  tex = new CanvasTexture(c);
  return tex;
}
