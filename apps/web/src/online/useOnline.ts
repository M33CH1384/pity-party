import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ConnState, TableConnection } from './connection';
import type { VideoMesh, VideoState } from './video';

export function useConn(conn: TableConnection): ConnState {
  return useSyncExternalStore(conn.subscribe, conn.getState);
}

const EMPTY_VIDEO: VideoState = { cam: false, mic: false, local: null, remote: {}, conn: {}, needsTap: true, muted: [], limited: [], music: {}, hidden: [], error: null, busy: false };
export function useVideo(mesh: VideoMesh | null): VideoState {
  return useSyncExternalStore(mesh ? mesh.subscribe : () => () => {}, mesh ? mesh.getState : () => EMPTY_VIDEO);
}

/* ------------------------------------------------------------------- chat */

/**
 * Collapse back-to-back system lines so they don't flood the chat: identical lines become "… ×N", and runs of
 * timeouts become one "⏱ Out of time: Niaaa ×2 · Dre" line. Returns null when the two lines don't merge.
 */
export function mergeSystem(prev: string, next: string): string | null {
  const TO = /^(.+) ran out of time$/;
  const tally = (t: string): Map<string, number> | null => {
    const m = TO.exec(t);
    if (m) return new Map([[m[1]!, 1]]);
    if (!t.startsWith('⏱ Out of time: ')) return null;
    const out = new Map<string, number>();
    for (const part of t.slice('⏱ Out of time: '.length).split(' · ')) { const [, who, n] = /^(.+?)(?: ×(\d+))?$/.exec(part)!; out.set(who!, Number(n ?? 1)); }
    return out;
  };
  const a = tally(prev), b = tally(next);
  if (a && b) {
    for (const [k, v] of b) a.set(k, (a.get(k) ?? 0) + v);
    return '⏱ Out of time: ' + [...a].map(([k, v]) => (v > 1 ? `${k} ×${v}` : k)).join(' · ');
  }
  const base = (t: string) => { const m = /^(.*) ×(\d+)$/.exec(t); return m ? { t: m[1]!, n: Number(m[2]) } : { t, n: 1 }; };
  const p = base(prev);
  if (p.t === next) return `${p.t} ×${p.n + 1}`;
  return null;
}

const PALETTE = ['#4fd1ff', '#ff6ad5', '#7dff9b', '#ff9f43', '#b892ff', '#5ef2d0', '#ff7a7a'];
export function colorFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** emoji reaction maps on raw lines vs rendered msgs (plain JSON, cheap to compare) */
export function sameReactions(a: Record<string, string[]> | undefined, b: Record<string, string[]> | undefined): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}


export const SPECTATOR_TAG = 'Spectator';
const HIDE_SPEC_KEY = 'bwm.hideSpectatorChat';
export const loadHideSpectatorChat = () => { try { return localStorage.getItem(HIDE_SPEC_KEY) === '1'; } catch { return false; } };
export const saveHideSpectatorChat = (on: boolean) => { try { localStorage.setItem(HIDE_SPEC_KEY, on ? '1' : '0'); } catch { /* private mode */ } };

/** Chat speaker. Spectators see the sender's name, including their own — never "You". */
export function chatUserLabel(lineName: string, from: string | null | undefined, you: string | null, spectating: boolean): string {
  if (!spectating && from && from === you) return 'You';
  return lineName || 'Player';
}


/**
 * Client epoch ms when a server deadline is reached.
 * Compute this once per server snapshot. Calling it again with a later `clientNow`
 * slides the target forward and the countdown never moves.
 */
export function clientDeadline(deadline: number | null, serverNow: number, clientNow: number): number | null {
  if (deadline == null) return null;
  return clientNow + (deadline - serverNow);
}

/** Countdown (seconds) to a deadline, re-rendering every second. */
export function useCountdown(deadline: number | null): number | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}
