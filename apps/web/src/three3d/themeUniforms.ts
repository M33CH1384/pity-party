/**
 * V10b: one table, re-tinted per theme. Everything colour-ish comes from CSS custom properties on <html>
 * (theme.css: the theme tokens + the fixed --pp-3d-* values from Desi's V10-3D-SPEC §1), read with
 * getComputedStyle, so A / B / C / K and the C accent presets are re-tints and never rebuild geometry.
 * Lazy-chunk only (imports three).
 */
import { Color } from 'three';

export type ThemeId = 'A' | 'B' | 'C' | 'K';
export interface ThemeUniforms {
  theme: ThemeId;
  felt: Color; feltSheen: Color; accent: Color; accent2: Color; plate: string;
  rail: Color; railRough: number; railSheen: number; railSheenColor: Color;
  trim: Color; trimEmissive: number; wood: Color; disc: Color; spade: Color; lip: Color; ginghamBand: string;
  hemiSky: Color; hemiGround: Color; hemi: number; key: Color;
  exposure: number; neon: number; env: number; bgIn: Color; bgOut: Color;
  /** B: gingham felt, no glow anywhere */
  gingham: boolean; glow: boolean;
}

const css = (cs: CSSStyleDeclaration, k: string) => cs.getPropertyValue(k).trim();
/** a CSS colour three can parse (hex / rgb / rgba -> alpha dropped), or null */
function col(v: string): Color | null {
  if (!v || !/^(#|rgba?\()/.test(v)) return null; // 'auto' / unset → caller's computed fallback
  const m = /^rgba?\(([^)]+)\)$/.exec(v);
  try {
    if (m) { const [r, g, b, a] = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number); if (a !== undefined && a < 0.99) return null; return new Color().setRGB(r! / 255, g! / 255, b! / 255, 'srgb'); }
    return new Color().setStyle(v, 'srgb');
  } catch { return null; }
}
const num = (v: string, d: number) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

export function themeUniforms(root: HTMLElement = document.documentElement): ThemeUniforms {
  const cs = getComputedStyle(root);
  const t = (root.dataset.theme ?? 'C') as ThemeId;
  const theme: ThemeId = t === 'A' || t === 'B' || t === 'K' ? t : 'C';
  const c = (k: string) => col(css(cs, k)) ?? new Color();
  const felt = c('--pp-felt'); const accent = c('--pp-accent'); const accent2 = c('--pp-accent-2');
  // --pp-felt-sheen is the 2D translucent sheen; if a theme sets an opaque one it wins, else the spec's per-theme value,
  // else (C) felt lerped 35% to the accent in linear space (§1e).
  const feltSheen = col(css(cs, '--pp-felt-sheen')) ?? col(css(cs, '--pp-3d-sheen')) ?? felt.clone().lerp(accent, 0.35);
  const bgOut = c('--pp-3d-bg-out');
  return {
    theme, felt, feltSheen, accent, accent2, plate: css(cs, '--pp-plate'),
    rail: c('--pp-3d-rail'), railRough: num(css(cs, '--pp-3d-rail-rough'), 0.45), railSheen: num(css(cs, '--pp-3d-rail-sheen'), 0), railSheenColor: c('--pp-3d-rail-sheen-color'),
    trim: c('--pp-3d-trim'), trimEmissive: num(css(cs, '--pp-3d-trim-emissive'), 0), wood: c('--pp-3d-wood'), disc: c('--pp-3d-disc'), spade: c('--pp-3d-spade'), lip: c('--pp-3d-lip'), ginghamBand: css(cs, '--pp-3d-gingham-band'),
    hemiSky: c('--pp-3d-sky'), hemiGround: c('--pp-3d-gnd'), hemi: num(css(cs, '--pp-3d-hemi'), 0.22), key: c('--pp-3d-key'),
    exposure: num(css(cs, '--pp-3d-exp'), 1), neon: num(css(cs, '--pp-3d-neon'), 0.5), env: num(css(cs, '--pp-3d-env'), 0.4),
    bgIn: col(css(cs, '--pp-3d-bg-in')) ?? bgOut.clone().lerp(accent, 0.1), bgOut,
    gingham: theme === 'B', glow: theme !== 'B',
  };
}

/** Re-read on theme / accent changes (the accent presets write inline style on <html>). */
export function watchTheme(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent', 'style', 'class'] });
  return () => mo.disconnect();
}
