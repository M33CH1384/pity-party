/** V10h e2e (3D, SwiftShader, 393×852): coach hint, tap the 3D deck to draw (Tonk), flick a hand card up to discard
 *  (same action as tap: hand −1, discard top = that card, a 3D flight runs), a weak flick springs back (no move).
 *  Usage: node scripts/v10h-gestures.mjs [baseUrl] */
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
let fails = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { localStorage.setItem('bwm.entryGuest', '1'); localStorage.setItem('bwm.online.name', 'Guest'); localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true, counts: {} })); localStorage.setItem('pp.modeChoice', JSON.stringify({ modeId: 'tonk', options: { gameTarget: 5, handSize: '5' } })); localStorage.setItem('pp.table3d.v1', '3d'); });
const p = await ctx.newPage(); p.setDefaultTimeout(30000);
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(base + '/?table=3d');
const g = p.getByRole('button', { name: /play as guest/i }); await g.waitFor({ timeout: 4000 }).then(() => g.click()).catch(() => {});
await p.getByTestId('play').click(); await p.getByTestId('play-bots').click(); await p.getByTestId('start-bots').click();
await p.locator('[data-testid="my-hand"].is-posed').waitFor({ timeout: 45000 });
ok(await p.getByTestId('gesture-coach').isVisible().catch(() => false), 'coach hint shows on the first game');
await p.screenshot({ path: 'docs/screenshots/v10h/coach-393x852.png' });
// wait for my draw (bots may go first)
await p.getByTestId('stock-hit').waitFor({ timeout: 60000 });
const box = await p.getByTestId('stock-hit').boundingBox();
ok(box && box.width >= 44 && box.height >= 44, `deck tap box ≥ 44 px (${box?.width}×${box?.height})`);
console.log('   top', await p.evaluate(([x, y]) => { const h = document.elementFromPoint(x, y); return `${h?.tagName}.${h?.className} ${h?.dataset?.testid ?? ''}`; }, [box.x + 32, box.y + 32]));
const n0 = await p.locator('[data-testid="my-hand"] .pp-card-slot').count();
await p.evaluate(() => { window.__clk = []; window.addEventListener('click', (e) => window.__clk.push(`${e.target.className}|${e.defaultPrevented}`), true); window.addEventListener('pointerdown', (e) => window.__clk.push(`pd:${e.target.className}`), true); });
await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
console.log('   clk', await p.evaluate(() => window.__clk));
console.log('   prog', await p.evaluate(() => { const b = document.querySelector('[data-testid="tk-drawStock"]'); return b ? `${b.disabled} ${Object.keys(b).filter((k) => k.startsWith('__react')).join(',')}` : 'none'; }));
await p.waitForTimeout(1500); console.log('   after-hit n', await p.locator('[data-testid="my-hand"] .pp-card-slot').count(), await p.evaluate(() => document.querySelector('[data-testid="turn-line"]')?.textContent));
await p.waitForFunction((n) => document.querySelectorAll('[data-testid="my-hand"] .pp-card-slot').length === n + 1, n0, { timeout: 8000 }).then(() => ok(true, 'tapping the 3D deck draws (same as "Draw from stock")'), () => ok(false, 'tapping the 3D deck draws'));
console.log('   dbg', await p.evaluate(() => ({ turn: document.querySelector('[data-testid="turn-line"]')?.textContent, n: document.querySelectorAll('[data-testid="my-hand"] .pp-card-slot').length, acts: [...document.querySelectorAll('.pp-actions button')].map((b) => b.textContent) })), n0);
ok(!(await p.getByTestId('gesture-coach').isVisible().catch(() => false)), 'coach hint dismissed after the first success');
// visible point of a discardable card
const pt = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); for (let fy = 0.2; fy < 0.9; fy += 0.1) for (let fx = 0.06; fx < 0.95; fx += 0.04) { const x = r.left + r.width * fx, y = r.top + r.height * fy, h = document.elementFromPoint(x, y); if (h && el.contains(h)) return { x, y, id: el.querySelector('button')?.dataset.testid }; } return null; }, sel);
await p.waitForSelector('[data-testid="my-hand"] .pp-card-slot[data-discard]', { timeout: 8000 });
// weak flick: slow 60 px up → springs back, nothing played
let c = await pt('[data-testid="my-hand"] .pp-card-slot[data-discard]');
const nA = await p.locator('[data-testid="my-hand"] .pp-card-slot').count();
await p.mouse.move(c.x, c.y); await p.mouse.down();
for (let i = 1; i <= 6; i++) { await p.mouse.move(c.x, c.y - i * 10); await p.waitForTimeout(60); }
await p.mouse.up(); await p.waitForTimeout(700);
ok(await p.locator('[data-testid="my-hand"] .pp-card-slot').count() === nA, 'weak flick (slow, 60 px) plays nothing');
ok(await p.evaluate(() => [...document.querySelectorAll('[data-testid="my-hand"] .pp-card-slot')].every((s) => !s.style.translate)), 'weak flick springs back to the slot');
// real flick: 140 px up in ~50 ms
c = await pt('[data-testid="my-hand"] .pp-card-slot[data-discard]');
// SwiftShader stalls the main thread for 100s of ms per frame, so real-time mouse moves can't reach flick speed headless:
// dispatch the same pointer events in one synchronous burst, 10 ms apart (event timeStamps are creation times)
await p.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y); const o = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, button: 0 };
  const wait = (ms) => { const t = performance.now(); while (performance.now() - t < ms); };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: x, clientY: y }));
  for (let i = 1; i <= 5; i++) { wait(10); el.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: x + i * 4, clientY: y - i * 28 })); }
  wait(8); el.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: x + 20, clientY: y - 140 }));
}, c);
console.log('   gesture', JSON.stringify(await p.evaluate(() => window.__ppGesture)));
const flew = await p.waitForFunction(() => (window.__pp3dFlights ?? 0) > 0, null, { timeout: 3000 }).then(() => true, () => false);
await p.waitForTimeout(150); await p.screenshot({ path: 'docs/screenshots/v10h/flick-midflight-393x852.png' });
const after = await p.waitForFunction(([n, id]) => document.querySelectorAll('[data-testid="my-hand"] .pp-card-slot').length === n - 1 && !document.querySelector(`[data-testid="${id}"]`), [nA, c.id], { timeout: 8000 }).then(() => true, () => false);
ok(after, `flick up discards ${c.id} (hand ${nA} → ${nA - 1}, through the Discard action)`);
ok(flew, 'the discard flies on the 3D table');
await p.waitForTimeout(900); await p.screenshot({ path: 'docs/screenshots/v10h/flick-landed-393x852.png' });
ok(errs.length === 0, `no page errors${errs.length ? `: ${errs[0]}` : ''}`);
await b.close();
process.exit(fails ? 1 : 0);
