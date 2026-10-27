/**
 * V10a e2e: the table renderer switch. `?table=2d` forces the 2D table (no canvas, no three chunk fetched);
 * without it a WebGL2 browser gets the 3D layer under the 2D HUD; Settings "Table: 2D" drops it live.
 * Run: BWM_URL=http://localhost:4179/ npx tsx apps/web/test/renderer-2d.e2e.ts
 */
import { chromium, type Page } from 'playwright-core';

const URL = (process.env.BWM_URL ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
let fails = 0;
const ok = (c: unknown, m: string) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const renderer = (p: Page) => p.getByTestId('mode-screen').getAttribute('data-renderer');

async function toTable(p: Page, q = '') {
  await p.goto(URL + q);
  const g = p.getByRole('button', { name: /play as guest/i }); await g.waitFor({ timeout: 3000 }).then(() => g.click()).catch(() => {});
  await p.getByTestId('play').click(); await p.getByTestId('play-bots').click(); await p.getByTestId('start-bots').click();
  await p.getByTestId('mode-screen').waitFor();
}

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { localStorage.setItem('bwm.entryGuest', '1'); localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true, counts: {} })); });
const p = await ctx.newPage();
const scene: string[] = []; p.on('request', (r) => { if (/PPScene-/.test(r.url())) scene.push(r.url()); });

await toTable(p, '?table=2d');
await p.waitForTimeout(2500);
ok(await renderer(p) === '2d', '?table=2d: table is 2D');
ok(await p.locator('.table3d-layer canvas').count() === 0, '?table=2d: no 3D canvas');
ok(scene.length === 0, '?table=2d: the three chunk is never fetched');
ok(await p.getByTestId('trick-area').isVisible(), '?table=2d: 2D table playable (trick area visible)');

await toTable(p);
await p.waitForFunction(() => document.querySelector('[data-testid="mode-screen"]')?.getAttribute('data-renderer') === '3d', null, { timeout: 7000 }).catch(() => {});
ok(await renderer(p) === '3d', 'default (WebGL2): 3D layer drew its first frame');
ok(await p.locator('.table3d-layer canvas').count() === 1, 'default: one canvas under the HUD');
ok(await p.getByTestId('trick-area').isVisible(), 'default: 2D HUD still mounted on top');
ok(scene.length > 0, 'default: PPScene chunk loaded lazily');

const pc = await b.newContext({ viewport: { width: 390, height: 844 } });
await pc.addInitScript(() => { localStorage.setItem('bwm.entryGuest', '1'); localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true, counts: {} })); localStorage.setItem('pp.table3d.v1', '2d'); });
const p1 = await pc.newPage(); await toTable(p1); await p1.waitForTimeout(1500);
ok(await renderer(p1) === '2d' && await p1.locator('.table3d-layer canvas').count() === 0, 'Settings Table: 2D (stored) keeps the table 2D');

const rm = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
await rm.addInitScript(() => { localStorage.setItem('bwm.entryGuest', '1'); localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true, counts: {} })); });
const p2 = await rm.newPage(); await toTable(p2); await p2.waitForTimeout(1500);
ok(await renderer(p2) === '2d' && await p2.locator('.table3d-layer canvas').count() === 0, 'OS reduced motion: 2D');

await b.close();
console.log(fails ? `RENDERER E2E FAIL (${fails})` : 'RENDERER E2E PASS');
process.exit(fails ? 1 : 0);
