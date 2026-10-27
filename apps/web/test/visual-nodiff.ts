/**
 * V0 no-visual-change proof: screenshots the same screens from two builds (BEFORE on :4301, AFTER on :4302,
 * each a static `apps/web/dist`) at the 4 spec viewports and compares the PNG bytes.
 * Run: serve both dists (python3 -m http.server), then `npx tsx apps/web/test/visual-nodiff.ts`.
 */
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
const VP = [[393, 852], [852, 393], [667, 375], [1180, 820]] as const;
const b = await chromium.launch();
const results: string[] = [];
let diffs = 0;
for (const [w, h] of VP) {
  const shots: Record<string, Buffer[]> = {};
  for (const [tag, port] of [['master', Number(process.env.BEFORE_PORT ?? 4301)], ['v0', Number(process.env.AFTER_PORT ?? 4302)]] as const) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { localStorage.setItem('bwm.online.name', 'Guest'); localStorage.setItem('bwm.entryGuest', '1'); localStorage.setItem('bwm.tips', JSON.stringify({ on: false, asked: true, counts: {} })); localStorage.setItem('bwm.music.v1', JSON.stringify({ on: false })); });
    const p = await ctx.newPage();
    await p.addStyleTag({ content: '' }).catch(() => {});
    await p.goto(`http://127.0.0.1:${port}/`);
    const g = p.getByRole('button', { name: /play as guest/i });
    await g.waitFor({ timeout: 4000 }).then(() => g.click()).catch(() => {});
    await p.getByTestId('play').waitFor(); await p.waitForTimeout(1500);
    const a = await p.screenshot({ animations: 'disabled' });
    await p.getByTestId('play').click(); await p.getByTestId('play-bots').click(); await p.getByTestId('mode-setup').waitFor(); await p.waitForTimeout(800);
    const s = await p.screenshot({ animations: 'disabled' });
    await p.getByTestId('start-bots').waitFor(); 
    shots[tag] = [a, s];
    const files = ['home', 'setup'];
    for (let i = 0; i < 2; i++) await import('node:fs').then((fs) => fs.writeFileSync(`${process.env.SHOTS ?? '/tmp/v0shots'}/${tag}-${files[i]}-${w}x${h}.png`, shots[tag]![i]!));
    await ctx.close();
  }
  for (let i = 0; i < 2; i++) {
    const [m, v] = [shots.master![i]!, shots.v0![i]!];
    const same = m.equals(v);
    if (!same) diffs++;
    results.push(`${['home', 'setup'][i]} ${w}x${h}: ${same ? 'IDENTICAL' : 'DIFF'} (${createHash('sha1').update(m).digest('hex').slice(0, 10)} vs ${createHash('sha1').update(v).digest('hex').slice(0, 10)})`);
  }
}
console.log(results.join('\n'));
console.log(diffs ? `DIFFS ${diffs}` : 'ALL IDENTICAL');
await b.close();
