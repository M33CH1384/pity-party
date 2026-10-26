/**
 * 5b social e2e (local only): two signed-in accounts against `wrangler dev --local` + vite preview.
 * Friend request → accept, presence shows the registry mode, Join from a friend (seat respected),
 * invite to my table → accept → seated, Spectate a friend's game.
 *
 * Needs the local D1 seeded first: scripts/seed-social-e2e.sh (local miniflare only)
 * and the server started with --var PUBLIC_ORIGIN:http://127.0.0.1:4173 (PUBLIC_ORIGIN=http://127.0.0.1:4173 so the http session cookie is `pp_sid`.
 *   BWM_URL=http://127.0.0.1:4173 tsx test/social-play.e2e.ts
 */
import { chromium, type Browser, type Page } from 'playwright-core';

const base = process.env.BWM_URL ?? 'http://127.0.0.1:4173';
const shots = process.env.BWM_SHOTS ?? 'docs/screenshots';
const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg); console.log('  ✓', msg); };
export const USERS = { alice: 'e2esessionalice0123456789abcdef', bobby: 'e2esessionbobby0123456789abcdef', cara: 'e2esessioncara00123456789abcdef' };

async function as(b: Browser, tok: string): Promise<Page> {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (tok) await ctx.addCookies([{ name: 'pp_sid', value: tok, domain: '127.0.0.1', path: '/' }]);
  await ctx.addInitScript(() => { localStorage.setItem('bwm.entryGuest', '1'); localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true, counts: {} })); localStorage.setItem('pp.modeChoice', JSON.stringify({ modeId: 'placeholder', options: { handSize: 3 } })); });
  const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  return p;
}
async function openSocial(p: Page, tab = 'players') {
  if (!(await p.getByTestId('social-panel').isVisible().catch(() => false))) await p.getByTestId('social-btn').first().click();
  await p.getByTestId('social-panel').waitFor();
  await p.getByTestId(`soc-tab-${tab}`).click();
}

const b = await chromium.launch();
try {
  const alice = await as(b, USERS.alice), bobby = await as(b, USERS.bobby), cara = await as(b, USERS.cara);
  // Alice hosts a High Card table
  const { code } = await (await fetch('http://127.0.0.1:8787/api/tables', { method: 'POST', headers: { origin: base } })).json() as { code: string };
  await alice.goto(base); await alice.evaluate((c) => sessionStorage.setItem(`bwm.created.${c}`, '1'), code);
  await alice.goto(`${base}/t/${code}`);
  await alice.getByTestId('start').waitFor();
  ok(true, `Alice hosts ${code}`);
  // friends: Bobby → Alice request, Alice accepts
  await bobby.goto(base); await bobby.waitForTimeout(2500);
  await openSocial(bobby);
  await bobby.getByTestId('pl-add-Alice').click();
  await openSocial(alice, 'friends');
  await alice.getByTestId('accept-Bobby').click();
  await openSocial(bobby, 'friends');
  await bobby.getByTestId('friend-Alice').waitFor();
  ok(true, 'friend request → accept: Alice is in Bobby\'s friends');
  // presence shows the registry mode; Join takes the deep-linked seat
  await openSocial(bobby);
  const row = bobby.getByTestId('player-Alice');
  await row.getByText(/High Card/).waitFor();
  ok(true, 'presence: Alice shows "High Card" at her table');
  await bobby.screenshot({ path: `${shots}/5b-friend-presence-390.png` });
  await bobby.getByTestId('pl-join-Alice').click();
  await bobby.getByTestId('lobby').waitFor();
  await bobby.waitForTimeout(1500);
  const seated = await bobby.evaluate(() => document.querySelectorAll('[data-testid="lobby"] .seat-card.mine, [data-testid="lobby"] .mine').length);
  ok(seated > 0, 'Join from friend: Bobby is seated at Alice\'s table');
  // invite: Alice invites Cara (not a friend, invites open) → Cara accepts → seated
  await cara.goto(base); await cara.waitForTimeout(2500);
  await openSocial(alice);
  await alice.getByTestId('pl-invite-Cara').click();
  await cara.getByTestId('invite-accept').click();
  await cara.getByTestId('lobby').waitFor();
  await cara.waitForTimeout(1500);
  ok(await cara.evaluate(() => document.querySelectorAll('[data-testid="lobby"] .mine').length) > 0, 'invite → accept: Cara is seated');
  // Alice starts the game
  await alice.keyboard.press('Escape');
  await alice.getByTestId('social-close').click().catch(() => {});
  await alice.getByTestId('start').click();
  await alice.getByTestId('mode-screen').waitFor();
  ok(true, 'host starts the High Card game with friends');
  // a guest spectates Alice's game from the players list
  const dee = await as(b, '');
  await dee.goto(base); await dee.waitForTimeout(2500);
  const g = dee.getByRole('button', { name: /play as guest/i });
  if (await g.isVisible().catch(() => false)) await g.click();
  await dee.keyboard.press('Escape').catch(() => {});
  await openSocial(dee);
  await dee.getByTestId('pl-spectate-Alice').click();
  await dee.getByTestId('mode-screen').waitFor();
  ok((await dee.locator('.mode-status').textContent())?.includes('watching') === true, 'Spectate a friend\'s game from the players list');
} catch (e) {
  let i = 0; for (const c of b.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: `/tmp/sfail${i++}.png` }).catch(() => {});
  throw e;
} finally { await b.close(); }
