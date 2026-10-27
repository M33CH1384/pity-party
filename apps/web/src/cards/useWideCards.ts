import { useSyncExternalStore } from 'react';
/** Big screens (≥ 900×700, e.g. iPad / desktop) get full-size cards with the pip grid and lettered courts;
 *  phones get the compact face (big corner index + one big centre suit) so indices stay ≥ 14px at 390. */
const Q = '(min-width: 900px) and (min-height: 700px)';
const mq = () => (typeof matchMedia === 'function' ? matchMedia(Q) : null);
const sub = (f: () => void) => { const m = mq(); m?.addEventListener?.('change', f); return () => m?.removeEventListener?.('change', f); };
const get = () => mq()?.matches ?? false;
export const useWideCards = () => useSyncExternalStore(sub, get, () => false);
