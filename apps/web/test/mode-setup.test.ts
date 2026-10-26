import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PITTY_PAT_OPTIONS, defaultsOf, getRules } from '@pp/game';
import { defaultChoice, loadModeChoice, modeCatalog, saveModeChoice } from '../src/modes/catalog';
import { ModeOptionsForm, ModeSetup } from '../src/modes/ModeSetup';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('mode catalog', () => {
  it('lists Pitty Pat as playable (M7b), Tonk as coming soon, then the placeholder', () => {
    const cat = modeCatalog();
    expect(cat.map((m) => [m.modeId, m.available])).toEqual([['pitty-pat', true], ['tonk', false], ['placeholder', true]]);
    expect(cat[0]!.schema).toBe(PITTY_PAT_OPTIONS);
    expect(cat[2]!.schema).toBe(getRules('placeholder').optionsSchema);
  });

  it('loads defaults, refuses a coming-soon mode, clamps saved options', () => {
    const s = mem();
    expect(loadModeChoice(s)).toEqual(defaultChoice('pitty-pat'));
    s.setItem('pp.modeChoice', JSON.stringify({ modeId: 'tonk', options: {} }));
    expect(loadModeChoice(s).modeId).toBe('pitty-pat');
    saveModeChoice({ modeId: 'placeholder', options: { handSize: 99, junk: 1 } }, s);
    expect(loadModeChoice(s).options).toEqual({ ...defaultChoice('placeholder').options, handSize: 5 });
    s.setItem('pp.modeChoice', '{not json');
    expect(loadModeChoice(s).modeId).toBe('pitty-pat');
  });
});

describe('Setup mode picker + generated options', () => {
  it('renders every mode; Pitty Pat enabled, Tonk disabled with "Coming soon"', () => {
    const html = renderToStaticMarkup(createElement(ModeSetup, { value: defaultChoice('placeholder'), onChange: () => {} }));
    expect(html).not.toMatch(/data-testid="pick-pitty-pat"[^>]*disabled|disabled[^>]*data-testid="pick-pitty-pat"/);
    expect(html).toMatch(/disabled[^>]*data-testid="pick-tonk"/);
    expect(html).toContain('Coming soon');
    expect(html).toMatch(/aria-checked="true"[^>]*data-testid="pick-placeholder"/);
  });

  it('builds a control per option (toggle / choice / stepper), defaults filled, source + unverified flag shown', () => {
    const html = renderToStaticMarkup(createElement(ModeOptionsForm, { schema: PITTY_PAT_OPTIONS, values: defaultsOf(PITTY_PAT_OPTIONS), onChange: () => {} }));
    for (const o of PITTY_PAT_OPTIONS) {
      expect(html).toContain(`data-testid="opt-source-${o.key}"`);
      expect(html).toContain(o.label.replace(/"/g, '&quot;'));
    }
    const unverified = PITTY_PAT_OPTIONS.filter((o) => !o.verified).length;
    expect(html.match(/opt-unverified/g)!.length).toBe(unverified);
    expect(html).toContain('data-testid="opt-ante"'); // int → stepper
    expect(html).toMatch(/<output[^>]*>1<\/output>/); // ante default 1
    expect(html).toContain('<select aria-label="When the stock runs out"'); // long enum → select
  });
});
