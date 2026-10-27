/** Visual pass V1: the four-theme store (A/B/C/K, default C), the one-time migration off BWM's key,
 *  the pre-paint script, the Settings tiles + Home chip, and per-theme token parity. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_IDS, contrast, hexRgb, themeVars } from './themeTokens';

const KEY = 'pp.theme.v1';
const OLD = 'bwm.theme.v1';

function installStorage(seed: Record<string, string> = {}) {
  const ls = new Map<string, string>(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => { ls.set(k, v); },
    removeItem: (k: string) => { ls.delete(k); },
    clear: () => { ls.clear(); },
  });
  return ls;
}
function installDocument() {
  const meta = { attrs: new Map<string, string>(), setAttribute(k: string, v: string) { this.attrs.set(k, v); } };
  const doc = { documentElement: { dataset: {} as Record<string, string> }, querySelector: (s: string) => (s === 'meta[name="theme-color"]' ? meta : null) };
  vi.stubGlobal('document', doc);
  return { doc, meta };
}
async function freshTheme() { vi.resetModules(); return import('../src/theme'); }

describe('theme store', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a fresh visitor (nothing stored anywhere) gets C, Neon Lounge, and nothing is written', async () => {
    const ls = installStorage();
    const t = await freshTheme();
    expect(t.themeStore.get()).toBe('C');
    expect(t.DEFAULT_THEME).toBe('C');
    expect(ls.has(KEY)).toBe(false);
  });

  it('migrates the old BWM key once: neon → C, classic → K, corrupt → C; writes the new key, leaves the old one', async () => {
    for (const [old, want] of [['{"theme":"neon"}', 'C'], ['{"theme":"classic"}', 'K'], ['{oops', 'C'], ['{"theme":"blue"}', 'C']] as const) {
      const ls = installStorage({ [OLD]: old });
      const t = await freshTheme();
      expect(t.themeStore.get(), old).toBe(want);
      expect(ls.get(KEY), old).toBe(JSON.stringify({ theme: want }));
      expect(ls.get(OLD), 'old key untouched (it belongs to BWM)').toBe(old);
    }
  });

  it('the new key wins over the old one; an unknown new value falls back to migration/default', async () => {
    installStorage({ [KEY]: '{"theme":"B"}', [OLD]: '{"theme":"classic"}' });
    expect((await freshTheme()).themeStore.get()).toBe('B');
    installStorage({ [KEY]: '{"theme":"neon"}', [OLD]: '{"theme":"classic"}' });
    expect((await freshTheme()).themeStore.get()).toBe('K');
  });

  it('parseTheme / migrateOld are pure', async () => {
    installStorage();
    const { parseTheme, migrateOld } = await freshTheme();
    for (const k of ['A', 'B', 'C', 'K']) expect(parseTheme(JSON.stringify({ theme: k }))).toBe(k);
    expect(parseTheme('{"theme":"neon"}')).toBeNull();
    expect(parseTheme(null)).toBeNull();
    expect(migrateOld(null)).toBe('C');
    expect(migrateOld('{"theme":"neon"}')).toBe('C');
    expect(migrateOld('{"theme":"classic"}')).toBe('K');
  });

  it('set persists; subscribers are notified and can unsubscribe', async () => {
    const ls = installStorage();
    const t = await freshTheme();
    const seen: string[] = [];
    const off = t.themeStore.subscribe(() => seen.push(t.themeStore.get()));
    t.themeStore.set('A');
    off();
    t.themeStore.set('B');
    expect(seen).toEqual(['A']);
    expect(ls.get(KEY)).toBe('{"theme":"B"}');
    expect((await freshTheme()).themeStore.get()).toBe('B');
  });

  it('applyTheme sets data-theme (+ data-fx="neon" only for C) and the theme-color meta', async () => {
    installStorage({ [KEY]: '{"theme":"B"}' });
    const { doc, meta } = installDocument();
    const t = await freshTheme();
    t.initTheme();
    expect(doc.documentElement.dataset).toEqual({ theme: 'B' });
    expect(meta.attrs.get('content')).toBe('#F3E9DA');
    t.themeStore.set('C');
    expect(doc.documentElement.dataset).toEqual({ theme: 'C', fx: 'neon' });
    expect(meta.attrs.get('content')).toBe('#0C0C10');
    t.themeStore.set('K');
    expect(doc.documentElement.dataset).toEqual({ theme: 'K' });
  });
});

describe('theme plumbing pins', () => {
  const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

  it('index.html loads /theme-boot.js before the app; boot script knows both keys and all four colours', async () => {
    const html = read('../index.html');
    const boot = read('../public/theme-boot.js');
    expect(boot).toContain(`'${KEY}'`);
    expect(boot).toContain(`'${OLD}'`);
    const { THEME_COLORS } = await freshTheme();
    for (const c of Object.values(THEME_COLORS)) expect(boot).toContain(c);
    expect(html.indexOf('/theme-boot.js')).toBeGreaterThan(-1);
    expect(html.indexOf('/theme-boot.js')).toBeLessThan(html.indexOf('/src/main.tsx'));
    expect(html).toContain('<meta name="theme-color" content="#0C0C10"');
  });

  it('tiles live in Account (Appearance) and Settings (Look & effects); the Home chip is on the home stage', () => {
    expect(read('../src/account/AccountUI.tsx')).toContain('<ThemeToggle />');
    expect(read('../src/MoreOptions.tsx')).toContain('<ThemeToggle />');
    const toggle = read('../src/ThemeToggle.tsx');
    expect(toggle).toContain('data-testid="theme-seg"');
    expect(toggle).toContain('Lounge colour is only on Neon Lounge');
    expect(read('../src/Setup.tsx')).toContain('<ThemeChip />');
  });

  it('main.tsx initializes the theme store at boot', () => {
    expect(read('../src/main.tsx')).toContain('initTheme()');
  });

  it('no Neon Royale selectors remain (the neon layer is keyed on data-fx, set only for C)', () => {
    for (const p of ['../src/styles.css', '../src/social/social.css', '../src/online/online.css', '../src/account/account.css', '../src/profile/playercard.css']) expect(read(p), p).not.toContain('data-theme="neon"');
  });
});

describe('per-theme token parity + spec values', () => {
  const sets = Object.fromEntries(THEME_IDS.map((id) => [id, themeVars(id)]));
  it('every theme defines the same token names', () => {
    const names = [...sets.C!.keys()].sort();
    expect(names.length).toBeGreaterThan(40);
    for (const id of THEME_IDS) expect([...sets[id]!.keys()].sort(), id).toEqual(names);
  });
  it('spec anchors (stage1b themes.md / theme.js)', () => {
    const want: Record<string, [string, string, string, string]> = { A: ['#FF5A5F', '#FFC85C', '#0D3D66', '#141233'], B: ['#B4532A', '#1F5FA8', '#3A5F9A', '#F3E9DA'], C: ['#FF2EB8', '#33E6FF', '#3A0D1A', '#0C0C10'], K: ['#F5C542', '#B980FF', '#1D5A3C', '#0C0712'] };
    for (const id of THEME_IDS) {
      const v = sets[id]!;
      expect([v.get('--pp-accent'), v.get('--pp-accent-2'), v.get('--pp-felt'), v.get('--pp-bg')], id).toEqual(want[id]);
    }
  });
  it('rgb triplets match their hex', () => {
    for (const id of THEME_IDS) {
      const v = sets[id]!;
      for (const [k, t] of v) {
        if (!k.endsWith('-rgb')) continue;
        const hex = v.get(k.replace(/-rgb$/, ''));
        if (hex?.startsWith('#')) expect(hexRgb(hex).join(', '), `${id} ${k}`).toBe(t);
      }
    }
  });
  it('label on primary meets the spec contrast in every theme (A 6.59, B 4.99, C 6.07, K 12.40)', () => {
    const min: Record<string, number> = { A: 6.5, B: 4.9, C: 6.0, K: 12.3 };
    for (const id of THEME_IDS) {
      const v = sets[id]!;
      expect(contrast(hexRgb(v.get('--pp-primary-ink')!), hexRgb(v.get('--pp-primary')!)), id).toBeGreaterThanOrEqual(min[id]!);
    }
  });
  it('Theme B text contrast per stage2b/themeB-contrast.json (ink 11.87, muted 4.85, accent 4.15, accent-2 5.36 on bg)', () => {
    const v = sets.B!;
    const bg = hexRgb(v.get('--pp-bg')!);
    expect(contrast(hexRgb(v.get('--pp-ink')!), bg)).toBeGreaterThanOrEqual(11.8);
    expect(contrast(hexRgb(v.get('--pp-muted')!), bg)).toBeGreaterThanOrEqual(4.8);
    expect(contrast(hexRgb(v.get('--pp-accent')!), bg)).toBeGreaterThanOrEqual(4.1);
    expect(contrast(hexRgb(v.get('--pp-accent-2')!), bg)).toBeGreaterThanOrEqual(5.3);
    // white cards on the gingham's lightest square (rgb 109,137,180) stay ≥ 3:1
    expect(contrast([255, 255, 255], [109, 137, 180])).toBeGreaterThanOrEqual(3.5);
    // B overlays are ink-toned, not white glass
    expect(v.get('--pp-hi-rgb')).toBe('31, 42, 68');
  });
  it('dark themes: ink and muted read on their bg (≥ 7 and ≥ 4.5)', () => {
    for (const id of ['A', 'C', 'K'] as const) {
      const v = sets[id]!;
      const bg = hexRgb(v.get('--pp-bg')!);
      expect(contrast(hexRgb(v.get('--pp-ink')!), bg), id).toBeGreaterThanOrEqual(7);
      expect(contrast(hexRgb(v.get('--pp-muted')!), bg), id).toBeGreaterThanOrEqual(4.5);
    }
  });
});
