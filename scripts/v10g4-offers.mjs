/** V10g-4 check: 4–5 Pitty Pat offers in portrait 3D pack into the compact grid (≤ 2 rows), every offer ≥ 44 px, and the
 *  re-solved fan stays above them. Offers are cloned in the live DOM (a 5-wild-pair deal can't be forced), then a resize
 *  makes HandFan re-measure. Usage: node scripts/v10g4-offers.mjs [baseUrl] */
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
for (const [w, h] of [[393, 852], [375, 667]]) for (const n of [4, 5]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { localStorage.setItem('bwm.entryGuest', '1'); localStorage.setItem('bwm.online.name', 'Guest'); localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true, counts: {} })); localStorage.setItem('pp.modeChoice', JSON.stringify({ modeId: 'pitty-pat', options: {} })); localStorage.setItem('pp.table3d.v1', '3d'); });
  const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  await p.goto(base + '/?table=3d');
  const g = p.getByRole('button', { name: /play as guest/i }); await g.waitFor({ timeout: 4000 }).then(() => g.click()).catch(() => {});
  await p.getByTestId('play').click(); await p.getByTestId('play-bots').click(); await p.getByTestId('start-bots').click();
  await p.locator('[data-testid="my-hand"].is-posed').waitFor({ timeout: 45000 });
  await p.evaluate((n) => { const a = document.querySelector('.pp-actions'); const t = a.querySelector('.pp-move'); a.querySelectorAll('.pp-move').forEach((x, i) => { if (i) x.remove(); }); for (let i = 1; i < n; i++) { const c = t.cloneNode(true); c.textContent = `Pair ${['Q♠', 'K♦', '10♦', '4♣'][i - 1]} with 2♣ (wild)`; a.appendChild(c); } t.textContent = 'Pair Q♥ with 2♣ (wild)'; }, n);
  await p.setViewportSize({ width: w, height: h - 1 }); await p.waitForTimeout(800); await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(1500);
  const m = await p.evaluate(() => {
    const bs = [...document.querySelectorAll('.pp-actions .pp-move')].map((e) => e.getBoundingClientRect());
    const slots = [...document.querySelectorAll('[data-testid="my-hand"] .pp-card-slot')].map((e) => e.getBoundingClientRect());
    return { rows: new Set(bs.map((r) => Math.round(r.top))).size, minH: Math.min(...bs.map((r) => r.height)), minW: Math.min(...bs.map((r) => r.width)), actsTop: Math.min(...bs.map((r) => r.top)), fanBottom: Math.max(...slots.map((r) => r.bottom)), fanTop: Math.min(...slots.map((r) => r.top)), hs: document.documentElement.scrollWidth > innerWidth };
  });
  const ok = m.rows <= 2 && m.minH >= 44 && m.minW >= 44 && m.fanBottom <= m.actsTop && !m.hs;
  if (!ok) fails++;
  console.log(ok ? 'ok ' : 'BAD', JSON.stringify({ w, h, n, ...m }));
  await p.screenshot({ path: `docs/screenshots/v10g-4/offers${n}-${w}x${h}.png` });
  await ctx.close();
}
await b.close();
process.exit(fails ? 1 : 0);
