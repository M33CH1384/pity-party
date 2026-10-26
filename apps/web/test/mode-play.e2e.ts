/**
 * Registry-mode play at 390px (headless Chromium; WebKit isn't available on the box).
 * 1) Offline: Setup → "Deal me in" plays High Card vs 3 bots to the recap, then Play again.
 * 2) Online (needs `wrangler dev --local` on :8787): host creates a table, the picked mode goes up as a
 *    `mode` message, a guest joins, both play through `move` messages with per-seat views, recap shows.
 * 3) Pitty Pat (M7b): offline vs 3 bots to the points target (with the Next-hand pause), and online
 *    2 humans + 2 bots to the points target; 390px checks (no horizontal scroll, 44px touch targets).
 * Run: BWM_URL=http://127.0.0.1:4173 npx tsx apps/web/test/mode-play.e2e.ts
 */
import { chromium, type Browser, type Page } from 'playwright-core';

const base = process.env.BWM_URL ?? 'http://127.0.0.1:4173';
const server = process.env.BWM_SERVER ?? 'http://127.0.0.1:8787';
const shots = process.env.BWM_SHOTS ?? 'docs/screenshots';
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg); console.log('  ✓', msg); };

async function newPage(b: Browser): Promise<Page> {
  const ctx = await b.newContext(IPHONE);
  await ctx.addInitScript(() => { if (!localStorage.getItem('bwm.online.name')) localStorage.setItem('bwm.online.name', 'Guest'); localStorage.setItem('bwm.entryGuest', '1'); localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true, counts: {} })); });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  return p;
}

/** Tap a legal card whenever it is this page's turn, until the recap shows. */
async function playToRecap(pages: Page[], shotMid?: string, onTick?: (p: Page) => Promise<void>): Promise<void> {
  let shot = false;
  for (let i = 0; i < 9000; i++) {
    for (const p of pages) {
      if (await p.getByTestId('mode-recap').isVisible().catch(() => false)) continue;
      const card = p.locator('.pcard-btn:not([disabled]), .pp-move:not([disabled])').first();
      if (onTick) await onTick(p);
      if (await card.isVisible().catch(() => false)) {
        if (shotMid && !shot) { shot = true; await p.screenshot({ path: `${shots}/${shotMid}` }); }
        await card.click();
      }
    }
    const done = await Promise.all(pages.map((p) => p.getByTestId('mode-recap').isVisible().catch(() => false)));
    if (done.every(Boolean)) return;
    await pages[0]!.waitForTimeout(150);
  }
  throw new Error('no recap');
}

async function guestIn(p: Page) {
  const g = p.getByRole('button', { name: /play as guest/i });
  await g.waitFor({ timeout: 4000 }).then(() => g.click()).catch(() => {});
}

async function offline(b: Browser) {
  console.log('offline');
  const p = await newPage(b);
  await p.goto(base);
  await p.evaluate(() => localStorage.setItem('pp.modeChoice', JSON.stringify({ modeId: 'placeholder', options: {} })));
  await p.goto(base);
  await guestIn(p);
  await p.getByTestId("play").waitFor(); await p.waitForTimeout(3500);
  await p.screenshot({ path: `${shots}/3a-home-390.png` });
  await p.getByTestId('play').click();
  await p.getByTestId('play-bots').waitFor();
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${shots}/3a-opponent-390.png` });
  await p.getByTestId('play-bots').click();
  await p.getByTestId('start-bots').waitFor();
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${shots}/3a-bots-table-step-390.png` });
  await p.getByTestId('more').click();
  await p.getByTestId('more-options').waitFor();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${shots}/3a-settings-390.png` });
  await p.keyboard.press('Escape');
  await p.getByTestId('more-options').waitFor({ state: 'detached' });
  await p.getByTestId('start-bots').click();
  await p.getByTestId('mode-screen').waitFor();
  ok(await p.getByTestId('mode-screen').getAttribute('data-mode') === 'placeholder', 'Deal me in opens the picked mode (High Card)');
  ok(await p.locator('.seat-chip').count() === 4, 'you + 3 bots');
  await playToRecap([p], '2.3b-offline-table-390.png');
  ok(await p.locator('[data-testid^="placing-"]').count() === 4, 'recap lists all 4 placings');
  ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, 'no horizontal overflow at 390');
  await p.screenshot({ path: `${shots}/2.3b-offline-recap-390.png` });
  await p.getByTestId('mode-again').click();
  ok(!(await p.getByTestId('mode-recap').isVisible()), 'Play again deals a fresh game');
  await p.getByTestId('mode-leave').click();
  await p.getByTestId('play').waitFor();
  ok(true, 'Leave returns to the menu');
}

async function online(b: Browser) {
  console.log('online');
  const r = await fetch(`${server}/api/tables`, { method: 'POST', headers: { origin: base } });
  if (!r.ok) throw new Error(`create ${r.status}`);
  const { code } = await r.json() as { code: string };
  const host = await newPage(b);
  await host.goto(base);
  await host.evaluate((c) => { sessionStorage.setItem(`bwm.created.${c}`, '1'); localStorage.setItem('pp.modeChoice', JSON.stringify({ modeId: 'placeholder', options: { handSize: 3 } })); localStorage.setItem('bwm.online.name', 'Host'); }, code);
  await host.goto(`${base}/t/${code}`);
  await guestIn(host);
  const guest = await newPage(b);
  await guest.goto(`${base}/t/${code}`);
  await guestIn(guest);
  await host.getByTestId('start').waitFor();
  await host.waitForTimeout(1500);
  await host.getByTestId('start').click();
  await host.getByTestId('mode-screen').waitFor();
  await guest.getByTestId('mode-screen').waitFor();
  ok(true, 'host start: both players land on the High Card table (server mode path)');
  const hostHand = await host.locator('[data-testid^="hc-"]').count();
  const guestHand = await guest.locator('[data-testid^="hc-"]').count();
  ok(hostHand === 3 && guestHand === 3, 'per-seat view: each player sees only their own 3 cards');
  // milestone 4: open-table list, spectator, in-room chat, reconnect
  let listed: { code: string; mode: string; status: string; spectators: number } | undefined;
  for (let i = 0; i < 20 && !listed; i++) {
    const lt = await (await fetch(`${server}/api/social/tables`, { headers: { origin: base } })).json() as { tables: typeof listed[] };
    listed = lt.tables.find((t) => t?.code === code);
    if (!listed) await host.waitForTimeout(300);
  }
  ok(listed?.mode === 'placeholder' && listed.status === 'playing', 'open-table list shows the table (registry mode, in progress)');
  const watcher = await newPage(b);
  await watcher.goto(`${base}/t/${code}?watch=1`);
  await guestIn(watcher);
  await watcher.getByTestId('mode-screen').waitFor();
  ok((await watcher.locator('.mode-status').textContent())?.includes('watching') === true, 'spectator lands on the table, watching');
  ok(await watcher.locator('[data-testid^="hc-"]').count() === 0 && await watcher.locator('.pcard-btn:not([disabled])').count() === 0, 'spectator sees no hand and has no moves');
  await host.locator('.mode-status', { hasText: '👁 1' }).waitFor();
  ok(true, 'players see the spectator count');
  await watcher.getByTestId('table-chat-tab').click();
  await watcher.getByLabel('Chat message').fill('go host!');
  await watcher.getByLabel('Chat message').press('Enter');
  await host.getByTestId('table-unread').waitFor();
  await host.getByTestId('table-chat-tab').click();
  await host.getByTestId('lobby-chat').getByText('go host!').waitFor();
  ok(await host.getByTestId('lobby-chat').getByTestId('chat-watching').count() >= 1, 'in-room chat: spectator line reaches the host, tagged watching');
  await host.getByLabel('Chat message').fill('thanks');
  await host.getByLabel('Chat message').press('Enter');
  await watcher.getByTestId('lobby-chat').getByText('thanks').waitFor();
  ok(true, 'in-room chat: host reply reaches the spectator');
  await host.waitForTimeout(600); // let the drawer's fade-up finish
  await host.screenshot({ path: `${shots}/4a-online-chat-390.png` });
  await host.getByTestId('table-chat-tab').click();
  await watcher.getByTestId('table-chat-tab').click();
  await watcher.screenshot({ path: `${shots}/4a-spectator-390.png` });
  const before = await guest.locator('[data-testid^="hc-"]').allTextContents();
  await guest.reload();
  await guestIn(guest);
  await guest.getByTestId('mode-screen').waitFor();
  await guest.locator('[data-testid^="hc-"]').first().waitFor();
  ok(JSON.stringify(await guest.locator('[data-testid^="hc-"]').allTextContents()) === JSON.stringify(before), 'reconnect (reload) mid-game: same seat, same hand');
  await playToRecap([host, guest], '2.3b-online-table-390.png');
  await host.screenshot({ path: `${shots}/2.3b-online-recap-390.png` });
  ok(await host.getByTestId('mode-again').textContent() === 'Rematch', 'host gets Rematch');
  ok(await guest.getByTestId('mode-again').textContent() === 'Back to lobby', 'guest gets Back to lobby');
  await host.getByTestId('mode-again').click();
  await host.getByTestId('mode-recap').waitFor({ state: 'hidden' });
  ok(true, 'rematch deals a new online game');
}

/** Every visible control in the table is at least 44px tall and the page never scrolls sideways. */
async function layoutOk(p: Page, what: string) {
  ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, `${what}: no horizontal scroll at 390`);
  const small = await p.evaluate(() => [...document.querySelectorAll('.mode-screen button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44); }).map((el) => el.textContent));
  ok(small.length === 0, `${what}: touch targets ≥ 44px${small.length ? ` (small: ${small.join(', ')})` : ''}`);
}

async function ppPick(p: Page, options: Record<string, unknown>) {
  await p.evaluate((o) => localStorage.setItem('pp.modeChoice', JSON.stringify({ modeId: 'pitty-pat', options: o })), options);
}

/** Reload and get back to the vs-bots table step (the app may restore it or start at the menu). */
async function toBots(p: Page) {
  await p.reload();
  await p.locator('[data-testid="start-bots"], [data-testid="play"]').first().waitFor();
  if (await p.getByTestId('play').isVisible().catch(() => false)) { await p.getByTestId('play').click(); await p.getByTestId('play-bots').click(); }
  await p.getByTestId('start-bots').waitFor();
}

async function pittyOffline(b: Browser) {
  console.log('pitty pat offline');
  const p = await newPage(b);
  await p.goto(base);
  await guestIn(p);
  await p.evaluate(() => localStorage.removeItem('pp.modeChoice'));
  await p.goto(base);
  await p.getByTestId('play').waitFor(); await p.waitForTimeout(1500);
  await p.getByTestId('play').click();
  await p.getByTestId('play-bots').click();
  await p.getByTestId('mode-setup').waitFor();
  ok(await p.getByTestId('pick-pitty-pat').getAttribute('aria-checked') === 'true' && !(await p.getByTestId('pick-pitty-pat').isDisabled()), 'Pitty Pat is listed and the default pick (no "Coming soon")');
  await p.getByTestId('mode-setup').scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${shots}/7b-setup-390.png` });
  ok(await p.getByText('Points to win').isVisible(), 'setup options form (from the schema) shows Points to win');
  ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, 'setup: no horizontal scroll at 390');
  await ppPick(p, { targetPoints: 3, pauseBetweenHands: true });
  await toBots(p);
  await p.getByTestId('start-bots').click();
  await p.getByTestId('mode-screen').waitFor();
  ok(await p.getByTestId('mode-screen').getAttribute('data-mode') === 'pitty-pat', 'Deal me in opens Pitty Pat vs 3 bots');
  ok((await p.getByTestId('pp-goal').textContent())?.includes('First to 3 points') === true, 'goal line shows the points target');
  ok(/^\d\/3pts$/.test((await p.getByTestId('pp-points-0').textContent())?.replace(/\s/g, '') ?? ''), 'your score reads n / 3 pts');
  ok(await p.getByTestId('pp-pot').count() === 0, 'no coins shown (coin pot off by default)');
  await layoutOk(p, 'table');
  let resultShot = false, tableShot = false;
  await playToRecap([p], undefined, async (pg) => {
    if (!tableShot && await pg.locator('.pp-move:not([disabled]), .pcard-btn:not([disabled])').first().isVisible().catch(() => false)) { tableShot = true; await pg.screenshot({ path: `${shots}/7b-table-390.png` }); }
    if (!resultShot && await pg.getByTestId('pp-hand-result').isVisible().catch(() => false)) {
      resultShot = true;
      await pg.waitForTimeout(300);
      await pg.screenshot({ path: `${shots}/7b-hand-result-390.png` });
      await layoutOk(pg, 'hand result');
    }
  });
  ok(resultShot, 'hand result shown between hands (pauseBetweenHands)');
  const pts = await Promise.all([0, 1, 2, 3].map(async (i) => Number(((await p.getByTestId(`recap-points-${i}`).textContent()) ?? '').replace(/\D/g, ''))));
  ok(Math.max(...pts) === 3, `full game to the points target: winner has 3 pts (${pts.join('/')})`);
  ok(await p.getByTestId('pp-recap-hands').locator('li').count() >= 3, 'recap lists hand by hand');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${shots}/7b-recap-390.png` });
  await layoutOk(p, 'recap');
  // Neon theme: the table keeps its neutral tokens, so it reads the same
  await p.evaluate(() => localStorage.setItem('bwm.theme.v1', JSON.stringify({ theme: 'neon' })));
  await p.getByTestId('mode-again').click();
  await toBots(p);
  await p.getByTestId('start-bots').click();
  await p.getByTestId('mode-screen').waitFor();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${shots}/7b-table-neon-390.png` });
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'neon', 'neon theme: table renders (screenshot)');
  await p.evaluate(() => localStorage.removeItem('bwm.theme.v1'));
  await p.context().close();
}

async function pittyOnline(b: Browser) {
  console.log('pitty pat online');
  const r = await fetch(`${server}/api/tables`, { method: 'POST', headers: { origin: base } });
  if (!r.ok) throw new Error(`create ${r.status}`);
  const { code } = await r.json() as { code: string };
  const host = await newPage(b);
  await host.goto(base);
  await host.evaluate((c) => { sessionStorage.setItem(`bwm.created.${c}`, '1'); localStorage.setItem('pp.modeChoice', JSON.stringify({ modeId: 'pitty-pat', options: { targetPoints: 2 } })); localStorage.setItem('bwm.online.name', 'Host'); }, code);
  await host.goto(`${base}/t/${code}`);
  await guestIn(host);
  const guest = await newPage(b);
  await guest.goto(`${base}/t/${code}`);
  await guestIn(guest);
  await host.getByTestId('start').waitFor();
  await host.waitForTimeout(1500);
  await host.getByTestId('start').click();
  await host.getByTestId('mode-screen').waitFor();
  await guest.getByTestId('mode-screen').waitFor();
  ok(await host.getByTestId('mode-screen').getAttribute('data-mode') === 'pitty-pat' && await guest.getByTestId('mode-screen').getAttribute('data-mode') === 'pitty-pat', 'online: host start puts both humans (+2 bots) on the Pitty Pat table');
  ok(await host.locator('.pp-seat').count() === 4, 'online: 4 seats (2 humans + 2 bots)');
  const hostCards = await host.locator('[data-testid^="pp-card-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  const guestHtml = await guest.content();
  ok(hostCards.length > 0 && hostCards.every((t) => !guestHtml.includes(`"${t}"`)), 'online: the guest never sees the host\'s cards');
  await playToRecap([host, guest], '7b-online-table-390.png');
  const pts = await Promise.all([0, 1, 2, 3].map(async (i) => Number(((await host.getByTestId(`recap-points-${i}`).textContent()) ?? '').replace(/\D/g, ''))));
  ok(Math.max(...pts) === 2, `online: full game to the points target (winner 2 pts: ${pts.join('/')})`);
  await host.screenshot({ path: `${shots}/7b-online-recap-390.png` });
  await layoutOk(host, 'online recap');
}

async function tonkOffline(b: Browser) {
  console.log('tonk offline');
  const p = await newPage(b);
  await p.goto(base);
  await guestIn(p);
  await p.evaluate(() => localStorage.removeItem('pp.modeChoice'));
  await toBots(p);
  await p.getByTestId('mode-setup').waitFor();
  ok(!(await p.getByTestId('pick-tonk').isDisabled()), 'Tonk is listed (no "Coming soon")');
  await p.getByTestId('pick-tonk').click();
  ok(await p.getByTestId('pick-tonk').getAttribute('aria-checked') === 'true', 'host can pick Tonk');
  await p.getByTestId('mode-setup').scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${shots}/9b-setup-390.png` });
  ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, 'tonk setup: no horizontal scroll at 390');
  await p.evaluate(() => localStorage.setItem('pp.modeChoice', JSON.stringify({ modeId: 'tonk', options: { gameTarget: 5, handSize: '7', pauseBetweenHands: true, wilds: 'jokers' } })));
  await toBots(p);
  await p.getByTestId('start-bots').click();
  await p.getByTestId('mode-screen').waitFor();
  ok(await p.getByTestId('mode-screen').getAttribute('data-mode') === 'tonk', 'Deal me in opens Tonk vs bots');
  ok((await p.getByTestId('pp-goal').textContent())?.includes('First to 5 points') === true, 'tonk goal line shows the points target');
  ok(await p.getByTestId('tk-stake').count() === 0, 'tonk: no coins shown (stakes off by default)');
  await layoutOk(p, 'tonk table');
  const shotsTaken = { table: false, spread: false, hit: false, result: false, beat: false };
  // bots may deal the next hand quickly: record transient panels with an observer, not just by polling
  await p.evaluate(() => { const w = window as unknown as Record<string, boolean>; new MutationObserver(() => { if (document.querySelector('[data-testid="tk-hand-result"]')) w.__tkResult = true; if (document.querySelector('[data-testid="reshuffle-beat"]')) w.__tkBeat = true; }).observe(document.body, { childList: true, subtree: true }); });
  const flags = () => p.evaluate(() => { const w = window as unknown as Record<string, boolean>; return { result: !!w.__tkResult, beat: !!w.__tkBeat }; });
  // a game can end on an instant win in hand 1 (random deal): play again (same page) until the between-hands flow was seen
  for (let game = 0; game < 4; game++) {
    await playToRecap([p], undefined, async (pg) => {
      if (!shotsTaken.table && await pg.getByTestId('tk-drawStock').isVisible().catch(() => false)) { shotsTaken.table = true; await pg.screenshot({ path: `${shots}/9b-table-390.png` }); await layoutOk(pg, 'tonk 7-card hand'); }
      if (!shotsTaken.spread && await pg.locator('.pp-actions [data-testid^="tk-spread-"]').first().isVisible().catch(() => false)) { shotsTaken.spread = true; await pg.screenshot({ path: `${shots}/9b-spread-390.png` }); await layoutOk(pg, 'tonk spread controls'); }
      if (!shotsTaken.hit && await pg.locator('[data-testid^="tk-hit-"]').first().isVisible().catch(() => false)) { shotsTaken.hit = true; await pg.screenshot({ path: `${shots}/9b-hit-390.png` }); await layoutOk(pg, 'tonk hit controls'); }
      if (!shotsTaken.beat && await pg.getByTestId('reshuffle-beat').isVisible().catch(() => false)) shotsTaken.beat = true;
      if (!shotsTaken.result && await pg.getByTestId('tk-hand-result').isVisible().catch(() => false)) { shotsTaken.result = true; await pg.waitForTimeout(300); await pg.screenshot({ path: `${shots}/9b-hand-result-390.png` }); await layoutOk(pg, 'tonk hand result'); }
    });
    const f = await flags();
    if (f.result && f.beat && (shotsTaken.spread || shotsTaken.hit)) break;
    await p.getByTestId('mode-again').click();
    await p.getByTestId('mode-recap').waitFor({ state: 'hidden' });
  }
  const seen = await p.evaluate(() => { const w = window as unknown as Record<string, boolean>; return { result: !!w.__tkResult, beat: !!w.__tkBeat }; });
  ok(seen.result || shotsTaken.result, 'tonk: hand result shown between hands (pauseBetweenHands)');
  ok(seen.beat || shotsTaken.beat, 'tonk: "Collecting and reshuffling…" beat shown after Next hand');
  ok(shotsTaken.spread || shotsTaken.hit, `tonk: spread/hit controls seen (spread ${shotsTaken.spread}, hit ${shotsTaken.hit})`);
  const pts = await Promise.all([0, 1, 2, 3].map(async (i) => Number(((await p.getByTestId(`recap-points-${i}`).textContent()) ?? '').replace(/[^\d-]/g, ''))));
  ok(Math.max(...pts) >= 5 && pts.reduce((a, x) => a + x, 0) === 0, `tonk: full game to the points target, zero-sum (${pts.join('/')})`);
  ok(await p.getByTestId('tk-recap-hands').locator('li').count() >= 1, 'tonk recap lists hand by hand');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${shots}/9b-recap-390.png` });
  await layoutOk(p, 'tonk recap');
  await p.evaluate(() => localStorage.removeItem('pp.modeChoice'));
  await p.context().close();
}

async function tonkOnline(b: Browser) {
  console.log('tonk online');
  const r = await fetch(`${server}/api/tables`, { method: 'POST', headers: { origin: base } });
  if (!r.ok) throw new Error(`create ${r.status}`);
  const { code } = await r.json() as { code: string };
  const host = await newPage(b);
  await host.goto(base);
  await host.evaluate((c) => { sessionStorage.setItem(`bwm.created.${c}`, '1'); localStorage.setItem('pp.modeChoice', JSON.stringify({ modeId: 'tonk', options: { gameTarget: 5 } })); localStorage.setItem('bwm.online.name', 'Host'); }, code);
  await host.goto(`${base}/t/${code}`);
  await guestIn(host);
  const guest = await newPage(b);
  await guest.goto(`${base}/t/${code}`);
  await guestIn(guest);
  await host.getByTestId('start').waitFor();
  await host.waitForTimeout(1500);
  await host.getByTestId('start').click();
  await host.getByTestId('mode-screen').waitFor();
  await guest.getByTestId('mode-screen').waitFor();
  ok(await host.getByTestId('mode-screen').getAttribute('data-mode') === 'tonk' && await guest.getByTestId('mode-screen').getAttribute('data-mode') === 'tonk', 'tonk online: both humans (+bots) on the Tonk table');
  const hostCards = await host.locator('[data-testid^="tk-card-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  const guestHtml = await guest.content();
  ok(hostCards.length > 0 && hostCards.every((t) => !guestHtml.includes(`"${t}"`)), 'tonk online: the guest never sees the host\'s hand');
  await playToRecap([host, guest], '9b-online-table-390.png');
  const pts = await Promise.all([0, 1, 2, 3].map(async (i) => Number(((await host.getByTestId(`recap-points-${i}`).textContent().catch(() => '0')) ?? '').replace(/[^\d-]/g, '') || 0)));
  ok(Math.max(...pts) >= 5 && pts.reduce((a, x) => a + x, 0) === 0, `tonk online: full game to the points target, zero-sum (${pts.join('/')})`);
  await host.screenshot({ path: `${shots}/9b-online-recap-390.png` });
  await layoutOk(host, 'tonk online recap');
}

const b = await chromium.launch();
try {
  await offline(b).catch(async (e) => { for (const c of b.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: '/tmp/fail.png' }); throw e; });
  await pittyOffline(b).catch(async (e) => { for (const c of b.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: '/tmp/failpp.png' }); throw e; });
  await tonkOffline(b).catch(async (e) => { for (const c of b.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: '/tmp/failtk.png' }); throw e; });
  if (process.env.BWM_SKIP_ONLINE !== '1') await tonkOnline(b).catch(async (e) => { let i = 0; for (const c of b.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: `/tmp/failtko${i++}.png` }); throw e; });
  if (process.env.BWM_SKIP_ONLINE !== '1') await pittyOnline(b).catch(async (e) => { let i = 0; for (const c of b.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: `/tmp/failppo${i++}.png` }); throw e; });
  if (process.env.BWM_SKIP_ONLINE !== '1') await online(b).catch(async (e) => { let i = 0; for (const c of b.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: `/tmp/fail${i++}.png` }); throw e; });
} finally { await b.close(); }
