/** Shared card core for every Pity Party mode. Suits never matter in Mode A; they do in Mode B runs. */
export const SUITS = ['C', 'D', 'H', 'S'] as const;
export type Suit = (typeof SUITS)[number];
/** 1 = Ace … 11 = Jack, 12 = Queen, 13 = King. 0 = joker. */
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  /** stable unique id within one deck, e.g. "QH", "10S", "JK1" (deck index appended when decks > 1) */
  id: string;
  rank: Rank;
  /** null only for jokers */
  suit: Suit | null;
}

const RANK_LABEL = ['JK', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export function rankLabel(r: Rank): string { return RANK_LABEL[r]; }

export interface DeckSpec { decks?: number; jokers?: number }

/** A fresh, ordered deck: `decks` × 52 cards plus `jokers` jokers per deck. */
export function buildDeck(spec: DeckSpec = {}): Card[] {
  const decks = spec.decks ?? 1;
  const jokers = spec.jokers ?? 0;
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) {
    const tag = decks > 1 ? `#${d}` : '';
    for (const suit of SUITS) for (let r = 1; r <= 13; r++) out.push({ id: `${RANK_LABEL[r]}${suit}${tag}`, rank: r as Rank, suit });
    for (let j = 1; j <= jokers; j++) out.push({ id: `JK${j}${tag}`, rank: 0, suit: null });
  }
  return out;
}

/** Count value used by deadwood/Tonk scoring: A=1, 2–10 face, J/Q/K=10, joker=0. */
export function countValue(c: Card): number {
  if (c.rank === 0) return 0;
  return c.rank >= 10 ? 10 : c.rank;
}

export const sameRank = (a: Card, b: Card): boolean => a.rank === b.rank;
export const handCount = (cards: readonly Card[]): number => cards.reduce((n, c) => n + countValue(c), 0);
