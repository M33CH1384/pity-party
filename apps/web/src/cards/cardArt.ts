/**
 * THE card renderer (V3). One pure layout function, `cardModel`, turns a card into draw primitives in
 * Desi's 640×896 face space (stage2/HANDOFF "Cards"); two thin back-ends paint them:
 *   - DOM: <CardFace>/<CardBack> (SVG, viewBox 0 0 640 896) — 2D tables today;
 *   - canvas: `drawCard(ctx, …)` / `drawBack(ctx, …)` — the V10 three.js CanvasTexture, same code path.
 * Faces are untinted white on every theme (B needs #FFFFFF for 3:1 on the gingham; its 1.5px ink edge
 * is a CSS ring in 2D / a texture border in 3D). Suits never take the theme or the accent.
 * Hidden cards have no face: backs take NO card argument, so a back can never carry a face.
 */
import { type CourtRank, courtArt, type CourtArt } from './courtArt';

export interface CardLike { rank: number; suit: 'S' | 'H' | 'D' | 'C' | null }
export type SuitMode = 'four' | 'classic';
export const FACE_W = 640, FACE_H = 896;
/** Fixed suit inks (stage2 Tokens). Classic = black/red. */
export const SUIT_INK: Record<SuitMode, Record<'S' | 'H' | 'D' | 'C', string>> = {
  four: { S: '#111114', H: '#D1123F', D: '#0066CC', C: '#0E6E78' },
  classic: { S: '#111114', H: '#D1123F', D: '#D1123F', C: '#111114' },
};
export const FACE_FILL = '#FFFFFF';
export const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;
const RANK = ['JK', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rankText = (r: number) => RANK[r] ?? '?';

export type Prim =
  | { k: 'rect'; x: number; y: number; w: number; h: number; r: number; fill: string; stroke?: string; sw?: number; tilt?: number }
  | { k: 'text'; x: number; y: number; t: string; size: number; fill: string; weight?: number; rot?: boolean; sx?: number; font?: 'card' | 'disp'; ls?: number }
  | { k: 'img'; x: number; y: number; w: number; h: number; src: string };

export interface FaceOpts {
  suits?: SuitMode;
  /** wild deuce / joker when the table's wild rule is on: accent "W" corner tag (Desi stage2b) */
  wild?: boolean;
  /** accent fill + label colours for the W tag (CSS var() strings in the DOM, hex on canvas) */
  accent?: string; accentOn?: string;
  /** ≤ 90 css px wide: bigger corner index, a single big centre suit (no pip grid) — legible at 390 */
  compact?: boolean;
  courts?: Partial<Record<CourtRank, CourtArt>>;
}

// pip centres (x, y) for 2–10; bottom-half pips (y > 448) are drawn rotated
const L = 236, R = 404, M = 320, T = 168, B = 728, C = 448;
const Y4 = [168, 354.7, 541.3, 728];
const PIPS: Record<number, [number, number][]> = {
  2: [[M, T], [M, B]], 3: [[M, T], [M, C], [M, B]],
  4: [[L, T], [R, T], [L, B], [R, B]], 5: [[L, T], [R, T], [M, C], [L, B], [R, B]],
  6: [[L, T], [R, T], [L, C], [R, C], [L, B], [R, B]], 7: [[L, T], [R, T], [M, 308], [L, C], [R, C], [L, B], [R, B]],
  8: [[L, T], [R, T], [M, 308], [L, C], [R, C], [M, 588], [L, B], [R, B]],
  9: [...Y4.flatMap((y): [number, number][] => [[L, y], [R, y]]), [M, C]],
  10: [...Y4.flatMap((y): [number, number][] => [[L, y], [R, y]]), [M, 261], [M, 635]],
};

/** Face → primitives (pure; snapshot-tested per rank/suit). */
export function cardModel(card: CardLike, o: FaceOpts = {}): Prim[] {
  const out: Prim[] = [{ k: 'rect', x: 0, y: 0, w: FACE_W, h: FACE_H, r: 56, fill: FACE_FILL }, { k: 'rect', x: 14, y: 14, w: 612, h: 868, r: 44, fill: 'none', stroke: 'rgba(17,17,20,.14)', sw: 3 }];
  const joker = card.rank === 0 || !card.suit;
  const ink = joker ? '#111114' : SUIT_INK[o.suits ?? 'four'][card.suit!];
  const g = joker ? '★' : SUIT_GLYPH[card.suit!];
  const rt = joker ? 'JK' : rankText(card.rank);
  const sx = rt === '10' ? 0.66 : 1; // 10 condensed to 66% (Desi)
  const idx = o.compact ? { rank: 250, suit: 190, x: 92, ry: 236, sy: 420 } : { rank: 160, suit: 112, x: 76, ry: 164, sy: 274 };
  const corner = (rot: boolean) => {
    const f = (x: number, y: number): [number, number] => (rot ? [FACE_W - x, FACE_H - y] : [x, y]);
    const [ax, ay] = f(idx.x, idx.ry), [bx, by] = f(idx.x, idx.sy);
    out.push({ k: 'text', x: ax, y: ay, t: rt, size: idx.rank, fill: ink, weight: 700, rot, sx });
    out.push({ k: 'text', x: bx, y: by, t: g, size: idx.suit, fill: ink, rot });
  };
  corner(false);
  if (!o.compact) corner(true);
  if (joker) {
    out.push({ k: 'text', x: M, y: 560, t: '★', size: o.compact ? 300 : 340, fill: ink });
    if (!o.compact) out.push({ k: 'text', x: M, y: 700, t: 'JOKER', size: 72, fill: ink, weight: 700, font: 'disp', ls: 18 });
  } else if (o.compact) {
    out.push({ k: 'text', x: 420, y: 760, t: card.rank >= 11 ? rt : g, size: card.rank >= 11 ? 300 : 330, fill: ink, weight: 700 });
  } else if (card.rank === 1) {
    out.push({ k: 'text', x: M, y: 568, t: g, size: 360, fill: ink });
  } else if (card.rank >= 11) {
    const art = courtArt(rt as CourtRank, o.courts);
    out.push({ k: 'rect', x: 184, y: 96, w: 272, h: 704, r: 30, fill: 'none', stroke: ink, sw: 10 });
    if (art) out.push({ k: 'img', x: 189, y: 101, w: 262, h: 694, src: art.src });
    else {
      out.push({ k: 'text', x: M, y: 520, t: rt, size: 300, fill: ink, weight: 700, font: 'disp' });
      out.push({ k: 'text', x: M, y: 690, t: g, size: 120, fill: ink });
    }
    out.push({ k: 'rect', x: 270, y: 760, w: 100, h: 80, r: 24, fill: FACE_FILL, stroke: ink, sw: 6 });
    out.push({ k: 'text', x: M, y: 822, t: g, size: 64, fill: ink });
  } else {
    for (const [x, y] of PIPS[card.rank] ?? []) {
      const rot = y > C;
      out.push({ k: 'text', x, y: rot ? y - 36 : y + 36, t: g, size: 104, fill: ink, rot });
    }
  }
  if (o.wild) {
    out.push({ k: 'rect', x: 470, y: 30, w: 140, h: 120, r: 36, fill: o.accent ?? '#FF2EB8' });
    out.push({ k: 'text', x: 540, y: 120, t: 'W', size: 92, fill: o.accentOn ?? '#14020D', weight: 700 });
  }
  return out;
}

export interface BackColors { base: string; accent: string; accent2: string; ink: string }
/** Back → primitives. Takes NO card: a back can never leak a face. Accent stripes + accent-2 frame + medallion. */
export function backModel(c: BackColors): Prim[] {
  const out: Prim[] = [{ k: 'rect', x: 0, y: 0, w: FACE_W, h: FACE_H, r: 56, fill: c.base }];
  for (let i = -6; i < 10; i++) out.push({ k: 'rect', x: i * 96, y: -200, w: 22, h: 1300, r: 11, fill: c.accent, tilt: -30 });
  out.push({ k: 'rect', x: 40, y: 40, w: 560, h: 816, r: 36, fill: 'none', stroke: c.accent2, sw: 12 });
  out.push({ k: 'rect', x: 170, y: 318, w: 300, h: 260, r: 130, fill: c.base, stroke: c.accent2, sw: 10 });
  out.push({ k: 'text', x: M, y: 488, t: 'PP', size: 150, fill: c.ink, weight: 700, font: 'disp' });
  return out;
}

/* ---------- canvas back-end (V10 CanvasTexture; also used by tests) ---------- */
export interface Ctx2D {
  save(): void; restore(): void; translate(x: number, y: number): void; rotate(a: number): void; scale(x: number, y: number): void;
  beginPath(): void; roundRect(x: number, y: number, w: number, h: number, r: number): void; fill(): void; stroke(): void; clip(): void;
  fillText(t: string, x: number, y: number): void; drawImage?(img: unknown, x: number, y: number, w: number, h: number): void;
  fillStyle: unknown; strokeStyle: unknown; lineWidth: number; font: string; textAlign: string; textBaseline: string; letterSpacing?: string;
}
export const FONT_CARD = "'Atkinson Hyperlegible', system-ui, sans-serif";
export const FONT_DISP = "'Atkinson Hyperlegible', system-ui, sans-serif";
export function paint(ctx: Ctx2D, prims: Prim[], images: Record<string, unknown> = {}, scale = 1): void {
  ctx.save(); ctx.scale(scale, scale);
  ctx.beginPath(); ctx.roundRect(0, 0, FACE_W, FACE_H, 56); ctx.clip();
  for (const p of prims) {
    if (p.k === 'rect') {
      ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, p.r);
      if (p.tilt) { ctx.save(); ctx.translate(p.x + p.w / 2, FACE_H / 2); ctx.rotate((p.tilt * Math.PI) / 180); ctx.translate(-(p.x + p.w / 2), -FACE_H / 2); ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, p.r); ctx.fillStyle = p.fill; ctx.fill(); ctx.restore(); continue; }
      if (p.fill !== 'none') { ctx.fillStyle = p.fill; ctx.fill(); }
      if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw ?? 1; ctx.stroke(); }
    } else if (p.k === 'text') {
      ctx.save(); ctx.translate(p.x, p.y); if (p.rot) ctx.rotate(Math.PI); if (p.sx && p.sx !== 1) ctx.scale(p.sx, 1);
      ctx.font = `${p.weight ?? 400} ${p.size}px ${p.font === 'disp' ? FONT_DISP : FONT_CARD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = p.fill;
      if (p.ls && 'letterSpacing' in ctx) ctx.letterSpacing = `${p.ls}px`;
      ctx.fillText(p.t, 0, 0); ctx.restore();
    } else if (images[p.src] && ctx.drawImage) ctx.drawImage(images[p.src], p.x, p.y, p.w, p.h);
  }
  ctx.restore();
}
/** Paint one face onto a 2D context at `scale` (1 = 640×896). */
export const drawCard = (ctx: Ctx2D, card: CardLike, o: FaceOpts = {}, scale = 1, images?: Record<string, unknown>) => paint(ctx, cardModel(card, o), images, scale);
export const drawBack = (ctx: Ctx2D, c: BackColors, scale = 1) => paint(ctx, backModel(c), {}, scale);
