/** V2 Lounge colour: presets reproduce Desi's accent-checks.json, the green band is blocked, custom hues stay
 *  legible, vars only apply on Neon Lounge, and theme-boot.js applies them before paint. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESETS, accentOn, accentVars, contrast, hexHue, hexRgb, isGreen, oklchHex, resolveAccent, parseAccent, LABEL_DARK, LOUNGE_FELT } from '../src/accent';

const checks = JSON.parse(readFileSync(join(__dirname, 'fixtures/accent-checks.json'), 'utf8')) as Record<string, { accent: string; felt: string; secondary: string; label: string; label_contrast: number; accent_on_plate: number; secondary_on_plate: number; card_vs_felt: number }>;
const PLATE = hexRgb('#141418');

describe('presets = accent-checks.json', () => {
  it('six presets with the spec colours', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['magenta', 'blue', 'violet', 'ember', 'mint', 'crimson']);
    for (const p of PRESETS) {
      const c = checks[p.id]!;
      expect([p.accent, p.felt.toUpperCase(), p.secondary], p.id).toEqual([c.accent, c.felt.toUpperCase(), c.secondary]);
    }
  });
  it('contrast numbers reproduce (label on accent, accent + secondary on plate, card on felt)', () => {
    for (const p of PRESETS) {
      const c = checks[p.id]!;
      expect(accentOn(p.accent), p.id).toBe(c.label);
      expect(contrast(hexRgb(c.label), hexRgb(p.accent))).toBeCloseTo(c.label_contrast, 1);
      expect(contrast(hexRgb(p.accent), PLATE)).toBeCloseTo(c.accent_on_plate, 1);
      expect(contrast(hexRgb(p.secondary), PLATE)).toBeCloseTo(c.secondary_on_plate, 1);
      expect(contrast([255, 255, 255], hexRgb(p.felt))).toBeCloseTo(c.card_vs_felt, 1);
    }
  });
});

describe('custom hue', () => {
  it('blocks greens: every hue 95–170 snaps to a preset', () => {
    for (let h = 95; h <= 170; h++) { expect(isGreen(h)).toBe(true); expect(resolveAccent({ id: 'custom', hue: h, follow: true }).id, `h=${h}`).not.toBe('custom'); }
    expect(isGreen(94)).toBe(false); expect(isGreen(171)).toBe(false);
    expect(resolveAccent({ id: 'custom', hue: 165, follow: true }).id).toBe('mint');
  });
  it('every allowed hue stays legible: label ≥ 4.5, accent on plate ≥ 4.5, card on felt ≥ 15, felt not green', () => {
    for (let h = 0; h < 360; h += 3) {
      if (isGreen(h)) continue;
      const r = resolveAccent({ id: 'custom', hue: h, follow: true });
      expect(contrast(hexRgb(r.on), hexRgb(r.accent)), `h=${h} label`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hexRgb(r.accent), PLATE), `h=${h} plate`).toBeGreaterThanOrEqual(4.5);
      expect(contrast([255, 255, 255], hexRgb(r.felt)), `h=${h} felt`).toBeGreaterThanOrEqual(15);
      expect(contrast(hexRgb(r.secondary), PLATE)).toBeGreaterThanOrEqual(6);
      const fh = hexHue(r.felt); expect(isGreen(fh), `h=${h} felt hue ${fh}`).toBe(false);
    }
  });
  it('oklch maths round-trips the hue', () => {
    for (const h of [0, 30, 60, 200, 250, 300, 340]) { const d = Math.abs(hexHue(oklchHex(0.7, 0.2, h)) - h) % 360; expect(Math.min(d, 360 - d)).toBeLessThan(3); }
  });
  it('label colour is always the dark #14020D on the presets', () => { for (const p of PRESETS) expect(accentOn(p.accent)).toBe(LABEL_DARK); });
});

describe('vars + store', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  it('Magenta with felt following is the CSS default: no inline vars', () => {
    expect(accentVars({ id: 'magenta', follow: true })).toEqual({});
    expect(accentVars({ id: 'magenta', follow: false })['--pp-felt']).toBe(LOUNGE_FELT);
    const v = accentVars({ id: 'blue', follow: true });
    expect(v['--pp-accent']).toBe('#2E8BFF'); expect(v['--pp-felt']).toBe('#0B1A3D'); expect(v['--pp-accent-2']).toBe('#FF4FD8'); expect(v['--pp-primary-ink']).toBe(LABEL_DARK);
    expect(accentVars({ id: 'blue', follow: false })['--pp-felt']).toBe(LOUNGE_FELT);
  });
  it('parse: corrupt / unknown → Magenta, felt follows by default', () => {
    expect(parseAccent(null)).toEqual({ id: 'magenta', follow: true });
    expect(parseAccent('{bad')).toEqual({ id: 'magenta', follow: true });
    expect(parseAccent('{"id":"green"}')).toEqual({ id: 'magenta', follow: true });
    expect(parseAccent('{"id":"custom","hue":250,"follow":false}')).toEqual({ id: 'custom', hue: 250, follow: false });
  });
  it('accent only applies on Neon Lounge: switching theme clears the inline vars; store snaps greens + persists vars', async () => {
    const ls = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => { ls.set(k, v); } });
    const props = new Map<string, string>();
    const meta = { setAttribute() {} };
    vi.stubGlobal('document', { documentElement: { dataset: {}, style: { setProperty: (k: string, v: string) => props.set(k, v), removeProperty: (k: string) => props.delete(k) } }, querySelector: () => meta });
    const theme = await import('../src/theme');
    const acc = await import('../src/accent');
    theme.themeStore.set('C');
    acc.accentStore.set({ id: 'ember', follow: true }, 'C');
    expect(props.get('--pp-accent')).toBe('#FF6A2E');
    expect(JSON.parse(ls.get('pp.accent.v1')!).vars['--pp-accent']).toBe('#FF6A2E');
    theme.themeStore.set('B');
    expect(props.size).toBe(0);
    theme.themeStore.set('C');
    expect(props.get('--pp-felt')).toBe('#3A1208');
    acc.accentStore.set({ id: 'custom', hue: 130, follow: true }, 'C');
    expect(acc.accentStore.get().id).not.toBe('custom');
  });
});

describe('theme-boot.js applies the Lounge colour before paint', () => {
  const boot = readFileSync(join(__dirname, '../public/theme-boot.js'), 'utf8');
  const run = (seed: Record<string, string>) => {
    const props: Record<string, string> = {};
    const de = { dataset: {} as Record<string, string>, style: { setProperty: (k: string, v: string) => { props[k] = v; } } };
    runInNewContext(boot, { localStorage: { getItem: (k: string) => seed[k] ?? null, setItem() {} }, document: { documentElement: de, querySelector: () => null }, JSON });
    return { theme: de.dataset.theme, props };
  };
  const stored = JSON.stringify({ id: 'blue', follow: true, vars: accentVars({ id: 'blue', follow: true }) });
  it('C + stored blue → vars set; B → none; hostile names/values are ignored', () => {
    expect(run({ 'pp.accent.v1': stored }).props['--pp-accent']).toBe('#2E8BFF');
    expect(run({ 'pp.theme.v1': '{"theme":"B"}', 'pp.accent.v1': stored }).props).toEqual({});
    const bad = JSON.stringify({ vars: { 'color': 'red', '--pp-x': 'url(javascript:1)', '--pp-ok': '#123456' } });
    expect(run({ 'pp.accent.v1': bad }).props).toEqual({ '--pp-ok': '#123456' });
  });
});

describe('V2 fonts: self-hosted, per theme, swap', () => {
  const css = readFileSync(join(__dirname, '../src/fonts.css'), 'utf8');
  const theme = readFileSync(join(__dirname, '../src/theme.css'), 'utf8');
  it('every face is a local woff2 with font-display: swap (no font CDN; CSP font-src self)', () => {
    const faces = [...css.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => m[1]!);
    expect(faces.length).toBeGreaterThanOrEqual(20);
    for (const f of faces) {
      expect(f).toContain('font-display: swap');
      const url = /url\('([^']+)'\)/.exec(f)![1]!;
      expect(url).toMatch(/^\/fonts\/[a-z-]+-latin-\d+-normal\.woff2$/);
      expect(existsSync(join(__dirname, '../public', url)), url).toBe(true);
    }
    expect(css + theme).not.toMatch(/fonts\.(googleapis|gstatic)|https?:\/\//);
  });
  it('each theme names its pair (stage1b theme.js); Atkinson on card indices', () => {
    const want = { C: ['Unbounded', 'Space Grotesk'], A: ['Shrikhand', 'Nunito'], B: ['Fraunces', 'Figtree'], K: ['Barlow Condensed', 'Barlow'] };
    for (const [id, [d, u]] of Object.entries(want)) {
      const block = new RegExp(`html\\[data-theme="${id}"\\] \\{([^}]*--pp-font-disp[^}]*)\\}`).exec(theme)![1]!;
      expect(block, id).toContain(`--pp-font-disp: '${d}'`);
      expect(block, id).toContain(`--pp-font-ui: '${u}'`);
      expect(css).toContain(`font-family: '${d}'`); expect(css).toContain(`font-family: '${u}'`);
    }
    expect(theme).toContain("--pp-font-card: 'Atkinson Hyperlegible'");
  });
  it('the bundled @fontsource import is gone (fonts load from /fonts on demand)', () => {
    expect(readFileSync(join(__dirname, '../src/main.tsx'), 'utf8')).not.toContain('@fontsource');
  });
});
