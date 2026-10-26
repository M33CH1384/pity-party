/** 5c: the legal pages are Pity Party's (coins only, no real money, right domain) and the deletion steps match the app. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pub = (f: string) => readFileSync(join(__dirname, '..', 'public', f), 'utf8');
const pages = { privacy: pub('privacy.html'), terms: pub('terms.html'), deletion: pub('data-deletion.html') };
const account = readFileSync(join(__dirname, '..', 'src', 'account', 'AccountUI.tsx'), 'utf8');

describe('legal pages (5c)', () => {
  it.each(Object.entries(pages))('%s is Pity Party, not Bid Wit Me/Spades', (_, html) => {
    expect(html).toContain('Pity Party');
    expect(html).toContain('pity-party.pages.dev');
    expect(html).not.toMatch(/Bid Wit Me|bid-wit-me|Spades|Big Bank|wager|bwm/i);
  });
  it('coins are play money only, no real money', () => {
    expect(pages.terms).toMatch(/no real money/i);
    expect(pages.terms).toMatch(/can't be bought, sold, cashed out/);
    expect(pages.privacy).toMatch(/Coins are play money only/);
  });
  it('deletion steps name the real buttons of the in-app flow', () => {
    for (const label of ['>Delete account<', '>Delete forever<']) expect(account).toContain(label);
    expect(pages.deletion).toContain('<b>Delete account</b>');
    expect(pages.deletion).toContain('<b>Delete forever</b>');
    expect(pages.deletion).toMatch(/type your username to confirm/i);
    expect(pages.privacy).toMatch(/Delete account/);
  });
});
