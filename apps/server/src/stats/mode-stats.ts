/**
 * Generic per-player stats for every registry mode, read from mode_games (migration 0034).
 * Mode-agnostic: games, wins (placement 1), coin net, best/last finish. Free tier: one indexed
 * scan of the player's most recent games (capped), no extra tables.
 */
export interface ModeStat {
  modeId: string;
  games: number;
  wins: number;
  /** sum of this player's coin changes (coins only, never real money) */
  coins: number;
  /** average finishing place (1 = best), 2 decimals */
  avgPlace: number;
  lastAt: number;
}
export interface RecentModeGame { modeId: string; endedAt: number; place: number; of: number; delta: number; room: string }
export interface ModeStats { total: { games: number; wins: number; coins: number }; modes: ModeStat[]; recent: RecentModeGame[] }

const SCAN_CAP = 500;

interface Row { mode_id: string; room: string; ended_at: number; seats_json: string; placements_json: string; deltas_json: string }

export async function modeStatsFor(db: D1Database, uid: string, recentN = 10): Promise<ModeStats> {
  // seats_json is a small JSON array; instr() narrows the scan, the JSON parse below confirms the seat.
  const rows = await db.prepare(
    `SELECT mode_id, room, ended_at, seats_json, placements_json, deltas_json FROM mode_games
     WHERE instr(seats_json, ?) > 0 ORDER BY ended_at DESC LIMIT ${SCAN_CAP}`,
  ).bind(JSON.stringify(uid)).all<Row>();
  const by = new Map<string, ModeStat & { placeSum: number }>();
  const recent: RecentModeGame[] = [];
  const total = { games: 0, wins: 0, coins: 0 };
  for (const r of rows.results ?? []) {
    let seats: { seat: number; uid: string | null }[]; let placements: number[]; let deltas: number[];
    try { seats = JSON.parse(r.seats_json); placements = JSON.parse(r.placements_json); deltas = JSON.parse(r.deltas_json); } catch { continue; }
    const mine = seats.find((s) => s.uid === uid);
    if (!mine) continue;
    // placements = seat indices, best first
    const at = placements.indexOf(mine.seat);
    const place = at >= 0 ? at + 1 : seats.length;
    const delta = deltas[mine.seat] ?? 0;
    const m = by.get(r.mode_id) ?? { modeId: r.mode_id, games: 0, wins: 0, coins: 0, avgPlace: 0, lastAt: 0, placeSum: 0 };
    m.games++; m.placeSum += place; m.coins += delta; if (place === 1) m.wins++; m.lastAt = Math.max(m.lastAt, r.ended_at);
    by.set(r.mode_id, m);
    total.games++; total.coins += delta; if (place === 1) total.wins++;
    if (recent.length < recentN) recent.push({ modeId: r.mode_id, endedAt: r.ended_at, place, of: seats.length, delta, room: r.room });
  }
  const modes = [...by.values()].map(({ placeSum, ...m }) => ({ ...m, avgPlace: Math.round((placeSum / m.games) * 100) / 100 }))
    .sort((a, b) => b.games - a.games || b.lastAt - a.lastAt);
  return { total, modes, recent };
}
