# REBUILD — Bid Wit Me features switched off TEMPORARILY

Demetrius wants **every** Bid Wit Me feature in Pity Party. PR 2.2b part 2 moved the table onto the
`@pp/game` registry (placeholder by default), which meant pulling the Spades-only paths out of
`apps/server/src/room.ts`. Nothing below is cancelled. Each item comes back on the registry before
launch (milestone 11).

**Where the old code lives**
- Pity Party commit `321d6b3` (master before this PR): `git show 321d6b3:apps/server/src/room.ts`.
  Deleted tests: `git show 321d6b3:apps/server/test/<file>`.
- Bid Wit Me snapshot: local tag `bwm-snapshot-2026-10-26` (BWM `4f436e6`). Read only, never push.
- Search the tree for `TODO(rebuild` to find every switch-off point. HTTP feature flags are in
  `apps/server/src/features.ts`.

**What the registry gives every feature:** `Results { done, placements, deltas, recap }`. When a mode
game finishes, `room.ts` emits `RoomIO.modeGameOver(ModeGameRecord)` with the room, mode, options,
seats (uid/name/bot), placements, coin deltas and recap. `index.ts` writes it to D1 `mode_games`
(migration 0034). Rebuilt features should read from that, not from Spades scores or tricks.

| Feature | Status now | Old code (at 321d6b3 / BWM tag) | Depends on | Registry data it needs | When |
|---|---|---|---|---|---|
| **Series** (rematch tally) | `roomInfo.series = null`; `startSeries`/`recordSeries`/`sideNames` removed | room.ts `startSeries`, `recordSeries`, `seriesForGameStart`; protocol `SeriesInfo` | rematch flow | `placements[0]` per game, sides = seats (no teams in A/B) | (a) after M7 |
| **Rated games / Elo** | `ratedSeats()` returns false; `d.rated` removed; `gameOver` hook removed | room.ts `ratedTable`, `ratedSeats`, `reportGame`; `stats/record.ts` `saveRecord`, Elo | accounts (M5), mode_games | placements → pairwise Elo per mode; uid per seat | (a) |
| **Richer stats / leaderboards / honors / cred push** | only the generic `mode_games` row is written | `stats/record.ts`, `boards.ts`, `honors.ts`, `power.ts`, `results.ts`, `cred/*` | mode_games, rated | deltas (coins), placements, per-mode recap fields (e.g. Tonk/Pitty Pat counts) | (a) |
| **Abandoned-game records** | `reportAbandoned`, `expire()` are no-ops | room.ts `reportAbandoned`, `abandonReported` | stats | seat that left plus the partial `Results` | (a) |
| **Tournaments** | `/api/tournaments` → 503 (`FEATURES.tournaments`); `/tournament-setup` → 503; table `tournament` field removed | room.ts `setupTournament`, `seatReserved`, `allReservedSeated`, `autostart`, `parkEliminated`; `tournament/*` (DO, engine, service still compiled) | rated, series | **bracket advances on `placements` + coin `deltas`**, not Spades score; `tournamentResult(t, scores, places)` hook still in RoomIO | (b) after M9 |
| **Big Bank** (escrow and wagers) | `/api/wager-challenges` → 503 (`FEATURES.wagers`); `/challenge-setup` → 503; `challenge` field removed | room.ts `setupChallenge`, `challengeBegin`, `challengeDeadline`; `wager/*` (DO and service still compiled) | accounts, coins ledger | **escrow settles on `placements` + coin `deltas`** (zero-sum check); `challengeResult` hook still in RoomIO | (b) |
| **Leagues / season challenges** | not wired to mode games | `stats/highlights.ts`, league waves, `0032_season_challenges.sql` | stats, rated | per-mode recap events (big wins, Tonk on deal, Pitty Pat streaks) | (b) |
| **Challenges** (head-to-head invites) | room side removed with Big Bank | as Big Bank (non-wager path) | Big Bank plumbing | placements | (b) |
| **Bot chat / trash talk / live highlights** | `talk`, `pushBotLine`, `loudLoser`, `highlight` hook, `voice/writer` removed from room | room.ts `talk*`, `@pp/bots` talk, `voice/*`, `stats/highlights.ts` | per-mode bot events | mode-specific events from `view`/`recap`; personas from `@pp/game` `BOT_NAMES` (plate tags) | (b) |
| **Hand log / Run It** | `/handlog` → 503; `handLog`, `runPlayback`, `logBuilder` removed; `'next'` is a no-op | room.ts `handLog*`, `runPlayback`; Spades claim "Run it!" | per-mode | **replay = `ModeGame.moves` + `seed`** (deterministic), so the log can be rebuilt from moves; Run It equivalent = a per-mode "claim the rest" move | (b) |
| **Partner hints, Nil rule healing, pre-deal window, bid timer** | removed (Spades only) | room.ts `parseHint`, `healNilRules`, `dealFirstHand`, `PRE_DEAL_MS` | — | not needed for A/B unless a mode wants a pre-deal window | as needed |

Still in place: the `TournamentSeat`/`ChallengeSeat`/`ChallengeResult` types in room.ts, the
`tournamentResult`/`challengeResult` RoomIO hooks, and the DOs/services under `tournament/` and
`wager/`. That keeps the switch-back small.

Deleted Spades-path tests (restore from `321d6b3` as references when rebuilding): abandon, handlog,
pre-deal, reconnect, rejoin-broadcast, timer-presets, tournament-room, wager-room, bot-tags, and the
Spades cases in room/stats/voice-writer. Generic replacement coverage: `test/room-shell.test.ts`.
