/** V10b budget (plan §4): table textures ≤ 700 KB gz on High, ≤ 250 KB on Low (one theme's inlay loads at a time), no file over 1 MB. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '../public/three3d');
const gz = (f: string) => gzipSync(readFileSync(join(dir, f)), { level: 9 }).length;
const files = readdirSync(dir);

describe('3D texture budget', () => {
  it.each(['A', 'B', 'C', 'K'])('theme %s: High ≤ 700 KB, Low ≤ 250 KB', (t) => {
    const high = ['suede-nor-1k.webp', 'suede-rough-1k.webp', 'wood-1k.webp', `inlay-${t}-1k.webp`, 'env-256.hdr'];
    const low = ['suede-nor-512.webp', 'suede-rough-512.webp', 'wood-512.webp', `inlay-${t}-512.webp`];
    expect(high.reduce((a, f) => a + gz(f), 0)).toBeLessThanOrEqual(700 * 1024);
    expect(low.reduce((a, f) => a + gz(f), 0)).toBeLessThanOrEqual(250 * 1024);
  });
  it('every file is WebP or the one small HDRI, none over 1 MB', () => {
    for (const f of files) { expect(f).toMatch(/\.webp$|^env-256\.hdr$/); expect(readFileSync(join(dir, f)).length).toBeLessThan(1024 * 1024); }
  });
});
