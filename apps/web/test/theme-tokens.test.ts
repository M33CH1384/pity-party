import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const theme = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const rootBlock = styles.slice(styles.indexOf(':root {'), styles.indexOf('}', styles.indexOf(':root {')));

describe('neutral placeholder theme (3d): one token file', () => {
  it('every --pp-* token used anywhere is defined in theme.css', () => {
    const defined = new Set([...theme.matchAll(/(--pp-[\w-]+):/g)].map((m) => m[1]));
    const used = new Set([...styles.matchAll(/var\((--pp-[\w-]+)\)/g)].map((m) => m[1]));
    for (const u of used) expect(defined.has(u), u).toBe(true);
  });

  it('the legacy :root names are aliases only (no colors hard-coded there)', () => {
    expect(rootBlock).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(rootBlock).toContain('--purple: var(--pp-accent)');
    expect(rootBlock).toContain('--gold: var(--pp-primary)');
  });

  it('no BWM purple or gold in the legacy :root aliases (K Classic BWM carries them as theme tokens in theme.css)', () => {
    for (const hex of ['#9b5cff', '#b980ff', '#f5c542', '#0c0712']) expect(rootBlock.toLowerCase()).not.toContain(hex);
  });
});
