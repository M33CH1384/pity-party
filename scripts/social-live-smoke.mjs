/**
 * Live social smoke (deployed site, no test hooks): two passkey accounts + a guest connect to the social hub,
 * see each other online, a global chat line reaches everyone, a DM and a table invite reach the other account,
 * leaderboard + tournament list answer. Both accounts are deleted at the end (their DMs/friends go with them;
 * the one global chat line stays in the hub's rolling 200-line history unless an admin deletes it).
 * Usage: node scripts/social-live-smoke.mjs [web=https://pity-party.pages.dev] [server=https://pity-party-server.demetrius-robinson31.workers.dev]
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
const server = process.argv[3] ?? 'https://pity-party-server.demetrius-robinson31.workers.dev';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ok = (m) => console.log(`✓ ${m}`);
async function account() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
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
  await tid('create-passkey').click();
  await tid('username-input').fill(name);
  await page.waitForFunction(() => /available/i.test(document.querySelector('[data-testid=username-msg]')?.textContent ?? ''), null, { timeout: 8000 });
  await tid('username-save').click();
  await page.waitForFunction((n) => document.querySelector('[data-testid=account-btn]')?.textContent?.includes(n), name, { timeout: 15000 });
  made.push({ page, name });
  await dismissOverlays(page);
  return { page, tid, name };
}
// raw hub socket inside the page (same origin cookie → ticket)
const hub = (page, srv, guest) => page.evaluate(async ({ srv, guest }) => {
  let q = 'name=GuestProbe';
  if (!guest) { const j = await (await fetch('/api/social/ticket')).json(); q = `ticket=${encodeURIComponent(j.ticket)}`; }
  const ws = new WebSocket(`${srv.replace(/^http/, 'ws')}/api/social/ws?${q}`);
  window.__msgs = []; window.__ws = ws;
  ws.onmessage = (e) => { if (e.data !== 'pong') window.__msgs.push(JSON.parse(e.data)); };
  await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });
}, { srv, guest });
const waitMsg = async (page, fn, arg, what) => {
  const f = new Function('m', 'a', fn);
  for (const end = Date.now() + 15000; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) {
    const msgs = await page.evaluate(() => window.__msgs);
    if (msgs.some((m) => f(m, arg))) return;
  }
  throw new Error(`timeout: ${what}`);
};
const send = (page, m) => page.evaluate((m) => window.__ws.send(JSON.stringify(m)), m);
const meId = (page) => page.evaluate(() => window.__msgs.find((m) => m.t === 'hello').you.id);

const made = []; // every account this run created, deleted in finally even if the second sign-up fails
try {
  const A = await account(), B = await account();
  ok(`two passkey accounts: ${A.name}, ${B.name}`);
  const gctx = await browser.newContext(); const G = { page: await gctx.newPage() }; await G.page.goto(web);
  await hub(A.page, server); await hub(B.page, server); await hub(G.page, server, true);
  await waitMsg(A.page, 'return m.t==="hello"', null, 'A hello'); await waitMsg(B.page, 'return m.t==="hello"', null, 'B hello');
  const aId = await meId(A.page), bId = await meId(B.page);
  const sees = (p, n) => waitMsg(p, 'return (m.t==="hello"&&m.users.some(u=>u.name===a))||(m.t==="pres"&&(m.up||[]).some(u=>u.name===a))', n, `presence ${n}`);
  await sees(A.page, B.name); await sees(B.page, A.name); await sees(G.page, A.name); await sees(G.page, B.name);
  ok('presence: both accounts see each other online; a guest sees both');
  const text = 'gg all, good luck at the tables';
  await send(A.page, { t: 'chat', text });
  for (const p of [B.page, G.page]) await waitMsg(p, 'return m.t==="chat"&&m.line.text===a', text, 'global chat');
  ok('global chat line reached the other account + guest');
  // DMs are friends-only: befriend first (the friendship goes with the accounts at cleanup)
  await send(A.page, { t: 'friend', op: 'request', to: bId });
  await waitMsg(B.page, 'return m.t==="friends"&&JSON.stringify(m.friends).includes(a)', A.name, 'friend request');
  await send(B.page, { t: 'friend', op: 'accept', to: aId });
  await waitMsg(A.page, 'return m.t==="friends"&&(m.friends.friends||[]).some(f=>JSON.stringify(f).includes(a))', B.name, 'friend accepted');
  ok('friend request + accept');
  await send(A.page, { t: 'dm', to: bId, text: 'dm check' });
  await waitMsg(B.page, 'return m.t==="dm"&&m.line.text===a', 'dm check', 'dm');
  ok('DM delivered');
  await send(A.page, { t: 'invite', to: bId, code: 'ZZZZZ', mode: 'tonk' });
  await waitMsg(B.page, 'return m.t==="invite"&&m.invite.mode==="tonk"', null, 'invite');
  ok('table invite (Tonk) reached the other account');
  const lb = await A.page.evaluate(async () => (await fetch('/api/social/leaderboard?board=rating&kind=team&scope=global&period=all')).status);
  const tl = await A.page.evaluate(async () => (await fetch('/api/tournaments')).status);
  // tournaments are switched off for Pity Party (REBUILD.md) and answer 503 "coming back soon"
  if (lb !== 200 || tl !== 503) throw new Error(`leaderboard ${lb} tournaments ${tl}`);
  ok('leaderboard 200, tournaments 503 (switched off)');
} finally {
  for (const X of made) {
    try { await X.page.evaluate(() => window.__ws?.close()); await deleteAccount(X.page, X.name); ok(`cleanup: ${X.name} deleted`); }
    catch (e) { process.exitCode = 1; console.log(`✗ cleanup ${X.name}: ${e.message}`); }
  }
  await browser.close();
}
console.log('LIVE SOCIAL SMOKE PASS');
