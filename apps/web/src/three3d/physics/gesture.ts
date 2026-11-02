/** V10h gesture classifier (HAND-SPEC §D/§F1). PURE: pointer samples in, decision out (no DOM, no three). */
import { FLIGHT } from './flight';

export interface PointerSample { x: number; y: number; t: number }
export type Release = { kind: 'tap' | 'flick' | 'spring'; v: { x: number; y: number }; travel: number };

/** release velocity (px/s) over the last `windowMs` of samples */
export function releaseVelocity(samples: readonly PointerSample[], windowMs = 80): { x: number; y: number } {
  // the pointerup usually repeats the last move's position: measure up to the last real movement, but a finger that
  // stopped and held (> 100 ms between that move and the release) is not a flick
  let n = samples.length;
  while (n > 1 && samples[n - 1]!.x === samples[n - 2]!.x && samples[n - 1]!.y === samples[n - 2]!.y) n--;
  if (n < samples.length && samples[samples.length - 1]!.t - samples[n - 1]!.t > 100) return { x: 0, y: 0 };
  const s = samples.slice(0, n);
  if (s.length < 2) return { x: 0, y: 0 };
  const last = s[s.length - 1]!;
  let i = s.length - 2;
  while (i > 0 && last.t - s[i]!.t < windowMs) i--;
  const a = s[i]!, dt = Math.max(1, last.t - a.t) / 1000;
  return { x: (last.x - a.x) / dt, y: (last.y - a.y) / dt };
}

/** tap: barely moved; flick: fast upward (≥ 900 px/s) with ≥ 40 px travel; anything else springs back */
export function classifyRelease(s: readonly PointerSample[]): Release {
  const v = releaseVelocity(s);
  if (!s.length) return { kind: 'tap', v, travel: 0 };
  const a = s[0]!, b = s[s.length - 1]!;
  const travel = Math.hypot(b.x - a.x, b.y - a.y);
  if (travel < 10) return { kind: 'tap', v, travel };
  if (v.y <= -FLIGHT.FLICK_MIN_V && a.y - b.y >= FLIGHT.FLICK_MIN_TRAVEL) return { kind: 'flick', v, travel };
  return { kind: 'spring', v, travel };
}
