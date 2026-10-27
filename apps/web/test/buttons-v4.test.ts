import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '../src/buttons.css'), 'utf8');
const theme = readFileSync(join(__dirname, '../src/theme.css'), 'utf8');

describe('V4 button system', () => {
  it('reads tokens only (no colour literals)', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g)).toBeNull();
  });
  it('heights come from tokens that are at least 44px', () => {
    const px = (n: string) => Number(theme.match(new RegExp(`--${n}:\\s*(\\d+)px`))?.[1]);
    expect(px('h-btn')).toBeGreaterThanOrEqual(44);
    expect(px('h-btn-sm')).toBeGreaterThanOrEqual(44);
    expect(css).not.toMatch(/min-height:\s*\d/);
  });
  it('has the four variants and press / focus / disabled states', () => {
    for (const s of ['.btn.pri', '.btn.sec', '.btn.ghost', '.btn.dng', ':active', ':focus-visible', ':disabled']) expect(css).toContain(s);
  });
  it('defines per-theme focus tokens and is loaded after styles.css', () => {
    for (const t of ['A', 'B', 'K']) expect(theme).toMatch(new RegExp(`html\\[data-theme="${t}"\\] \\{[^}]*--btn-focus`));
    const main = readFileSync(join(__dirname, '../src/main.tsx'), 'utf8');
    expect(main.indexOf("'./buttons.css'")).toBeGreaterThan(main.indexOf("'./styles.css'"));
  });
});
