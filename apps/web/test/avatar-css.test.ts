/** Avatar sizing (Demetrius 2026-10-20): uploaded pics must FILL their circle, and profile
 *  headers get a much bigger circle. The tiny-thumbnail bug was CSS: the pic was a grid item
 *  sized by width/height:100%, which resolves against the circle's auto-sized grid track —
 *  WebKit rendered it at ~half the disc. The fill is now absolute (inset:0), like .vb-pic. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const social = readFileSync(new URL('../src/social/social.css', import.meta.url), 'utf8');
const account = readFileSync(new URL('../src/account/account.css', import.meta.url), 'utf8');

/** The declaration block of the first rule whose selector matches exactly. */
function rule(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)${esc} \\{\\s*([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`rule not found: ${selector}`);
  return m[1]!;
}
function px(body: string, prop: string): number {
  const m = new RegExp(`${prop}: (\\d+)px`).exec(body);
  if (!m) throw new Error(`no ${prop} in: ${body}`);
  return Number(m[1]);
}

describe('avatar pic fill', () => {
  it('the pic absolutely fills its circle instead of sizing as a grid item', () => {
    const circle = rule(styles, '.has-pic');
    expect(circle).toContain('position: relative');
    expect(circle).toContain('overflow: hidden');
    const img = rule(styles, '.has-pic img');
    expect(img).toContain('position: absolute');
    expect(img).toContain('inset: 0');
    expect(img).toContain('object-fit: cover');
    expect(img).toContain('width: 100%');
    expect(img).toContain('height: 100%');
  });
});

describe('avatar circular clip', () => {
  it('the lobby seat pic clips to the ring’s circle, not the ring’s square box', () => {
    // The seat ring's roundness lives on the PARENT (.seat-ring: background +
    // box-shadow) and the ring itself never clips — the ready-check badge and the
    // video bubble sit on its edge. So the pic element must carry the circle:
    // .has-pic supplies overflow:hidden, but clipping follows the element's own
    // border-radius. Without the radius here the pic rendered as the ring's full
    // bounding square, corners breaking the gold circle (owner 2026-10-24).
    const seat = rule(styles, '.seat-ring .av-initial.has-pic');
    expect(seat).toContain('position: absolute');
    expect(seat).toContain('inset: 0');
    expect(seat).toContain('border-radius: 50%');
  });

});

describe('avatar sizes', () => {

  it('list rows get a modest bump; the account sheet pic grows too', () => {
    expect(px(rule(social, '.soc-av'), 'width')).toBe(44);
    expect(px(rule(styles, '.soc-av.frow'), 'width')).toBe(40);
    expect(px(rule(social, '.ranks-row .soc-av'), 'width')).toBe(44);
    expect(px(rule(account, '.acct-avatar'), 'width')).toBe(56);
  });


});
