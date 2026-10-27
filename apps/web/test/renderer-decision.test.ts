/** V10a: the 3D / 2D table decision. 2D is always reachable; 3D only with WebGL2, a capable GPU, memory and motion allowed. */
import { describe, expect, it } from 'vitest';
import { decideRenderer, type RendererInputs } from '../src/three3d/renderer';
import { cameraFor } from '../src/three3d/PPScene';

const ok: RendererInputs = { query: null, pref: '3d', webgl2: true, majorCaveat: false, deviceMemory: 8, reduceEffects: false, osReducedMotion: false, failed: null };
const d = (o: Partial<RendererInputs>) => decideRenderer({ ...ok, ...o });

describe('decideRenderer', () => {
  it('3D on a capable device by default', () => { expect(d({})).toBe('3d'); expect(d({ deviceMemory: undefined })).toBe('3d'); });
  it.each<[string, Partial<RendererInputs>]>([
    ['no WebGL2', { webgl2: false }],
    ['major performance caveat', { majorCaveat: true }],
    ['deviceMemory 2', { deviceMemory: 2 }],
    ['deviceMemory 1', { deviceMemory: 1 }],
    ['Settings Table: 2D', { pref: '2d' }],
    ['Reduce effects', { reduceEffects: true }],
    ['OS reduced motion', { osReducedMotion: true }],
    ['context lost', { failed: 'context-lost' }],
    ['6 s first-frame timeout', { failed: 'timeout' }],
    ['chunk error', { failed: 'error' }],
    ['?table=2d', { query: '2d' }],
  ])('2D when %s', (_, o) => { expect(d(o)).toBe('2d'); });
  it('deviceMemory 4 keeps 3D', () => { expect(d({ deviceMemory: 4 })).toBe('3d'); });
  it('?table=2d beats everything; ?table=3d still needs WebGL2', () => {
    expect(d({ query: '2d', pref: '3d' })).toBe('2d');
    expect(d({ query: '3d', majorCaveat: true, osReducedMotion: true })).toBe('3d');
    expect(d({ query: '3d', webgl2: false })).toBe('2d');
  });
});

describe('cameraFor (spec §3)', () => {
  it('portrait / phone landscape / iPad', () => {
    expect(cameraFor(393 / 852)).toMatchObject({ pos: [0, 2.33, 2.55], fov: 56 });
    expect(cameraFor(852 / 393)).toMatchObject({ pos: [0, 1.71, 1.84], fov: 44 });
    expect(cameraFor(1180 / 820)).toMatchObject({ pos: [0, 1.88, 1.74], fov: 50 });
    expect(cameraFor(667 / 375)).toMatchObject({ pos: [0, 1.71, 1.84] });
  });
});

describe('CSP for the 3D layer', () => {
  it('allows blob: workers and images (three texture loaders), no new script origins', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const cfg = readFileSync(join(__dirname, '..', 'vite.config.ts'), 'utf8');
    expect(cfg).toContain(`"worker-src 'self' blob:"`);
    expect(cfg).toMatch(/"img-src 'self' data: blob:"/);
    expect(cfg).toContain(`"script-src 'self' 'wasm-unsafe-eval'"`); // unchanged: three needs no eval
  });
});
