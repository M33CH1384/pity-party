/** V0: the design-spec token vocabulary exists as aliases (no visual change), and the neutral palette is untouched. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '../src/theme.css'), 'utf8');
const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]!);
const decls = (b: string) => new Map([...b.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
const base = decls(blocks[0]!);
const v0 = decls(blocks[1]!);

/** Tokens named in Desi's stage2 HANDOFF Tokens + stage1b/stage2 app.css + stage2b delta. */
const SPEC = ['--pp-bg', '--pp-ink', '--pp-accent', '--pp-danger', '--pp-soft', '--pp-plate', '--pp-plate-2', '--pp-well', '--pp-off', '--pp-bg-dim', '--pp-mut', '--pp-line', '--pp-accent-2', '--pp-accent-on', '--pp-accent-glow', '--pp-glow', '--pp-btn-fill', '--pp-felt', '--pp-felt-sheen', '--pp-card', '--pp-font-disp', '--pp-font-ui', '--pp-disp-w', '--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--r-btn', '--r-plate', '--r-pill', '--h-btn', '--h-btn-sm', '--h-ico'];

describe('theme tokens (V0)', () => {
  it('every spec token is defined', () => {
    for (const t of SPEC) expect(base.has(t) || v0.has(t), t).toBe(true);
  });
  it('the neutral palette block is unchanged (V0 adds aliases only)', () => {
    expect(base.get('--pp-bg')).toBe('#111317');
    expect(base.get('--pp-accent')).toBe('#7d8899');
    expect(base.get('--pp-primary-grad')).toBe('linear-gradient(180deg, #f2f4f7, #dfe3e9 45%, #a9b0bc)');
    expect(base.size).toBe(28);
  });
  it('colour aliases point at existing palette tokens; only cards/suits are fixed hex', () => {
    for (const [k, v] of v0) {
      for (const ref of v.matchAll(/var\((--[\w-]+)\)/g)) expect(base.has(ref[1]!) || v0.has(ref[1]!) || ref[1] === '--display', `${k} → ${ref[1]}`).toBe(true);
      if (/#[0-9a-f]{3,8}\b/i.test(v)) expect(k, `${k} hard-codes a colour`).toMatch(/^--pp-(card|suit-[shdc])$/);
    }
  });
  it('no alias redefines a palette token', () => {
    for (const k of v0.keys()) expect(base.has(k), k).toBe(false);
  });
});
