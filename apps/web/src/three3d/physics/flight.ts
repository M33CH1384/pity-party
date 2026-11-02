/**
 * V10h card-flight physics (Desi hand-v2 HAND-SPEC §F). PURE: plain numbers and tuples, no three.js, no DOM, so the
 * same integrator can be ported 1:1 (e.g. to Swift/Metal). The renderer turns a sample into a pose:
 *   position = p;  orientation = slerp(launch, flatOnFelt, flat) · then world-Y spin `spin`, local pitch `pitch`,
 *   local roll `roll`, and (stock flips) a turn of `turn` rad about the card's long axis.
 * World units are metres; times are ms.
 */
export type V3 = [number, number, number];

export const FLIGHT = {
  FLICK_MIN_V: 900, FLICK_MIN_TRAVEL: 40, T_MIN: 260, T_MAX: 520, XZ_EASE_POW: 1.6, SPIN_BASE_DEG: 90, SPIN_MAX_DEG: 300,
  NOSE_UP: 0.17, SETTLE_MS: 120, BOUNCE: 0.0025, ROCK_DEG: 2, BOT_DELAY_MIN: 150, BOT_DELAY_MAX: 250, BOT_V: 1400,
  FLIP_LIFT: 0.12, FLIP_MS: 400, FLIP_SETTLE_MS: 100, FLIP_BOUNCE: 0.002, PAIR_MS: 320, PAIR_H: 0.05,
} as const;

const DEG = Math.PI / 180;
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface FlightPlan {
  p0: V3; p1: V3; T: number; h: number; spin: number; vx: number; delay: number;
  /** stock flip: half-turn about the long axis on a cubic-bezier(.45,0,.55,1) clock, no spin */
  flip: boolean; settleMs: number; bounce: number; rock: number;
}

const dxz = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[2] - a[2]);

/** §F1: a flick released at screen velocity v (px/s, y up negative) from p0 to the pile p1. */
export function planFlick(p0: V3, p1: V3, v: { x: number; y: number }): FlightPlan {
  const sp = Math.max(1, Math.hypot(v.x, v.y)), d = dxz(p0, p1);
  const T = clamp(520 - 0.06 * (sp - FLIGHT.FLICK_MIN_V), FLIGHT.T_MIN, FLIGHT.T_MAX) + 40 * Math.max(0, d - 0.9);
  const h = clamp(0.03 + 0.04 * d, 0.04, 0.1);
  const spinDeg = Math.min(FLIGHT.SPIN_MAX_DEG, FLIGHT.SPIN_BASE_DEG + clamp((240 * Math.abs(v.x)) / sp, 0, 210));
  return { p0, p1, T, h, spin: Math.sign(v.x || 1) * spinDeg * DEG, vx: v.x / sp, delay: 0, flip: false, settleMs: FLIGHT.SETTLE_MS, bounce: FLIGHT.BOUNCE, rock: FLIGHT.ROCK_DEG * DEG };
}

/** deterministic 0..1 from a string seed (FNV-1a) */
export function seeded(seed: string, k = 0): number {
  let h = 2166136261; const s = `${seed}:${k}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** §F3: opponents / bots / pair moves / stock flips use the same integrator with scripted velocity and a human delay. */
export function planScripted(kind: 'play' | 'pair' | 'flip', p0: V3, p1: V3, seed: string, opts: { delay?: boolean } = {}): FlightPlan {
  const j = (k: number) => 1 + (seeded(seed, k) * 2 - 1) * 0.15; // ±15%
  const delay = opts.delay ? FLIGHT.BOT_DELAY_MIN + seeded(seed, 9) * (FLIGHT.BOT_DELAY_MAX - FLIGHT.BOT_DELAY_MIN) : 0;
  if (kind === 'flip') return { p0, p1, T: FLIGHT.FLIP_MS * j(1), h: FLIGHT.FLIP_LIFT, spin: 0, vx: 0, delay, flip: true, settleMs: FLIGHT.FLIP_SETTLE_MS, bounce: FLIGHT.FLIP_BOUNCE, rock: 1.5 * DEG };
  const side = seeded(seed, 2) < 0.5 ? -1 : 1;
  const f = planFlick(p0, p1, { x: side * FLIGHT.BOT_V * 0.35, y: -FLIGHT.BOT_V });
  if (kind === 'pair') return { ...f, T: FLIGHT.PAIR_MS * j(1), h: FLIGHT.PAIR_H * j(3), spin: f.spin * 0.3, delay };
  return { ...f, T: f.T * j(1), h: f.h * j(3), delay };
}

export interface FlightSample { p: V3; flat: number; spin: number; pitch: number; roll: number; turn: number; height: number; shadowScale: number; shadowOpacity: number; done: boolean }

const bezierFlip = (t: number) => { // cubic-bezier(.45,0,.55,1), solved by bisection on x
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 18; i++) { u = (lo + hi) / 2; const x = 3 * u * (1 - u) * (1 - u) * 0.45 + 3 * u * u * (1 - u) * 0.55 + u * u * u; if (x < t) lo = u; else hi = u; }
  return 3 * u * u * (1 - u) + u * u * u;
};

/** Pose at `ms` since the flight was planned (the delay is included: before it the card waits at p0). */
export function sampleFlight(f: FlightPlan, ms: number): FlightSample {
  const m = ms - f.delay;
  const t = clamp(m / f.T, 0, 1);
  const e = f.flip ? bezierFlip(t) : 1 - Math.pow(1 - t, FLIGHT.XZ_EASE_POW);
  const baseY = lerp(f.p0[1], f.p1[1], t);
  const p: V3 = [lerp(f.p0[0], f.p1[0], e), baseY + 4 * f.h * t * (1 - t), lerp(f.p0[2], f.p1[2], e)];
  let pitch = f.flip ? 0 : FLIGHT.NOSE_UP * Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t);
  const roll = f.flip ? 0 : 3 * DEG * f.vx * (1 - t);
  if (m > f.T) { // landing settle: damped bounce + rock about the leading edge
    const s = m - f.T;
    if (s < f.settleMs) { const k = Math.exp(-s / 30), w = Math.sin((2 * Math.PI * s) / 80); p[1] += f.bounce * k * Math.abs(w); pitch += f.rock * k * w; }
  }
  const height = Math.max(0, p[1] - f.p1[1]);
  return {
    p, flat: Math.min(1, e * 1.15), spin: f.spin * (1 - e), pitch, roll, turn: f.flip ? Math.PI * (1 - e) : 0, height,
    shadowScale: 1.15 + 6 * height, shadowOpacity: Math.max(0.15, 0.55 - 2.2 * height),
    done: m >= f.T + f.settleMs,
  };
}

/** §F1 weak flick: spring the card back to its slot (k 300, c 26, unit mass) — fraction of the release offset left at ms. */
export function springBack(ms: number, k = 300, c = 26): number {
  // under-damped (c² < 4k): x = e^{-c t/2}(cos ωt + (c/2ω) sin ωt), t in s; clamp tiny overshoot so it never crosses ~4 px
  const t = ms / 1000, w = Math.sqrt(k - (c * c) / 4);
  const x = Math.exp((-c * t) / 2) * (Math.cos(w * t) + (c / (2 * w)) * Math.sin(w * t));
  return Math.max(-0.02, x);
}
export const SPRING_MS = 280;
