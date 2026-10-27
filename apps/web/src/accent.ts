/**
 * Neon Lounge accent system (visual pass V2; Desi: center/CENTER-AND-ACCENT.md, stage2/HANDOFF.md).
 * One hue drives the Lounge: 6 presets, or a custom OKLCH hue (accent = oklch(.70 .20 h), felt = oklch(.22 .07 h)).
 * Hues 95–170 (green) are blocked by snapping to the nearest preset, so the table is never green.
 * The label on accent fills (--pp-accent-on) is whichever of #14020D / #FFFFFF has the higher WCAG contrast.
 * Accent applies ONLY on Neon Lounge (C); A/B/K keep their fixed accents (Desi's answer e).
 *
 * Stored under `pp.accent.v1` as { id, hue?, follow, vars } — `vars` is the precomputed CSS custom-property
 * map (hex, so no oklch() support is needed at runtime) which public/theme-boot.js applies before first paint.
 * Magenta with "Felt follows colour" on is the CSS default, so it writes no inline vars at all.
 */
import { useSyncExternalStore } from 'react';

export const ACCENT_KEY = 'pp.accent.v1';
export type PresetId = 'magenta' | 'blue' | 'violet' | 'ember' | 'mint' | 'crimson';
export type AccentId = PresetId | 'custom';
export interface Preset { id: PresetId; name: string; accent: string; felt: string; secondary: string }
export const PRESETS: readonly Preset[] = [
  { id: 'magenta', name: 'Magenta', accent: '#FF2EB8', felt: '#3A0D1A', secondary: '#33E6FF' },
  { id: 'blue', name: 'Electric Blue', accent: '#2E8BFF', felt: '#0B1A3D', secondary: '#FF4FD8' },
  { id: 'violet', name: 'Ultraviolet', accent: '#9B5CFF', felt: '#1D0F3D', secondary: '#33E6FF' },
  { id: 'ember', name: 'Ember', accent: '#FF6A2E', felt: '#3A1208', secondary: '#33E6FF' },
  { id: 'mint', name: 'Mint', accent: '#2EF2C0', felt: '#0C1A30', secondary: '#FF4FD8' },
  { id: 'crimson', name: 'Crimson', accent: '#FF3355', felt: '#3A0A12', secondary: '#33E6FF' },
];
export const DEFAULT_ACCENT: AccentId = 'magenta';
/** The C-theme felt when "Felt follows colour" is off (theme.css C value). */
export const LOUNGE_FELT = '#3A0D1A';
export const LABEL_DARK = '#14020D';
export const GREEN_MIN = 95;
export const GREEN_MAX = 170;

/* ---------- colour maths ---------- */
type RGB = [number, number, number];
export const hexRgb = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
export const rgbHex = ([r, g, b]: RGB): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const gam = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export const luminance = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export const contrast = (a: RGB, b: RGB) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };

/** OKLCH → sRGB, chroma reduced until in gamut (CSS Color 4 style gamut mapping, simplified). */
export function oklchHex(L: number, C: number, h: number): string {
  for (let c = C; c >= 0; c -= 0.005) {
    const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
    const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const lr = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
    if ([lr, lg, lb].every((v) => v >= -0.0005 && v <= 1.0005)) return rgbHex([gam(lr), gam(lg), gam(lb)].map((v) => Math.min(255, Math.max(0, v))) as RGB);
  }
  return '#808080';
}
/** sRGB hex → OKLCH hue (degrees). */
export function hexHue(hex: string): number {
  const [r, g, b] = hexRgb(hex).map(lin) as RGB;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hueDist = (x: number, y: number) => { const d = Math.abs(x - y) % 360; return d > 180 ? 360 - d : d; };

export const isGreen = (h: number) => h >= GREEN_MIN && h <= GREEN_MAX;
/** Nearest preset (by OKLCH hue) — used to snap blocked green hues. */
export function nearestPreset(h: number): Preset {
  return [...PRESETS].sort((p, q) => hueDist(hexHue(p.accent), h) - hueDist(hexHue(q.accent), h))[0]!;
}
/** Label colour on an accent fill: the higher-contrast of #14020D / #FFFFFF. */
export function accentOn(accent: string): string {
  const a = hexRgb(accent);
  return contrast(hexRgb(LABEL_DARK), a) >= contrast([255, 255, 255], a) ? LABEL_DARK : '#FFFFFF';
}

export interface AccentPick { id: AccentId; hue?: number; follow: boolean }
export interface Resolved { id: AccentId; hue: number; accent: string; felt: string; secondary: string; on: string }

/** Pick → colours. A custom hue in the green band snaps to the nearest preset. */
export function resolveAccent(p: AccentPick): Resolved {
  let preset = PRESETS.find((x) => x.id === p.id);
  if (!preset && p.id === 'custom') {
    const h = (((p.hue ?? 0) % 360) + 360) % 360;
    if (isGreen(h)) preset = nearestPreset(h);
    else {
      const accent = oklchHex(0.7, 0.2, h);
      // secondary flips to pink for blue/cyan/mint hues so it stays distinct from the accent (Desi)
      const secondary = h > GREEN_MAX && h < 275 ? '#FF4FD8' : '#33E6FF';
      return { id: 'custom', hue: Math.round(h), accent, felt: oklchHex(0.22, 0.07, h), secondary, on: accentOn(accent) };
    }
  }
  preset ??= PRESETS[0]!;
  return { id: preset.id, hue: Math.round(hexHue(preset.accent)), accent: preset.accent, felt: preset.felt, secondary: preset.secondary, on: accentOn(preset.accent) };
}

const trip = (c: RGB) => c.map((v) => Math.round(v)).join(', ');
/** CSS custom properties for Neon Lounge. Empty for the CSS default (Magenta, felt following). */
export function accentVars(p: AccentPick): Record<string, string> {
  const r = resolveAccent(p);
  if (r.id === 'magenta' && p.follow) return {};
  const a = hexRgb(r.accent), w: RGB = [255, 255, 255], k: RGB = [0, 0, 0];
  const hot = rgbHex(mix(a, w, 0.3)), deep = rgbHex(mix(a, k, 0.28));
  return {
    '--pp-accent-h': String(r.hue),
    '--pp-accent': r.accent, '--pp-accent-rgb': trip(a), '--pp-accent-hot': hot, '--pp-accent-deep-rgb': trip(mix(a, k, 0.53)), '--pp-edge-rgb': trip(a),
    '--pp-primary': r.accent, '--pp-primary-rgb': trip(a), '--pp-primary-deep': deep, '--pp-primary-hi': hot, '--pp-primary-hi-rgb': trip(hexRgb(hot)),
    '--pp-primary-ink': r.on, '--pp-primary-grad': `linear-gradient(180deg, ${hot}, ${r.accent} 45%, ${deep})`,
    '--pp-accent-2': r.secondary, '--pp-accent-2-rgb': trip(hexRgb(r.secondary)), '--pp-info-rgb': trip(hexRgb(r.secondary)), '--pp-cyan-rgb': trip(hexRgb(r.secondary)),
    '--pp-felt': p.follow ? r.felt : LOUNGE_FELT,
  };
}

/* ---------- store ---------- */
const isId = (x: unknown): x is AccentId => x === 'custom' || PRESETS.some((p) => p.id === x);
export function parseAccent(raw: string | null): AccentPick {
  try {
    const j = raw ? (JSON.parse(raw) as Partial<AccentPick> | null) : null;
    if (j && isId(j.id)) return { id: j.id, hue: typeof j.hue === 'number' && Number.isFinite(j.hue) ? j.hue : undefined, follow: j.follow !== false };
  } catch { /* corrupt → default */ }
  return { id: DEFAULT_ACCENT, follow: true };
}
function load(): AccentPick { try { return parseAccent(localStorage.getItem(ACCENT_KEY)); } catch { return { id: DEFAULT_ACCENT, follow: true }; } }

let pick: AccentPick = load();
const listeners = new Set<() => void>();
let applied: string[] = [];

/** Writes (on C) or clears (on A/B/K) the inline accent vars on <html>. Called by theme.applyTheme too. */
export function applyAccent(theme: string, p: AccentPick = pick): void {
  if (typeof document === 'undefined') return;
  const st = (document.documentElement as HTMLElement).style;
  if (!st) return;
  for (const k of applied) st.removeProperty(k);
  applied = [];
  if (theme !== 'C') return;
  for (const [k, v] of Object.entries(accentVars(p))) { st.setProperty(k, v); applied.push(k); }
}
/** Pre-paint (theme-boot.js) may already have set vars: adopt them so a later change clears them. */
export function adoptBootVars(): void { applied = Object.keys(accentVars({ ...pick, id: 'custom', hue: 0 })); }

export const accentStore = {
  get: (): AccentPick => pick,
  set(p: AccentPick, theme: string): void {
    pick = p.id === 'custom' && p.hue !== undefined && isGreen(((p.hue % 360) + 360) % 360) ? { ...p, id: nearestPreset(p.hue).id, hue: undefined } : p;
    try { localStorage.setItem(ACCENT_KEY, JSON.stringify({ ...pick, vars: accentVars(pick) })); } catch { /* ignore */ }
    applyAccent(theme);
    listeners.forEach((f) => f());
  },
  subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
};
export const useAccent = (): AccentPick => useSyncExternalStore(accentStore.subscribe, accentStore.get, accentStore.get);
