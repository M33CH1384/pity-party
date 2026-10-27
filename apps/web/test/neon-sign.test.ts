/** Logo PR: Desi's option C neon sign. Self-hosted WebPs, one per colour pair; theme/accent → file; a11y name. */
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAccent } from '../src/accent';
import { signPair } from '../src/NeonSign';

const pub = join(__dirname, '../public/logo');
describe('neon sign assets', () => {
  it('every pair exists for home + header, each small (home ≤ 45 KB, header ≤ 12 KB), plus the unlit layer', () => {
    for (const k of ['A', 'B', 'K', 'magenta', 'blue', 'violet', 'ember', 'mint', 'crimson']) {
      for (const [kind, max] of [['home', 45_000], ['header', 12_000]] as const) {
        const f = join(pub, `${kind}-${k}.webp`);
        expect(existsSync(f), f).toBe(true);
        expect(statSync(f).size, f).toBeLessThanOrEqual(max);
      }
    }
    expect(existsSync(join(pub, 'home-off.webp'))).toBe(true);
  });
  it('theme + Lounge colour pick the file; B uses its painted enamel render; custom hues use the nearest preset', () => {
    expect(signPair('A', resolveAccent({ id: 'magenta', follow: true }))).toBe('A');
    expect(signPair('B', resolveAccent({ id: 'blue', follow: true }))).toBe('B');
    expect(signPair('K', resolveAccent({ id: 'ember', follow: true }))).toBe('K');
    expect(signPair('C', resolveAccent({ id: 'mint', follow: true }))).toBe('mint');
    expect(['magenta', 'blue', 'violet', 'ember', 'mint', 'crimson']).toContain(signPair('C', resolveAccent({ id: 'custom', hue: 250, follow: true })));
  });
  it('no live-filter SVG ships; the flicker has a reduced-motion / Reduce effects fade', () => {
    const css = readFileSync(join(__dirname, '../src/theme.css'), 'utf8');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.neon-loading \.on \{ animation: pp-sign-fade/);
    expect(css).toContain('.neon-loading.calm .on { animation: pp-sign-fade');
    const src = readFileSync(join(__dirname, '../src/NeonSign.tsx'), 'utf8');
    expect(src).toContain('alt="Pity Party"');
    expect(src).not.toMatch(/\.svg/);
  });
});
