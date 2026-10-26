/**
 * TEMPORARY switch-offs while the room runs on the @pp/game registry (2.2b part 2).
 * Every Bid Wit Me feature comes back: see docs/plan/REBUILD.md for the order, the old code
 * (tag bwm-snapshot-2026-10-26) and the registry data each one needs. Flip a flag back to
 * `true` only once that feature is rebuilt on registry results (placements + coin deltas).
 */
export const FEATURES = {
  /** TODO(rebuild): tournaments (TournamentDO, brackets) — milestone (b) */
  tournaments: false,
  /** TODO(rebuild): Big Bank wager challenges (ChallengeDO, escrow) — milestone (b) */
  wagers: false,
} as const;

export const featureOff = (): Response => Response.json({ error: 'This feature is coming back soon' }, { status: 503 });
