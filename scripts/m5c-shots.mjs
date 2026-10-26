/** 5c screenshots (local): legal pages + the Account delete sheet + push dropdown at 390px. Creates one passkey account and deletes it. */
import { chromium } from 'playwright-core';
const web = process.argv[2] ?? 'http://localhost:4173';
const out = 'screenshots/5c';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
for (const f of ['privacy', 'terms', 'data-deletion']) { await p.goto(`${web}/${f}.html`); await p.screenshot({ path: `${out}/${f}-390.png`, fullPage: true }); }
const cdp = await ctx.newCDPSession(p);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const t = (x) => p.getByTestId(x); const name = `Shot${Math.random().toString(36).slice(2, 6)}`;
await p.goto(web); await t('signin-btn').waitFor();
if (await t('entry-guest').count()) await t('entry-guest').click();
await t('signin-btn').click(); await t('create-passkey').click(); await t('username-input').fill(name);
await p.waitForFunction(() => /available/i.test(document.querySelector('[data-testid=username-msg]')?.textContent ?? ''));
await t('username-save').click();
await p.waitForFunction((n) => document.querySelector('[data-testid=account-btn]')?.textContent?.includes(n), name);
await p.waitForTimeout(600); if (await t('first-prefs-skip').count()) await t('first-prefs-skip').click();
await p.waitForTimeout(400); await t('account-btn').click();
if (await t('push-dropdown-toggle').count()) { await t('push-dropdown-toggle').click(); await p.waitForTimeout(400); await t('push-dropdown').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${out}/account-push-390.png` }); }
await t('delete-account').click(); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/delete-sheet-390.png` });
await t('delete-confirm-input').fill(name); await t('delete-confirm').click(); await t('signin-btn').waitFor();
console.log('shots done; account deleted:', !(await p.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user)));
await b.close();
