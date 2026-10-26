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

## Milestone 3 removals (#10 web Spades removal, 3b table rules + packages)

PR #10 (3a) deleted the Spades web table and everything built on it; PR 3b dropped `@pp/rules` and
`@pp/bots` and shrank the table rules to `{ playerCount, turnTimerSec }`. None of it is cancelled.
Each item below comes back **on the registry** (driven by `@pp/game` modes, their `view`/`recap`/options,
not Spades bids/tricks) **before launch (milestone 11)**.

**Where the old code lives**
- Pity Party commit **`89c5c25`** = master before #10 (merge of #9). #10 itself is `312eadf` (merge `c05e069`).
  Web files: `git show 89c5c25:apps/web/src/<path>`; list a folder with `git ls-tree -r --name-only 89c5c25 apps/web/src/three`.
- `@pp/rules` / `@pp/bots` as of their removal: `git show c05e069:packages/rules/src/<file>` (same at `89c5c25`).
- Pre-3b server bits (Spades stats extraction, story badges, `makeRules` in tournaments/wagers): `git show c05e069:apps/server/src/<path>`.
- Bid Wit Me snapshot tag **`bwm-snapshot-2026-10-26`** in the BWM clone (read only, never push) also has
  what Pity Party stripped in milestone 1 (Story Mode screens, Dee's rundown, story badges UI).

| # | Feature | Old code (refs above) | Depends on | Registry shape when rebuilt | Sequence |
|---|---|---|---|---|---|
| W1 | **3D table, venues and scenes** (Venue3D, 12 rooms, Card3D, deal/gather flights, Nuke3D/Tornado3D, KingGun, XR prototype) | `89c5c25:apps/web/src/three/*` (51 files), `xr/*`, `tableAssets.ts`, `cardTextures`, `effects/warm.ts` | M7 + M9 table views (2D first), Desi palette (M10) | a per-mode 3D layout driven by the mode `view` (hand, pile/spreads, seats); venues are scenery only | 10R-1/2 (after M10 palette) |
| W2 | **Deck picker and venue picker** (DeckGallery, deckLore, storyDecks, VenueSelect, Setup venue step) | `89c5c25:apps/web/src/DeckGallery.tsx`, `decks.ts`, `deckLore.ts`, `storyDecks.ts`, `VenueSelect.tsx`, `venues.ts` (still present) | W1 (venues), card art pack | deck = art pack for every mode; venue = room choice sent with `venue` (protocol message still exists) | 10R-3 |
| W3 | **Trash talk / bot voices** (TrashTalk, PartnerTalk, quickTrash, offlineTalk, talkPrefs, voices, persona faces, voice-bake scripts) | `89c5c25:apps/web/src/TrashTalk.tsx`, `PartnerTalk.tsx`, `quickTrash.ts`, `offlineTalk.ts`, `talkPrefs.ts`, `voices/voices.ts`, `PersonaFace.tsx`; `c05e069:packages/bots/src/talk*`, `personas*`; `c05e069:scripts/voice-bake/*` | 9R bot chat (server events), per-mode bot strategies | lines keyed to mode events (`recap`, big moves), personas from `@pp/game` `BOT_NAMES` | 10R-4 (after 9R bot chat) |
| W4 | **Bid coach / coach hints** (BidCoach, Coach, consultDriver) | `89c5c25:apps/web/src/BidCoach.tsx`, `Coach.tsx`, `consultDriver.ts` | M7/M9 bots (`BotStrategy` gives the suggested move) | "what would a Pro bot do" = `getBot(mode).choose(view)` shown as a hint | 10R-5 |
| W5 | **House-rules UI** (settings sections, LockedRules panel, in-game rules sheet, glossary, trump ladder) | `89c5c25:apps/web/src/settingsSections.ts`, `LockedRules.tsx`, `glossary.ts`, `TrumpPopup.tsx`, `trumpLadder.ts`; old `settings.ts` at `c05e069` | 3c (lobby shows the mode's options), option schemas | read-only `OptionDef` list rendered from the room's `modeOptions` (+ `[UNVERIFIED]` source notes) | 3c shows options; locked-rules sheet 10R-5 |
| W6 | **Spades summary bar** (bid summary row, ScorePad, BoxScore, plate stats) | `89c5c25:apps/web/src/PartnerTalk.tsx` (`bid-summary`), `ScorePad.tsx`, `BoxScore.tsx`, `plateStats.ts`, `plateFacts.ts` | M7/M9 table views | per-mode status strip from `view` (Pitty Pat pairs, Tonk spreads/counts) | folded into M7 / M9 table-view PRs |
| W7 | **Run It and animations** (RunZoom, runIt/runPlayback, AnimFx layer, SetCover, Hype, VersusIntro, Intermission, WheelsCar, slam/drag play, turn ring) | `89c5c25:apps/web/src/RunZoom.tsx`, `runIt.ts`, `runPlayback.ts`, `animfx/*`, `Hype.tsx`, `VersusIntro.tsx`, `Intermission.tsx`, `WheelsCar.tsx`, `slam.ts`, `dragPlay.ts`; `c05e069:apps/web/src/TurnRing.tsx`, `turnRing.ts` | 9R hand log/Run It (server replay from `moves` + `seed`), W1 | per-mode "claim the rest" move + replay; celebration hooks on `recap` events | 10R-6 (after 9R) |
| W8 | **Story mode, story badges, Dee's guide** (StoryHome/Room/Tape, ScriptPlayer, DeeRundown, StoryBadges, story faces, co-op) | BWM tag `bwm-snapshot-2026-10-26:apps/web/src/story/*`, `badges.ts`; `89c5c25:apps/web/src/story/*`; `c05e069:packages/bots/src/story*`; `c05e069:apps/server/src/cred/card.ts` (story badges in the card) | M7/M9 modes + bots (stops are bot matches), W3 voices, accounts (M5) | stops = registry matches with fixed options/bot tiers; badges from `mode_games` + recap events | 10R-7/8 (last before launch) |

**Also cut in 3b** (rebuild with the rows above): the online `act`/`ack` move pipeline (registry moves use
`move` + fresh state), offline Spades stats `/api/stats/local` (503 now; W6/stats), guest rewards claim
(stubs on), per-trick/per-hand highlights (`stats/highlights.ts` extraction; with 9R leagues), team names
(`teamName` answers NO_TEAMS until a partnership mode exists), lobby venue/teams/trash-talk/nuke panels
(3c shows timer + options; the rest return with W1–W3), Spades dev scripts (`simulate`, `online-clients`,
state generators: `c05e069:scripts/*`). Search `TODO(rebuild` for every switch-off point.

## Milestone 5 switch-offs (accounts, social, push)

| # | Feature off | Where (TODO(rebuild)) | Comes back as | Needs |
|---|---|---|---|---|
| P1 | **Spades rating UI on the profile**: rating chips (⚔ Partnership / 🔪 Cutthroat), rating cards + explainer, Partnership/Cutthroat stat grids, Spades "Online record" rows (bid accuracy, books, nils, shots, wheels, Big Joker, bid/play time) | `apps/web/src/RepBlock.tsx`, `apps/web/src/profile/ProfileView.tsx` (Stats tab). Server still returns `rank`/`stats` (empty for Pity Party). Old UI: master before 5a | per-mode rating chips + per-mode stat rows from `mode_games` recaps (5a already shows games/wins/coins/avg finish/recent per mode) | "Rated games / Elo" row above |
| S1 | **Social Ranks tab + rating chips + Spades ticker results** (Partnership/Cutthroat leaderboards, power rankings, honors, ⚔/🔪 presence ratings, "def. … · Joker" result lines) | `apps/web/src/social/Social.tsx` (TABS, PlayerRow, body switch), `LeagueTicker.tsx` `RESULT_MODE`. Server endpoints `/api/social/leaderboard|power|honors|results` and `SocialStore.ratings` still run (empty for Pity Party) | per-mode boards and ratings from `mode_games` (+ rated games) | "Rated games / Elo" row |
| S2 | **Events & tournaments menu** in the Social gear | `Social.tsx` gear menu (server `/api/tournaments` already 503) | Tournaments row above | rated, series |
| S3 | **Big Bank challenges menu** in the Social gear | `Social.tsx` gear menu (server `/api/wager-challenges` already 503) | Big Bank row above | coins ledger |
| S4 | **Story co-op invites** (`kind: 'story-coop'`, `stopId`) still parse but no web flow sends them | protocol `parseSocialMsg`, hub invite | W8 story mode | — |
