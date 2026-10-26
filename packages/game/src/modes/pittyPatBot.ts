/**
 * Pitty Pat bots (milestone 7a), per docs/plan/RULES.md "Mode A › Bots". Tell-free: a bot sees only its own
 * seat's view (own hand + public table: upcard, shelves, the face-up pile, passes) and the legal list; all
 * randomness comes from the rng the server derives from (seed, move number, seat), so bot play is deterministic.
 *   easy   — pair whenever it can (a natural pair before spending a wild 2); shed a random card.
 *   normal — as easy, but keep held pairs and wild 2s; shed the rank that is most "dead" (most copies face-up).
 *   hard   — as normal; among equally dead cards shed one the next seat has shown it lacks (passed on), and
 *            with may-pair decline a single that would break a held pair.
 * Deuces wild: a 2 is never shed while any other card can go, and a natural pair is always preferred to a 2.
 */
import type { BotStrategy, BotTier } from '../registry';
import type { Card } from '../cards';
import type { PpMove, PpView } from './pittyPat';

const pick = <T>(xs: readonly T[], rng: () => number): T => xs[Math.floor(rng() * xs.length)]!;
const byRank = (hand: readonly Card[]) => { const m = new Map<number, number>(); for (const c of hand) m.set(c.rank, (m.get(c.rank) ?? 0) + 1); return m; };
type Discard = Extract<PpMove, { t: 'discard' }>;

/** Next active seat to act after `seat` (whoever faces the card we shed). */
function nextSeat(v: PpView, seat: number): number {
  const n = v.active.length;
  for (let k = 1; k <= n; k++) { const i = (seat + k) % n; if (v.active[i] && v.handCounts[i]! > 0) return i; }
  return seat;
}

function chooseShed(v: PpView, legal: readonly Discard[], tier: BotTier, rng: () => number): PpMove {
  const wild = v.options.deucesWild;
  const cardOf = new Map(v.hand.map((c) => [c.id, c]));
  const isWild = (m: Discard) => wild && cardOf.get(m.cardId)!.rank === 2;
  const pool0 = legal.some((m) => !isWild(m)) ? legal.filter((m) => !isWild(m)) : [...legal];
  if (tier === 'easy') return pick(pool0, rng);
  const counts = byRank(v.hand);
  const passedByNext = new Set(v.passed[nextSeat(v, v.seat as number)] ?? []);
  const score = (m: Discard) => {
    const c = cardOf.get(m.cardId)!;
    const mine = counts.get(c.rank) ?? 0;
    const unseen = Math.max(0, 4 - (v.seen[c.rank] ?? 0) - mine); // copies that could still be out there
    const keepPair = mine >= 2 && v.options.dealtWinAuto ? 10 : 0; // held pairs go out together
    if (tier === 'normal') return keepPair + unseen;
    return keepPair + unseen + (passedByNext.has(c.rank) ? -0.5 : 0);
  };
  let best = Infinity;
  let pool: Discard[] = [];
  for (const m of pool0) { const sc = score(m); if (sc < best) { best = sc; pool = [m]; } else if (sc === best) pool.push(m); }
  return pick(pool, rng);
}

export const pittyPatBot: BotStrategy<PpMove, PpView> = {
  modeId: 'pitty-pat',
  choose(view, legal, tier, rng) {
    if (!legal.length) throw new Error('no legal move');
    const next = legal.find((m) => m.t === 'nextHand');
    if (next) return next;
    const deuce = new Set(view.options.deucesWild ? view.hand.filter((c) => c.rank === 2).map((c) => c.id) : []);
    const natural = (ms: Extract<PpMove, { t: 'pair' | 'steal' }>[]) => { const n = ms.filter((m) => !m.cardIds.some((id) => deuce.has(id))); return n.length ? n : ms; };
    const steal = natural(legal.filter((m): m is Extract<PpMove, { t: 'steal' }> => m.t === 'steal'));
    if (steal.length) return tier === 'easy' ? steal[0]! : pick(steal, rng);
    const pairs = natural(legal.filter((m): m is Extract<PpMove, { t: 'pair' }> => m.t === 'pair'));
    if (pairs.length) {
      if (tier === 'hard' && view.options.mustPair === 'may' && view.upcard) {
        // never break a held pair to take a single
        const counts = byRank(view.hand);
        const decline = legal.find((m) => m.t === 'flip' || m.t === 'pass');
        if (decline && (counts.get(view.upcard.rank) ?? 0) >= 2 && view.options.dealtWinAuto && !view.options.tripsAsOne) return decline;
      }
      return tier === 'easy' ? pairs[0]! : pick(pairs, rng);
    }
    const sheds = legal.filter((m): m is Discard => m.t === 'discard');
    if (sheds.length) return chooseShed(view, sheds, tier, rng);
    return legal[0]!; // flip / pass / waive: forced or the only choice
  },
};
