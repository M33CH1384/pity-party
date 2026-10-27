/** V1 lint: colour codes belong in theme.css. Every other source file is held to a ratchet ceiling
 *  (counts may only go down; V1b sweeps the remaining saturated/art literals to tokens).
 *  Allowed without counting: theme.css (all theme + card/suit tokens) and theme.ts / theme-boot (theme-color meta). */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../src');
const LIT = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g;
const EXEMPT = new Set(['theme.css', 'theme.ts', 'accent.ts', 'fonts.css']); // accent.ts holds Desi's preset table + colour maths (V2)
/** Ratchet ceilings (V1). Lower these as V1b sweeps; never raise. */
const CEILING: Record<string, number> = {
  'venues.ts': 108, // venue art palettes (BWM-era scenery), V1b
  'styles.css': 71, 'profile/playercard.css': 69, 'social/social.css': 43, 'transitions.css': 14, 'online/online.css': 11, 'account/account.css': 6,
  'SprayLayer.tsx': 19, 'sprayTextures.ts': 8, 'inkTextures.ts': 8, // canvas paint colours
  'online/useOnline.ts': 7, 'RepBlock.tsx': 6, 'account/AccountUI.tsx': 4, 'ink/splat.ts': 3, 'spatial.ts': 1, 'feedbackContext.ts': 1, 'audio.ts': 1,
};
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(css|tsx?)$/.test(n) ? [p] : []; });

describe('no colour codes outside theme.css', () => {
  it('every file is at or under its ratchet ceiling (new files: zero)', () => {
    const over: string[] = [];
    for (const p of walk(SRC)) {
      const rel = relative(SRC, p).split('\\').join('/');
      if (EXEMPT.has(rel)) continue;
      const n = (readFileSync(p, 'utf8').match(LIT) ?? []).length;
      if (n > (CEILING[rel] ?? 0)) over.push(`${rel}: ${n} > ${CEILING[rel] ?? 0}`);
    }
    expect(over).toEqual([]);
  });
  it('Theme B has no white glass or white text-shadow of its own', () => {
    const css = readFileSync(join(SRC, 'theme.css'), 'utf8');
    const b = [...css.matchAll(/html\[data-theme="B"\][^{]*\{([^}]*)\}/g)].map((m) => m[1]).join('\n');
    expect(b).not.toMatch(/text-shadow:[^;]*(255,\s*255,\s*255|#fff)/i);
    expect(css).toContain('html[data-theme="B"] body * { text-shadow: none !important; }');
    expect(b).toContain('--pp-hi-rgb: 31, 42, 68');
  });
});
