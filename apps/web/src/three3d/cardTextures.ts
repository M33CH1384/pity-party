/**
 * V10c face textures: painted by the SAME cardArt.ts drawCard() the DOM SVG uses, onto a 256×358 canvas.
 * Only cards handed in by the hand mirror get a face (the seat's own hand, already on its screen), so no
 * other seat's face can ever be painted. Per-card cache with an LRU byte budget; mipmaps off (a face is drawn
 * near 1:1 on screen), so one face = 256×358×4 B ≈ 358 KB of GPU memory.
 * Ported from BWM src/three/cardTextures.ts (faceTexture / peekFaceTexture cache).
 */
import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from 'three';
import { type CardLike, drawCard, FACE_W } from '../cards/cardArt';
import { cardPrefs } from '../cards/cardPrefs';

export const TEX_W = 256, TEX_H = 358;
export const FACE_BYTES = TEX_W * TEX_H * 4;
/** Resident-face budget: a full Tonk / Pitty Pat hand (≤ 9) plus headroom, well under the 54-face worst case. */
export const FACE_BUDGET_BYTES = 12 * FACE_BYTES;

const cache = new Map<string, Texture>();
/** keys painted this session (exposed for the e2e leak check) */
export const painted: string[] = [];

let fontsReady: Promise<unknown> | null = null;
/** Atkinson must be loaded before the first paint, or the corner indices bake in a fallback face. */
export function cardFontsReady(): Promise<unknown> {
  return (fontsReady ??= Promise.all([document.fonts.load('700 40px "Atkinson Hyperlegible"').catch(() => null), document.fonts.ready]));
}

function accentHex(): { accent: string; accentOn: string } {
  const cs = getComputedStyle(document.documentElement);
  return { accent: cs.getPropertyValue('--pp-accent').trim(), accentOn: cs.getPropertyValue('--pp-accent-on').trim() || cs.getPropertyValue('--pp-primary-ink').trim() };
}

export function faceKey(text: string, wild: boolean, compact: boolean): string {
  return `${cardPrefs.get().suits}:${text}:${wild ? 'w' : ''}:${compact ? 'c' : ''}:${accentHex().accent}`;
}

export function faceTexture(card: CardLike, text: string, wild: boolean, compact: boolean): Texture {
  const key = faceKey(text, wild, compact);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; } // LRU touch
  const c = document.createElement('canvas'); c.width = TEX_W; c.height = TEX_H;
  drawCard(c.getContext('2d')! as never, card, { suits: cardPrefs.get().suits, wild, compact, ...accentHex() }, TEX_W / FACE_W);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace; t.generateMipmaps = false; t.minFilter = LinearFilter; t.magFilter = LinearFilter; t.anisotropy = 4;
  cache.set(key, t); painted.push(text);
  if (typeof window !== 'undefined') (window as unknown as { __pp3dFaces?: string[] }).__pp3dFaces = painted;
  while (cache.size * FACE_BYTES > FACE_BUDGET_BYTES) { const [k, old] = cache.entries().next().value as [string, Texture]; cache.delete(k); old.dispose(); }
  return t;
}
export const residentFaces = () => cache.size;
export function disposeFaces(): void { cache.forEach((t) => t.dispose()); cache.clear(); }
