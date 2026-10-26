import type { ModeGameRecord } from '../room';

/** Generic per-game stats row for any registry mode (migration 0034). Idempotent on id. */
export async function saveModeGame(db: D1Database, rec: ModeGameRecord): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO mode_games (id, room, mode_id, options_json, ended_at, seats_json, placements_json, deltas_json, recap_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(rec.id, rec.room, rec.modeId, JSON.stringify(rec.options), rec.endedAt, JSON.stringify(rec.seats),
    JSON.stringify(rec.placements), JSON.stringify(rec.deltas), JSON.stringify(rec.recap ?? null)).run();
}
