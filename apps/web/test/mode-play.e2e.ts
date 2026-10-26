/**
 * Registry-mode play at 390px (headless Chromium; WebKit isn't available on the box).
 * 1) Offline: Setup → "Deal me in" plays High Card vs 3 bots to the recap, then Play again.
 * 2) Online (needs `wrangler dev --local` on :8787): host creates a table, the picked mode goes up as a
 *    `mode` message, a guest joins, both play through `move` messages with per-seat views, recap shows.
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
async function playToRecap(pages: Page[], shotMid?: string): Promise<void> {
  let shot = false;
  for (let i = 0; i < 400; i++) {
    for (const p of pages) {
      if (await p.getByTestId('mode-recap').isVisible().catch(() => false)) continue;
      const card = p.locator('.pcard-btn:not([disabled])').first();
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
  await guestIn(p);
  await p.getByTestId('play').click();
  await p.getByTestId('door-team').click();
  const m = p.locator('[data-testid^="mode-"]').first();
  await m.click();
  await p.getByTestId('play-bots').click();
  if (await m.isVisible().catch(() => false)) await m.click();
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
  await playToRecap([host, guest], '2.3b-online-table-390.png');
  await host.screenshot({ path: `${shots}/2.3b-online-recap-390.png` });
  ok(await host.getByTestId('mode-again').textContent() === 'Rematch', 'host gets Rematch');
  ok(await guest.getByTestId('mode-again').textContent() === 'Back to lobby', 'guest gets Back to lobby');
  await host.getByTestId('mode-again').click();
  await host.getByTestId('mode-recap').waitFor({ state: 'hidden' });
  ok(true, 'rematch deals a new online game');
}

const b = await chromium.launch();
try {
  await offline(b).catch(async (e) => { for (const c of b.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: '/tmp/fail.png' }); throw e; });
  if (process.env.BWM_SKIP_ONLINE !== '1') await online(b).catch(async (e) => { let i = 0; for (const c of b.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: `/tmp/fail${i++}.png` }); throw e; });
} finally { await b.close(); }
