/**
 * Live smoke for accounts on the deployed site (no test hooks): passkey account create → sign out → passkey sign in →
 * delete; Online lobby opens with no CSP errors. Usage: node scripts/accounts-live-smoke.mjs [web=https://pity-party.pages.dev]
 */
import { chromium } from 'playwright-core';

// first-visit welcome sheet (Sign in / Play as guest) and the first-sign-in "game preferences" prompt both sit
// over the page with a backdrop that eats clicks; dismiss whichever is up.
const dismissOverlays = async (page) => {
  const t = (x) => page.getByTestId(x);
  if (await t('entry-guest').count()) { await t('entry-guest').click(); await page.waitForTimeout(400); }
  if (await t('first-prefs-skip').count()) { await t('first-prefs-skip').click(); await page.waitForTimeout(400); }
};
// delete the signed-in account through the app (account sheet → delete → type name); falls back to the same
// POST the sheet makes if the UI path fails, so a smoke run never leaves its account behind.
const deleteAccount = async (page, name) => {
  const t = (x) => page.getByTestId(x);
  try {
    await dismissOverlays(page);
    await t('account-btn').click(); await t('delete-account').click();
    await t('delete-confirm-input').fill(name); await t('delete-confirm').click();
    await t('signin-btn').waitFor({ timeout: 15000 });
  } catch (e) {
    const s = await page.evaluate(async () => (await fetch('/api/auth/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status);
    if (s !== 200) throw new Error(`delete ${name}: UI failed (${e.message.split('\n')[0]}), POST /api/auth/delete → ${s}`);
  }
  if (await page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user)) throw new Error(`${name} still signed in after delete`);
};

const web = process.argv[2] ?? 'https://pity-party.pages.dev';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) problems.push(`CSP: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
const cdp = await ctx.newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const tid = (t) => page.getByTestId(t);
const name = `Live${Math.random().toString(36).slice(2, 7)}`;

await page.goto(web);
await page.evaluate(() => localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true })));
await page.reload();
await tid('signin-btn').waitFor({ timeout: 15000 });
await dismissOverlays(page);
await tid('signin-btn').click();
if (await tid('signin-google').count()) throw new Error('google shown without secrets');
await tid('create-passkey').click();
await tid('username-input').fill(name);
await page.waitForFunction(() => /available/i.test(document.querySelector('[data-testid=username-msg]')?.textContent ?? ''), null, { timeout: 8000 });
await tid('username-save').click();
await page.waitForFunction((n) => document.querySelector('[data-testid=account-btn]')?.textContent?.includes(n), name, { timeout: 15000 });
let deleted = false;
try {
  const cookies = await ctx.cookies(web);
  const https = web.startsWith('https:'); // local http (wrangler dev) can't use __Host-/Secure: the cookie is plain pp_sid there
  const sid = cookies.find((c) => c.name === (https ? '__Host-pp_sid' : 'pp_sid'));
  if (!sid || !sid.httpOnly || (https && !sid.secure) || sid.sameSite !== 'Lax') throw new Error(`session cookie flags: ${JSON.stringify(sid)}`);
  if (await page.evaluate(() => document.cookie.includes('pp_sid'))) throw new Error('session cookie readable by scripts');
  console.log(`✓ live: passkey account "${name}" created; session cookie HttpOnly + Secure + SameSite=Lax, first-party`);
  await dismissOverlays(page);
  await tid('account-btn').click();
  await tid('sign-out').click();
  await tid('signin-btn').waitFor();
  await tid('signin-btn').click();
  await tid('signin-passkey').click();
  await page.waitForFunction((n) => document.querySelector('[data-testid=account-btn]')?.textContent?.includes(n), name, { timeout: 15000 });
  console.log('✓ live: signed out and back in with the passkey');
  await page.screenshot({ path: '/tmp/pp-live-signed-in.png' });
  await deleteAccount(page, name); deleted = true;
  console.log('✓ live: account deleted');
} finally {
  if (!deleted) { try { await deleteAccount(page, name); console.log(`✓ cleanup: ${name} deleted after a failure`); } catch (e) { console.log(`✗ cleanup ${name}: ${e.message}`); } }
}
await page.goto(`${web}/online`);
await page.waitForTimeout(4000);
await browser.close();
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log('no CSP violations or page errors\nLIVE ACCOUNTS SMOKE PASS');
