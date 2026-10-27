/**
 * V10c face textures: painted by the SAME cardArt.ts drawCard() the DOM SVG uses, onto a 256×358 canvas.
 * Only cards handed in by the hand mirror get a face (the seat's own hand, already on its screen), so no
 * other seat's face can ever be painted. Per-card cache with an LRU byte budget; mipmaps off (a face is drawn
 * near 1:1 on screen), so one face = 256×358×4 B ≈ 358 KB of GPU memory.
 * Ported from BWM src/three/cardTextures.ts (faceTexture / peekFaceTexture cache).
 */
import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from 'three';
import { type CardLike, drawBack, drawCard, FACE_W, FONT_CARD } from '../cards/cardArt';
import { parseCardText as parse } from './handMirror';
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

/**
 * V10d table cards (upcard, shelves, flights): the same drawCard at 160×224 (≈143 KB each). A table card is ~66–99 CSS px
 * tall on screen, so 224 device px stays sharp at DPR 2. Separate LRU of 16 (≈2.3 MB): only the upcard and each seat's TOP
 * pair are ever face-up on the felt (older pairs stack under it), so ≤ 10 are live at once.
 */
export const TT_W = 160, TT_H = 224;
export const TABLE_FACE_BYTES = TT_W * TT_H * 4;
export const TABLE_FACE_BUDGET_BYTES = 16 * TABLE_FACE_BYTES;
const tcache = new Map<string, Texture>();
export const tablePainted: string[] = [];
function canvasTex(w: number, h: number, paintFn: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; paintFn(c.getContext('2d')!);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.generateMipmaps = false; t.minFilter = LinearFilter; t.magFilter = LinearFilter; t.anisotropy = 4;
  return t;
}
/** V10e Tonk spread cards (shown at .72 table scale, ~45–70 CSS px tall): 112×157 (≈70 KB), own LRU of 40 (≈2.8 MB). */
export const ST_W = 112, ST_H = 157;
export const SPREAD_FACE_BYTES = ST_W * ST_H * 4;
export const SPREAD_FACE_BUDGET_BYTES = 40 * SPREAD_FACE_BYTES;
const scache = new Map<string, Texture>();
export function tableFaceTexture(text: string, wild: boolean, small = false): Texture | null {
  const card = parse(text); if (!card) return null;
  const key = faceKey(text, wild, false);
  const [c, w, h, budget, each] = small ? [scache, ST_W, ST_H, SPREAD_FACE_BUDGET_BYTES, SPREAD_FACE_BYTES] : [tcache, TT_W, TT_H, TABLE_FACE_BUDGET_BYTES, TABLE_FACE_BYTES];
  const hit = c.get(key);
  if (hit) { c.delete(key); c.set(key, hit); return hit; }
  const t = canvasTex(w, h, (g) => drawCard(g as never, card, { suits: cardPrefs.get().suits, wild, ...accentHex() }, w / FACE_W));
  c.set(key, t); tablePainted.push(text);
  if (typeof window !== 'undefined') (window as unknown as { __pp3dTableFaces?: string[] }).__pp3dTableFaces = tablePainted;
  while (c.size * each > budget) { const [k, old] = c.entries().next().value as [string, Texture]; c.delete(k); old.dispose(); }
  return t;
}
export const residentTableFaces = () => tcache.size;

const cssv = (k: string) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
let back: { key: string; t: Texture } | null = null;
/** One shared card back (same backModel as the DOM CardBack, colours resolved from the theme tokens). */
export function backTexture(): Texture {
  const c = { base: cssv('--pp-card-back'), accent: cssv('--pp-card-back-stripe'), accent2: cssv('--pp-accent-2'), ink: cssv('--pp-card-back-ink') };
  const key = Object.values(c).join('|');
  if (back?.key === key) return back.t;
  back?.t.dispose();
  back = { key, t: canvasTex(TT_W, TT_H, (g) => drawBack(g as never, c, TT_W / FACE_W)) };
  return back.t;
}

export interface PlateInfo { name: string; pts: string; sub: string; turn: boolean; out: boolean; me: boolean; hi?: boolean }
export const PLATE_W = 320, PLATE_H = 112;
/** A seat plate (name, points, cards · pairs) painted in the theme's plate tokens. Caller disposes. */
export function plateTexture(p: PlateInfo): CanvasTexture {
  return canvasTex(PLATE_W, PLATE_H, (g) => {
    const r = 22, ring = p.turn || p.hi ? 7 : 3;
    g.globalAlpha = p.out ? 0.6 : 1;
    g.fillStyle = cssv('--pp-plate') || cssv('--pp-surface-2'); g.beginPath(); g.roundRect(ring, ring, PLATE_W - 2 * ring, PLATE_H - 2 * ring, r); g.fill();
    g.lineWidth = ring; g.strokeStyle = p.hi ? cssv('--pp-accent') : p.turn ? cssv('--pp-primary') : cssv('--pp-ink'); g.stroke();
    g.fillStyle = cssv('--pp-ink'); g.textBaseline = 'alphabetic';
    g.font = `700 34px ${FONT_CARD}`; g.fillText(fit(g, p.name, 190), 22, 50);
    if (p.me) g.fillRect(22, 56, Math.min(190, g.measureText(p.name).width), 3);
    g.textAlign = 'right'; g.font = `800 40px ${FONT_CARD}`; g.fillText(p.pts, PLATE_W - 22, 52); g.textAlign = 'left';
    g.font = `600 26px ${FONT_CARD}`; g.fillText(fit(g, p.sub, PLATE_W - 44), 22, 92);
  });
}
function fit(g: CanvasRenderingContext2D, s: string, w: number): string {
  if (g.measureText(s).width <= w) return s;
  let t = s; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1);
  return t + '…';
}
/** A small round count badge (the stock count). Caller disposes. */
export function badgeTexture(text: string): CanvasTexture {
  return canvasTex(96, 64, (g) => {
    g.fillStyle = cssv('--pp-plate') || cssv('--pp-surface-2'); g.beginPath(); g.roundRect(3, 3, 90, 58, 29); g.fill();
    g.lineWidth = 3; g.strokeStyle = cssv('--pp-ink'); g.stroke();
    g.fillStyle = cssv('--pp-ink'); g.font = `800 36px ${FONT_CARD}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 48, 34);
  });
}
