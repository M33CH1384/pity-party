/** V10g-3 held-hand shots: Pitty Pat + Tonk × themes A/B/C/K × 4 sizes, 3D table (SwiftShader). Also logs draw calls + DOM tap-target checks.
 *  Usage: node scripts/v10g3-shots.mjs [baseUrl]   (ONLY=tk-B to filter) */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:4174';
const out = 'docs/screenshots/v10g-3'; mkdirSync(out, { recursive: true });
const sizes = [[393, 852], [852, 393], [1180, 820], [667, 375]];
const modes = { pp: { modeId: 'pitty-pat', options: {} }, tk: { modeId: 'tonk', options: { gameTarget: 5, handSize: '5' } } };
const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = [];
for (const [g, choice] of Object.entries(modes)) for (const t of ['A', 'B', 'C', 'K']) for (const [w, h] of sizes) {
  const tag = `${t}-${g}-${w}x${h}`; if (process.env.ONLY && !tag.includes(process.env.ONLY)) continue;
  const mobile = w < 900;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(([c, th]) => { localStorage.setItem('bwm.online.name', 'Guest'); localStorage.setItem('bwm.entryGuest', '1'); localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true, counts: {} })); localStorage.setItem('pp.modeChoice', JSON.stringify(c)); localStorage.setItem('pp.theme.v1', JSON.stringify({ theme: th })); localStorage.setItem('pp.table3d.v1', '3d'); }, [choice, t]);
  const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  try {
    await p.goto(base + '/?table=3d');
    const gb = p.getByRole('button', { name: /play as guest/i }); await gb.waitFor({ timeout: 4000 }).then(() => gb.click()).catch(() => {});
    await p.locator('[data-testid="start-bots"], [data-testid="play"]').first().waitFor();
    if (await p.getByTestId('play').isVisible().catch(() => false)) { await p.getByTestId('play').click(); await p.getByTestId('play-bots').click(); }
    await p.getByTestId('start-bots').click();
    await p.getByTestId('mode-screen').waitFor();
    await p.locator('[data-testid="my-hand"].is-posed').waitFor({ timeout: 45000 });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${out}/3d-${tag}.png` });
    const m = await p.evaluate(() => {
      const slots = [...document.querySelectorAll('[data-testid="my-hand"] .pp-card-slot')].map((e) => e.getBoundingClientRect());
      return { n: slots.length, maxBottom: Math.max(...slots.map((r) => r.bottom)), minW: Math.min(...slots.map((r) => r.width)), hscroll: document.documentElement.scrollWidth > innerWidth,
        small: [...document.querySelectorAll('.mode-screen button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44); }).length,
        calls: window.__ppRenderInfo?.calls ?? null };
    });
    report.push({ tag, ...m, h, errs: errs.slice(0, 3) });
  } catch (e) { report.push({ tag, fail: String(e).slice(0, 200), errs }); await p.screenshot({ path: `/tmp/v10g-logs/fail-${tag}.png` }).catch(() => {}); }
  console.log(JSON.stringify(report.at(-1)));
  await ctx.close();
}
await b.close();
