/** Home v2 (Desi logo-v3/HANDOFF-HOME-V2): full card fan + portrait/landscape signs; Theme B painted enamel sign. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeFan } from '../src/HomeFan';

const pub = join(__dirname, '../public/logo');
const css = readFileSync(join(__dirname, '../src/theme.css'), 'utf8');

describe('Home v2', () => {
  it('one-line landscape signs exist for every pair, small', () => {
    for (const k of ['A', 'B', 'K', 'magenta', 'blue', 'violet', 'ember', 'mint', 'crimson']) {
      const f = join(pub, `line-${k}.webp`);
      expect(existsSync(f), f).toBe(true);
      expect(statSync(f).size, f).toBeLessThanOrEqual(40_000);
    }
  });
  it('the fan is decoration: aria-hidden, no buttons, lettered courts (no court images), and the back carries no card', () => {
    const html = renderToStaticMarkup(createElement(HomeFan));
    expect(html).toMatch(/^<div class="home-fan" aria-hidden="true"/);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<image');
    const back = html.slice(html.lastIndexOf('hf-3'));
    expect(back).toContain('card-back');
    expect(back).not.toMatch(/<text[^>]*>(?:[2-9]|10|[JQKA])</);
  });
  it('is static (no animation) and lays out in two columns on landscape', () => {
    const block = css.slice(css.indexOf('---- Home v2'));
    expect(block).not.toMatch(/animation|transition/);
    expect(block).toContain('@media (orientation: landscape)');
    expect(block).toMatch(/\.wizard \.wiz-home \{ display: flex; flex-direction: row/);
  });
});
