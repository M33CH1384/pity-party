/** Test helper (V1): read a theme's token values from theme.css and compute WCAG contrast. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Rgb = [number, number, number];
export const THEME_IDS = ['A', 'B', 'C', 'K'] as const;
const css = readFileSync(join(__dirname, '../src/theme.css'), 'utf8');

/** The token block for a theme (`html[data-theme="X"]`; C also owns :root). */
export function themeVars(id: (typeof THEME_IDS)[number]): Map<string, string> {
  const at = css.indexOf(`html[data-theme="${id}"] {`);
  const block = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  return new Map([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}
export const hexRgb = (hex: string): Rgb => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
export const tripletRgb = (t: string): Rgb => t.split(',').map((x) => Number(x.trim())) as Rgb;
/** Resolve `rgba(var(--x-rgb), a)` / `rgba(r, g, b, a)` against a theme. */
export function rgbaIn(vars: Map<string, string>, value: string): { rgb: Rgb; a: number } {
  const v = value.match(/rgba\(\s*var\((--[\w-]+)\)\s*,\s*([\d.]+)\s*\)/);
  if (v) return { rgb: tripletRgb(vars.get(v[1]!)!), a: Number(v[2]) };
  const l = value.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/)!;
  return { rgb: [Number(l[1]), Number(l[2]), Number(l[3])], a: Number(l[4]) };
}
export const over = (fg: Rgb, a: number, bg: Rgb): Rgb => [0, 1, 2].map((i) => Math.round(a * fg[i]! + (1 - a) * bg[i]!)) as unknown as Rgb;
const lum = (rgb: Rgb): number => {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
export const contrast = (a: Rgb, b: Rgb): number => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
