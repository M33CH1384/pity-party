/**
 * Demetrius (2026-10-26): a short "Collecting and reshuffling…" beat between a hand's result and the next deal
 * (Next hand flow), Pitty Pat and Tonk. Display only: no engine state or scoring changes. ~700ms, a plain fade,
 * skipped entirely under prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from 'react';

export const RESHUFFLE_MS = 700;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True for RESHUFFLE_MS after the table leaves the hand-over phase into a fresh deal. */
export function useReshuffleBeat(phase: string): boolean {
  const prev = useRef(phase);
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const was = prev.current;
    prev.current = phase;
    if (was !== 'handOver' || phase === 'handOver' || phase === 'over' || reduced()) return;
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    // not tied to the effect cleanup: later phase changes (bots playing on) must not cancel the hide
    timer.current = setTimeout(() => { timer.current = null; setOn(false); }, RESHUFFLE_MS);
  }, [phase]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return on;
}

export function ReshuffleBeat({ on }: { on: boolean }) {
  return on ? <p className="pp-reshuffle" data-testid="reshuffle-beat" role="status">Collecting and reshuffling…</p> : null;
}
