/** Count WebGL draw calls per rendered frame on the 3D table (Pitty Pat + Tonk, 393×852 and 1180×820). */
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://localhost:4174';
const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const modeId of ['pitty-pat', 'tonk']) for (const [w, h] of [[393, 852], [1180, 820]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((m) => {
    localStorage.setItem('bwm.entryGuest', '1'); localStorage.setItem('bwm.online.name', 'Guest'); localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true, counts: {} }));
    localStorage.setItem('pp.modeChoice', JSON.stringify({ modeId: m, options: {} })); localStorage.setItem('pp.table3d.v1', '3d');
    const w = window; w.__dc = 0; w.__frames = [];
    for (const P of [WebGL2RenderingContext.prototype]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) { const o = P[f]; if (o) P[f] = function (...a) { w.__dc++; return o.apply(this, a); }; }
    const raf = w.requestAnimationFrame.bind(w); w.requestAnimationFrame = (cb) => raf((t) => { const before = w.__dc; cb(t); const n = w.__dc - before; if (n) w.__frames.push(n); });
  }, modeId);
  const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  await p.goto(base + '/?table=3d');
  const g = p.getByRole('button', { name: /play as guest/i }); await g.waitFor({ timeout: 4000 }).then(() => g.click()).catch(() => {});
  await p.getByTestId('play').click(); await p.getByTestId('play-bots').click(); await p.getByTestId('start-bots').click();
  await p.locator('[data-testid="my-hand"].is-posed').waitFor({ timeout: 45000 }); await p.waitForTimeout(3000);
  const f = await p.evaluate(() => window.__frames);
  console.log(JSON.stringify({ modeId, w, h, frames: f.length, max: Math.max(...f), last: f.at(-1) }));
  await ctx.close();
}
await b.close();
