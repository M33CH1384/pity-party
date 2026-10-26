/**
 * Tonk bot tiers (M9a). Every choice comes from the bot's own seat view (its hand, public spreads/discards/log,
 * card counts) and the server's seeded RNG, so play is deterministic per seed and tell-free.
 *  - easy: loose — sometimes misses spreads/hits/useful discards, drops at a random threshold each turn.
 *  - normal: solver-driven (least deadwood), always spreads + hits, drops at count ≤ 5 (≤ 7 heads-up).
 *  - hard: normal + estimates each opponent's count from the unseen cards, drops only when it's likely lowest
 *    (avoids caught drops), hits aggressively (incl. locking a threatening opponent under hitLock), plays for a
 *    Tonk-out, and avoids discarding cards an opponent just showed interest in or that feed a slap.
 */
import type { BotStrategy, BotTier } from '../registry';
import { type Card, countValue } from '../cards';
import type { TkMove, TkView } from './tonk';
import { hitOnto, isWildCard, tkCount } from './tonk';
import { bestMelds, minDeadwood } from './tonkSolver';

type Pick<T extends TkMove['t']> = Extract<TkMove, { t: T }>;
const of = <T extends TkMove['t']>(legal: readonly TkMove[], t: T) => legal.filter((m): m is Pick<T> => m.t === t);
const choice = <T>(xs: readonly T[], rng: () => number): T => xs[Math.floor(rng() * xs.length)]!;
const key = (ids: readonly string[]) => [...ids].sort().join();

/** Average count of a card this seat can't see (deck minus own hand, spreads, the visible discard history). */
function unseenAvg(v: TkView): number {
  const seen = new Set<string>();
  let seenSum = 0;
  const see = (c: Card) => { if (!seen.has(c.id)) { seen.add(c.id); seenSum += countValue(c); } };
  v.hand.forEach(see);
  for (const sp of v.spreads) sp.cards.forEach(see);
  for (const e of v.log) if (e.e === 'discard') see(e.card);
  if (v.discardTop) see(v.discardTop);
  const jokers = v.options.wilds === 'jokers' ? 2 : 0;
  const total = 340; // 4 × (1+…+10 + 10+10+10); jokers count 0
  const n = 52 + jokers - seen.size;
  return n > 0 ? Math.max(0, total - seenSum) / n : 6.5;
}

/** Hard's guess at each opponent's hand count: cards × unseen average, lighter for seats that just spread/hit. */
function oppEstimates(v: TkView): number[] {
  const me = v.seat as number;
  const avg = unseenAvg(v);
  return v.handCounts.map((n, i) => (i === me ? Infinity : n * avg));
}

function wantsDrop(v: TkView, tier: BotTier, rng: () => number): boolean {
  const mine = tkCount(v.hand);
  const opps = v.handCounts.length - 1;
  if (tier === 'easy') return mine <= 2 + Math.floor(rng() * 9); // 2..10, fresh every turn
  if (tier === 'normal') return mine <= (opps === 1 ? 7 : 5);
  if (mine === 0) return true;
  // hard: drop only when it beats the lowest estimate with some margin (a caught drop costs caughtPenalty each)
  const low = Math.min(...oppEstimates(v));
  const margin = v.options.caughtPenalty >= 2 ? 0.6 : 0.75;
  return mine <= 10 && mine < low * margin;
}

function choose(v: TkView, legal: readonly TkMove[], tier: BotTier, rng: () => number): TkMove {
  const o = v.options;
  const me = v.seat as number;
  const nh = of(legal, 'nextHand')[0]; if (nh) return nh;

  // slap window: free card off our hand count isn't the point — it lets us shed one, so take it unless easy dozes
  const slaps = of(legal, 'slap');
  if (slaps.length || of(legal, 'waive').length) {
    if (!slaps.length || (tier === 'easy' && rng() < 0.5)) return of(legal, 'waive')[0] ?? legal[0]!;
    return tier === 'hard' ? slaps.find((m) => v.spreads.find((sp) => sp.id === m.spreadId)?.owner !== me) ?? slaps[0]! : slaps[0]!;
  }

  // turn start: drop or draw
  if (of(legal, 'drawStock').length || of(legal, 'drawDiscard').length || of(legal, 'drop').length) {
    if (of(legal, 'drop').length && wantsDrop(v, tier, rng)) return of(legal, 'drop')[0]!;
    const top = v.discardTop;
    const stock = of(legal, 'drawStock')[0];
    const take = of(legal, 'drawDiscard')[0];
    if (take && top) {
      const helps = minDeadwood([...v.hand, top], o) < minDeadwood(v.hand, o) + countValue(top);
      const fitsSpread = v.spreads.some((sp) => hitOnto(sp, top, o));
      const useful = helps || (tier !== 'easy' && fitsSpread) || isWildCard(top, o);
      if (!stock || (useful && !(tier === 'easy' && rng() < 0.4))) return take;
    }
    return stock ?? take ?? legal[0]!;
  }

  // meld phase
  const spreads = of(legal, 'spread');
  const hits = of(legal, 'hit');
  const discards = of(legal, 'discard');
  if (tier === 'easy') {
    if (spreads.length && rng() < 0.6) return choice(spreads, rng);
    if (hits.length && rng() < 0.5) return choice(hits, rng);
  } else {
    const plan = bestMelds(v.hand, o);
    const want = new Set(plan.melds.map(key));
    const sp = spreads.find((m) => want.has(key(m.cardIds)));
    if (sp) return sp;
    // hits: a hit whose card isn't part of a planned meld only helps
    const planned = new Set(plan.melds.flat());
    const good = hits.filter((h) => !planned.has(h.cardId));
    if (good.length) {
      if (tier === 'hard') {
        // hit the most threatening opponent's spread first (hit lock freezes their next turn), else biggest card
        const est = oppEstimates(v);
        const own = (h: Pick<'hit'>) => v.spreads.find((x) => x.id === h.spreadId)!.owner;
        const score = (h: Pick<'hit'>) => (o.hitLock && own(h) !== me ? 100 - Math.min(99, est[own(h)]!) : 0) + countValue(v.hand.find((c) => c.id === h.cardId)!);
        return [...good].sort((a, b) => score(b) - score(a))[0]!;
      }
      return good[0]!;
    }
  }
  if (!discards.length) return legal[0]!;
  if (tier === 'easy') {
    const byVal = [...discards].sort((a, b) => countValue(card(v, b.cardId)) - countValue(card(v, a.cardId)));
    return choice(byVal.slice(0, 3), rng);
  }
  // shed the card whose loss leaves the least deadwood; keep wilds; hard avoids feeding slaps / discard takers
  const takers = new Set<string>();
  for (const e of v.log) if (e.e === 'draw' && e.from === 'discard' && e.seat !== me && e.card) takers.add(`${e.card.rank}${e.card.suit}`);
  const danger = (c: Card) => {
    if (tier !== 'hard') return 0;
    let d = 0;
    if (o.slap && v.spreads.some((sp) => hitOnto(sp, c, o))) d += 4;
    for (const t of takers) if (Number.parseInt(t, 10) === c.rank) d += 2;
    return d;
  };
  const score = (id: string) => {
    const c = card(v, id);
    return minDeadwood(v.hand.filter((x) => x.id !== id), o) * 10 - countValue(c) + (isWildCard(c, o) ? 1000 : 0) + danger(c) * 10;
  };
  const lo = Math.min(...discards.map((d) => score(d.cardId)));
  return choice(discards.filter((d) => score(d.cardId) === lo), rng);
}

const card = (v: TkView, id: string) => v.hand.find((c) => c.id === id)!;

export const tonkBot: BotStrategy<TkMove, TkView> = {
  modeId: 'tonk',
  choose(view, legalMoves, tier, rng) {
    if (!legalMoves.length) throw new Error('no legal move');
    return choose(view, legalMoves, tier, rng);
  },
};
