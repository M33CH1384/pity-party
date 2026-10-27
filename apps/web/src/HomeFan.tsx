/**
 * Home v2 card fan (Desi logo-v3/HANDOFF-HOME-V2, approved by Demetrius Oct 27): J♥ Q♠ K♦ and a card back,
 * fanned over the sign. Pure decoration (aria-hidden, no tap target). It uses the V3 card renderer, so courts
 * stay plain lettered until the court-art licence is cleared, and the back is the theme's own back.
 */
import { memo } from 'react';
import { CardBack, CardFace } from './cards/CardFace';

const FAN = [{ rank: 11, suit: 'H' }, { rank: 12, suit: 'S' }, { rank: 13, suit: 'D' }] as const;

export const HomeFan = memo(function HomeFan() {
  return (
    <div className="home-fan" aria-hidden data-testid="home-fan">
      {FAN.map((c, i) => <span key={i} className={`hf-card hf-${i}`}><CardFace card={c} label="" /></span>)}
      <span className="hf-card hf-3"><CardBack /></span>
    </div>
  );
});
