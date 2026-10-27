/** DOM back-end of the one card renderer (cardArt.ts): primitives → SVG (viewBox 640×896). */
import { memo } from 'react';
import { type BackColors, type CardLike, type FaceOpts, type Prim, FACE_H, FACE_W, backModel, cardModel } from './cardArt';
import { useCardPrefs } from './cardPrefs';

function Svg({ prims, cls, label }: { prims: Prim[]; cls: string; label?: string }) {
  return (
    <svg className={cls} viewBox={`0 0 ${FACE_W} ${FACE_H}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      {prims.map((p, i) => {
        if (p.k === 'rect') {
          return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r} style={{ fill: p.fill, stroke: p.stroke, strokeWidth: p.sw }} transform={p.tilt ? `rotate(${p.tilt} ${p.x + p.w / 2} ${FACE_H / 2})` : undefined} />;
        }
        if (p.k === 'img') return <image key={i} href={p.src} x={p.x} y={p.y} width={p.w} height={p.h} preserveAspectRatio="xMidYMid slice" />;
        const tf = [`translate(${p.x} ${p.y})`, p.rot ? 'rotate(180)' : '', p.sx && p.sx !== 1 ? `scale(${p.sx} 1)` : ''].join(' ');
        return <text key={i} transform={tf} textAnchor="middle" className={p.font === 'disp' ? 'cf-disp' : 'cf-card'} style={{ fill: p.fill, fontSize: p.size, fontWeight: p.weight ?? 400, letterSpacing: p.ls }}>{p.t}</text>;
      })}
    </svg>
  );
}

const ACCENT = { accent: 'var(--pp-accent)', accentOn: 'var(--pp-accent-on)' };
export const CardFace = memo(function CardFace({ card, label, wild, compact }: { card: CardLike; label: string; wild?: boolean; compact?: boolean }) {
  const { suits } = useCardPrefs();
  const o: FaceOpts = { suits, wild, compact, ...ACCENT };
  return <Svg prims={cardModel(card, o)} cls="card-face" label={label} />;
});

const BACK: BackColors = { base: 'var(--pp-card-back)', accent: 'var(--pp-card-back-stripe)', accent2: 'var(--pp-accent-2)', ink: 'var(--pp-card-back-ink)' };
/** A card back: no card prop exists, so a hidden card can only ever render this. */
export const CardBack = memo(function CardBack() { return <Svg prims={backModel(BACK)} cls="card-back" />; });
