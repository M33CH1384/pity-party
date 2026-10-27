/**
 * Court-art manifest (V3). Courts are drawn TYPOGRAPHICALLY until the court-art licence clears
 * (stage2/HANDOFF "Assets & licences": the J/Q/K art is AI-generated, commercial terms unconfirmed).
 * To swap art in: drop WebP files (≤ 40 KB, same-origin so CSP img-src 'self' holds) into
 * public/court/ and fill the entries below with `licence` set. An entry without a licence is ignored,
 * and a missing/failed image falls back to the lettered court. The same J/Q/K art is reused across
 * suits; only the frame and badge take the suit colour.
 */
export interface CourtArt { src: string; licence: string }
export type CourtRank = 'J' | 'Q' | 'K';
export const COURT_ART: Partial<Record<CourtRank, CourtArt>> = {
  // J: { src: '/court/J.webp', licence: '…' },
};
export function courtArt(r: CourtRank, manifest: Partial<Record<CourtRank, CourtArt>> = COURT_ART): CourtArt | null {
  const a = manifest[r];
  return a && a.src.startsWith('/') && a.licence.trim() ? a : null;
}
