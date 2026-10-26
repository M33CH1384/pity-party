# Bid Wit Me audit for Pity Party (read-only)
Snapshot: M33CH1384/bid-wit-me master @ 99cd6c5 (10/26/2026). pnpm monorepo: apps/web (Vite/React/three, Pages), apps/server (Worker + DOs + D1), packages/{rules,bots,protocol} (all named `@spades/*`).

## Size (TS/TSX only)
| Area | Files | LOC |
|---|---|---|
| packages/rules | 9 | 2,963 |
| packages/bots | 33 (+catalog.json) | 10,057 |
| packages/protocol | 3 | 948 |
| apps/server/src | 57 | 13,489 |
| apps/web/src | 274 | 50,709 |
| scripts | 16 | 1,374 |
| apps/web/public | — | **526 MB** (audio, voice, venue art, rundown videos) |
| migrations | 33 SQL | — |

## (a) Game-specific (rewrite / drop) ≈ 30k LOC
- **packages/rules** (all): cards, config (TableRules: nil, bags, jokers, partnerships), game (bidding, trick winner, legalPlays, spadesBroken, radioactiveBigJoker), scoring, runIt, series, handlog.
- **packages/bots** (almost all): bidding.ts, play.ts, knowledge.ts, talk/partnerTalk/consultTalk/takes/moments/history*, pools*/pack*, personas, voices, and **story*** (storyScripts, storyRundown, storyTape, storyBadges, storyGuide...). Keep only `names.ts`, `pronounce.ts`, persona *shape*.
- **web Spades UI**: BidCoach, minBid, TrumpPopup, TrickBrowser, lastTrickBrowse, RunZoom/runIt/runPlayback, slam, Nuke3D/Tornado3D/blastSweep/tornadoSweep/gather/trickFacing, misdeal, shotMarks/shotOut, ScorePad/BoxScore content, Series, LockedRules, handOrder/cardRank, PartnerTalk, TrashTalk lines, DealerPopup, Hype, hand-recap content.
- **story/** (22 files, 4,974 LOC) + server/story: content is Spades/Dee-specific; drop for v1.
- Voice lines, rundown videos, most of public/ (526 MB) – do not copy wholesale.

## (b) Reusable shell ≈ 35k LOC
- Server: auth/ (OAuth providers, passkeys, sessions, username), social/ (SocialDO hub, chat, DMs, mentions), push/ (VAPID crypto/send), feedback.ts (FeedbackDO), limits.ts (RateLimitDO), filter.ts, admin.ts, cred/ (XP, coins, divisions, seasons, achievements, avatar, tagline, socialLinks, venueAccess), dispatch.ts.
- Web: online/ (Lobby, connection, useOnline, Media/video chat, Spectators, nav, entryGate) 3.3k; social/ 4.4k; account/ 0.6k; profile/ 1.5k; push/; settings*.ts, SettingsSheetHost, audio*.ts, haptics, fx, chunkLoad, IdleGuard, inactivity, Feedback, Credits, ThemeToggle, avatar, reactions.
- 3D shell: three/Scene.tsx, Venue3D, cubeVenue.tsx (148), *Room.tsx + *Layout.ts venue rooms, hallEnv, preload, shaderBudget, geometry, layout.ts; transitions.ts (472) + TableTransitionLayer, VenueSelect, venues.ts.
- PWA/sw, deploy.yml/ci.yml, wrangler configs, functions/ (/api proxy, 8 LOC).
- Migrations 0001 accounts, 0002 social, 0007/0008 cred+coins, 0009 push, 0011–0015, 0018, 0025, 0028, 0030–0031 are generic.

## (c) Mixed – seams to cut
1. **apps/server/src/index.ts TableDO (l.355) + room.ts (3,032 LOC)**: room lifecycle, seats, websockets, chat, spectators are generic but interleaved with `newGame/applyAction/bidOptions`, `chooseBotAction/leanBid/leanNil`, `botTalk`, story guide calls (imports at room.ts l.10–22). Seam = `GameEngine` (below).
2. **stats/** (record, highlights, local, power, results): GameRecord holds bids/books/bags → generic record + game-specific `summary` JSON.
3. **tournament/**, **wager/**: bracket/escrow generic; match-end reads Spades scores → engine `outcome()`.
4. **Table.tsx (2,940 LOC)** + online/OnlineTable: layout/seats/turn ring generic; hand/bid/trick rendering Spades. Split into `TableShell` + `<GameView>`.
5. **three/**: Card3D, cardTextures, cardFace, dealFlight, dealTimeline, landing, handLift/handHit, playableOutline – card-generic but tuned to 13-card trick layouts; reuse with 5-card hand + stock/upcard pile.
6. **Setup.tsx / offeredModes / gameSession / save.ts**: setup wizard generic, options Spades → driven by engine option schema.
7. **protocol/index.ts**: message envelope generic; `GameState/Action` payload types Spades → generic `<S, A>`.
8. Migrations 0003/0004/0005/0016/0017/0019–0027/0029/0032/0033 embed game/story stats.

## Coupling
- Server: **9 files** import `@spades/rules` (index.ts, room.ts, stats/{local,highlights,record}, tournament/{service,routes}, wager/{service,routes}).
- Web: **101 files** import `@spades/*`; 56 import rules specifically; by dir: top-level 51, story 15, online 5, three 3, social 1, profile 1, account/push 0.
- 66 `from '@spades/rules'` import statements total across server+web.
- Verdict: shell is moderately coupled — server is concentrated (room.ts/index.ts), web is diffuse (top-level components). Social/auth/push/account are clean.
