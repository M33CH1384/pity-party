-- Generic stats record per finished registry-mode game (Pitty Pat, Tonk, placeholder).
-- Coin changes + placements + the mode's recap. Richer stats/leaderboards build on this (docs/plan/REBUILD.md).
CREATE TABLE IF NOT EXISTS mode_games (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  mode_id TEXT NOT NULL,
  options_json TEXT NOT NULL,
  ended_at INTEGER NOT NULL,
  seats_json TEXT NOT NULL,
  placements_json TEXT NOT NULL,
  deltas_json TEXT NOT NULL,
  recap_json TEXT
);
CREATE INDEX IF NOT EXISTS mode_games_mode_ended ON mode_games (mode_id, ended_at);
