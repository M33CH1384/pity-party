/** V0 → V1: every design-spec token exists in every theme or in the shared block. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_IDS, themeVars } from './themeTokens';

const css = readFileSync(join(__dirname, '../src/theme.css'), 'utf8');
const shared = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!));

/** Tokens named in Desi's stage2 HANDOFF Tokens + stage1b/stage2 app.css + stage2b delta. */
const SPEC = ['--pp-bg', '--pp-ink', '--pp-accent', '--pp-danger', '--pp-soft', '--pp-plate', '--pp-plate-2', '--pp-well', '--pp-off', '--pp-bg-dim', '--pp-mut', '--pp-line', '--pp-accent-2', '--pp-accent-on', '--pp-accent-glow', '--pp-glow', '--pp-btn-fill', '--pp-felt', '--pp-felt-sheen', '--pp-card', '--pp-font-disp', '--pp-font-ui', '--pp-disp-w', '--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--r-btn', '--r-plate', '--r-pill', '--h-btn', '--h-btn-sm', '--h-ico'];
const PER_THEME = ['--pp-bg', '--pp-ink', '--pp-accent', '--pp-accent-2', '--pp-felt', '--pp-plate', '--pp-line', '--pp-btn-fill', '--pp-soft', '--pp-well', '--pp-off', '--pp-bg-dim', '--pp-danger', '--pp-disp-w'];

describe('design-spec tokens (V0 vocabulary, V1 values)', () => {
  it('every spec token is defined', () => { for (const t of SPEC) expect(shared.has(t), t).toBe(true); });
  it('the per-theme spec tokens have a real value in each of A/B/C/K', () => {
    for (const id of THEME_IDS) { const v = themeVars(id); for (const t of PER_THEME) expect(v.get(t), `${id} ${t}`).toBeTruthy(); }
  });
});
