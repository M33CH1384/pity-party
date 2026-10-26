/**
 * Live highlights (league data wave, item 6b): notable moments from ONLINE
 * games in progress, captured by the room at the points where it already
 * resolves them — a trick completing (nuke) and a hand ending (Boston,
 * made nils / blind nils, Wheels). The table DO stores them here; the
 * ticker reads them back via GET /api/social/highlights.
 *
 * Honesty rules, same as everywhere in the league build:
 *  - public display names only, and only for people actually at the table:
 *    an event is reported when at least one HUMAN (signed-in or guest)
 *    is on the acting side / seat. Bot-only moments are not league news.
 *  - offline games never appear — they aren't on the server.
 *  - the store is bounded (latest ~30 events, pruned on write) and reads
 *    drop anything older than 15 minutes: a highlight is live news, not
 *    history. Finished-match results live in the results feed instead.
 *
 * The extraction helpers are pure functions of the records the room
 * already has (completed tricks, the finished hand's HandRecord), so what
 * counts as a Boston / Wheels matches the stats pipeline's definitions
 * exactly (see the wheels predicate in stats/record.ts).
 */
// TODO(rebuild): per-trick / per-hand highlight extraction (Spades nukes, Bostons, nils, Wheels) was removed in 3b;
// registry modes report highlights through their own results (docs/plan/REBUILD.md).

export type HighlightType = 'nuke' | 'boston' | 'nil' | 'blindNil' | 'wheels';

export interface HighlightEvent {
  /** deterministic per (table, hand, type, principal): replays dedupe */
  id: string;
  at: number;
  type: HighlightType;
  /** the principal's public display name(s) — a player, or "A + B" for a side */
  name: string;
  /** the ticker-ready description, without the LIVE prefix (the client adds it) */
  text: string;
  /** the table code the moment happened at */
  code: string;
  hand: number | null;
  /** marquee tier (item 7): also posted to global chat as a League Wire line */
  marquee: boolean;
}

export interface HighlightSeat { name: string; kind: 'user' | 'guest' | 'bot'; side: number }

export const HIGHLIGHT_TTL_MS = 15 * 60_000;
const KEEP = 30;
const PRUNE_AGE_MS = 60 * 60_000;

/**
 * The League Wire copy for a marquee event (item 7): the ticker's
 * description, breaking-news framing, and the table it happened at —
 * "🚨 BREAKING — Dee + Kim just ran a Boston in Hand 7 at Table TBL9".
 */
export function wireText(ev: HighlightEvent): string {
  return `🚨 BREAKING — ${ev.text} at Table ${ev.code}`;
}

/** Store one event and prune: older than an hour out, newest ~30 kept. */
export async function recordHighlight(db: D1Database, ev: HighlightEvent): Promise<void> {
  await db.prepare('INSERT OR REPLACE INTO live_highlights (id, at, type, name, text, code, hand) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(ev.id, ev.at, ev.type, ev.name, ev.text, ev.code, ev.hand).run();
  await db.prepare('DELETE FROM live_highlights WHERE at < ?').bind(ev.at - PRUNE_AGE_MS).run();
  await db.prepare(`DELETE FROM live_highlights WHERE id NOT IN (SELECT id FROM live_highlights ORDER BY at DESC, id DESC LIMIT ${KEEP})`).run();
}

/** The ticker's read: newest first, nothing older than the TTL. */
export async function recentHighlights(db: D1Database, now: number, limit = 12): Promise<Omit<HighlightEvent, 'marquee'>[]> {
  const rows = (await db.prepare('SELECT id, at, type, name, text, code, hand FROM live_highlights WHERE at > ? ORDER BY at DESC, id DESC LIMIT ?')
    .bind(now - HIGHLIGHT_TTL_MS, limit)
    .all<{ id: string; at: number; type: string; name: string; text: string; code: string; hand: number | null }>()).results;
  return rows.map((r) => ({ id: r.id, at: r.at, type: r.type as HighlightType, name: r.name, text: r.text, code: r.code, hand: r.hand }));
}
