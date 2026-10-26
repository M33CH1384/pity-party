/**
 * Live highlights (league data wave, item 6b): pure extraction from the
 * records the room already resolves + the bounded store + the read route.
 * Pins the honesty rules: human seats/sides only (bot moments are not
 * league news), Boston suppresses the same side's Wheels line, a regular
 * made nil is ticker-only (marquee = false) while a blind nil is marquee,
 * and stale events never leave the store's read.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeD1 } from './d1';
import { recentHighlights, recordHighlight, type HighlightEvent, type HighlightSeat } from '../src/stats/highlights';

const NOW = 1_800_000_000_000;
const SEATS: HighlightSeat[] = [
  { name: 'Dee', kind: 'user', side: 0 }, { name: 'Ray', kind: 'user', side: 1 },
  { name: 'Kim', kind: 'user', side: 0 }, { name: 'Bot', kind: 'bot', side: 1 },
];
const side = (side: number, tricks: number, o: Partial<{ contract: number; contractMade: boolean | null; nils: { seat: number; kind: 'nil' | 'blindNil'; made: boolean }[] }> = {}) => ({
  side, seats: [], contract: o.contract ?? 0, contractTricks: tricks, tricks, contractMade: o.contractMade ?? null,
  contractPoints: 0, nils: o.nils ?? [], bagsAdded: 0, bagPenaltyCount: 0, bagPenaltyPoints: 0, bookPoints: 0,
  points: 0, totalScore: 0, totalBags: 0, shot: false,
});
const rec = (sides: ReturnType<typeof side>[], bids: unknown[] = [4, 4, 4, 4]): HandRecord =>
  ({ handNo: 7, dealer: 0, bids: bids as HandRecord['bids'], tricksWon: [0, 0, 0, 0], sides: sides as HandRecord['sides'] });

describe('the bounded store + read route shape', () => {
  let db: D1Database;
  beforeEach(async () => { db = await makeD1(); });
  const ev = (id: string, at: number): HighlightEvent => ({ id, at, type: 'nuke', name: 'Dee', text: `☢ Dee's nuke blew in Hand 1`, code: 'TBL9', hand: 1, marquee: true });

  it('keeps only the latest ~30 and drops stale events on read', async () => {
    for (let i = 0; i < 35; i++) await recordHighlight(db, ev(`e${i}`, NOW + i * 1000));
    const all = await recentHighlights(db, NOW + 34_000, 50);
    expect(all.length).toBe(30);
    expect(all[0]!.id).toBe('e34');
    // 16 minutes later everything is stale for the ticker
    expect(await recentHighlights(db, NOW + 34_000 + 16 * 60_000)).toEqual([]);
  });

  it('the same event id stored twice stays one row (dedupe by id)', async () => {
    await recordHighlight(db, ev('dup', NOW));
    await recordHighlight(db, ev('dup', NOW));
    expect(await recentHighlights(db, NOW)).toHaveLength(1);
  });
});
