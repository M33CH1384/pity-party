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
await ctx.addInitScript(() => { localStorage.setItem('bwm.entryGuest', '1'); localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true, counts: {} }));
  const w = window as unknown as { __seen: Set<string> }; w.__seen = new Set(); new MutationObserver(() => document.querySelectorAll<HTMLElement>('[data-testid="my-hand"] .pcard[data-card]').forEach((e) => w.__seen.add(e.dataset.card!))).observe(document, { subtree: true, childList: true, attributes: true }); });
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
// V10c: the 3D fan only ever paints faces the DOM hand showed this seat (its own hand)
await p.waitForFunction(() => document.querySelector('[data-testid="mode-screen"]')?.getAttribute('data-hand3d') === 'on', null, { timeout: 8000 }).catch(() => {});
await p.waitForTimeout(6000); // bots play a few turns
const leak = await p.evaluate(() => { const w = window as unknown as { __pp3dFaces?: string[]; __seen?: Set<string> }; return { faces: w.__pp3dFaces ?? [], seen: [...(w.__seen ?? [])] }; });
ok(leak.faces.length > 0, `3D hand drew ${leak.faces.length} own faces`);
ok(leak.faces.every((f) => leak.seen.includes(f)), `no 3D face outside this seat's own DOM hand (${leak.faces.filter((f) => !leak.seen.includes(f)).join(',') || 'none'})`);
ok(await p.locator('[data-testid="my-hand"] [data-testid^="pp-card-"]').count() > 0 && await p.locator('[data-testid="my-hand"] .card-face[aria-label], [data-testid="my-hand"] .pcard-btn[aria-label]').count() > 0, 'DOM hand stays in the tree as the labelled, test-id input layer');

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
