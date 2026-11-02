import { describe, expect, it } from 'vitest';
import { FLIGHT, planFlick, planScripted, sampleFlight, springBack, type V3 } from '../src/three3d/physics/flight';
import { classifyRelease, releaseVelocity } from '../src/three3d/physics/gesture';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const p0: V3 = [0, 1.2, 0.6], p1: V3 = [0.1, 0.9, -0.2];
const swipe = (dy: number, ms: number, dx = 0, n = 8) => Array.from({ length: n + 1 }, (_, i) => ({ x: 200 + (dx * i) / n, y: 600 + (dy * i) / n, t: (ms * i) / n }));

describe('flight physics (pure, HAND-SPEC §F)', () => {
  it('is free of three.js / DOM so it can be ported', () => {
    for (const f of ['flight.ts', 'gesture.ts']) expect(readFileSync(join(__dirname, '../src/three3d/physics', f), 'utf8')).not.toMatch(/from 'three'|document\.|window\./);
  });
  it('T 260–520 ms by speed, apex 0.04–0.10 m, spin ≤ 300°', () => {
    for (const sp of [900, 1500, 3000, 9000]) for (const vx of [-sp, 0, sp]) {
      const f = planFlick(p0, p1, { x: vx * 0.7, y: -sp });
      expect(f.T).toBeGreaterThanOrEqual(260); expect(f.T).toBeLessThanOrEqual(520 + 40);
      expect(f.h).toBeGreaterThanOrEqual(0.04); expect(f.h).toBeLessThanOrEqual(0.1);
      expect(Math.abs(f.spin)).toBeLessThanOrEqual((300 * Math.PI) / 180 + 1e-9);
    }
    expect(planFlick(p0, p1, { x: 0, y: -900 }).T).toBeGreaterThan(planFlick(p0, p1, { x: 0, y: -4000 }).T);
  });
  it('starts at p0, lands exactly at p1, lifts above the line, settles in 120 ms with a ≤ 2.5 mm bounce, spin unwinds', () => {
    const f = planFlick(p0, p1, { x: 600, y: -1800 });
    expect(sampleFlight(f, 0).p).toEqual(p0);
    const mid = sampleFlight(f, f.T / 2); expect(mid.p[1]).toBeGreaterThan((p0[1] + p1[1]) / 2 + 0.02);
    const land = sampleFlight(f, f.T); expect(land.p[0]).toBeCloseTo(p1[0], 9); expect(land.p[2]).toBeCloseTo(p1[2], 9); expect(land.spin).toBeCloseTo(0, 9); expect(land.flat).toBe(1);
    let maxB = 0; for (let s = 0; s <= 120; s += 2) maxB = Math.max(maxB, sampleFlight(f, f.T + s).p[1] - p1[1]);
    expect(maxB).toBeGreaterThan(0.0005); expect(maxB).toBeLessThanOrEqual(0.0025 + 1e-9);
    expect(sampleFlight(f, f.T + 119).done).toBe(false); expect(sampleFlight(f, f.T + 120).done).toBe(true);
  });
  it('shadow grows and fades with height and is the 1.15 / .55 contact shadow on the felt', () => {
    const f = planFlick(p0, p1, { x: 0, y: -1500 });
    const end = sampleFlight(f, f.T + 200); expect(end.shadowScale).toBeCloseTo(1.15); expect(end.shadowOpacity).toBeCloseTo(0.55);
  });
  it('bots: 150–250 ms seeded human delay, deterministic, card waits at p0; flips are 400 ms ±15% half-turns with a 12 cm lift', () => {
    const a = planScripted('play', p1, p0, 'seed-1', { delay: true }), b = planScripted('play', p1, p0, 'seed-1', { delay: true });
    expect(a).toEqual(b); expect(a.delay).toBeGreaterThanOrEqual(150); expect(a.delay).toBeLessThanOrEqual(250);
    expect(sampleFlight(a, a.delay - 1).p).toEqual(p1);
    const fl = planScripted('flip', p0, p1, 'x');
    expect(fl.T).toBeGreaterThanOrEqual(340); expect(fl.T).toBeLessThanOrEqual(460); expect(fl.h).toBe(FLIGHT.FLIP_LIFT);
    expect(sampleFlight(fl, 0).turn).toBeCloseTo(Math.PI); expect(sampleFlight(fl, fl.T).turn).toBeCloseTo(0);
  });
  it('weak-flick spring returns to the slot in ~280 ms without a big overshoot', () => {
    expect(springBack(0)).toBe(1); expect(Math.abs(springBack(280))).toBeLessThan(0.05);
    for (let t = 0; t < 600; t += 5) expect(springBack(t)).toBeGreaterThanOrEqual(-0.02);
  });
});

describe('gesture classifier (§F1)', () => {
  it('velocity over the last 80 ms', () => { const v = releaseVelocity(swipe(-120, 100)); expect(v.y).toBeCloseTo(-1200, -1); });
  it('fast upward swipe ≥ 40 px = flick; slow or short or downward = spring; still = tap', () => {
    expect(classifyRelease(swipe(-120, 100)).kind).toBe('flick');
    expect(classifyRelease(swipe(-120, 400)).kind).toBe('spring');      // 300 px/s
    expect(classifyRelease(swipe(-30, 20)).kind).toBe('spring');        // fast but < 40 px
    expect(classifyRelease(swipe(120, 100)).kind).toBe('spring');       // downward
    expect(classifyRelease(swipe(-4, 100)).kind).toBe('tap');
    expect(classifyRelease(swipe(-100, 80, 160)).kind).toBe('flick');   // diagonal still counts (flick is intent, not aim)
    const s = swipe(-120, 100); const end = s[s.length - 1]!;
    expect(classifyRelease([...s, { ...end, t: end.t + 30 }]).kind).toBe('flick');   // pointerup repeats the last position
    expect(classifyRelease([...s, { ...end, t: end.t + 400 }]).kind).toBe('spring'); // stopped and held, then let go
  });
});
