# Pity Party structure recommendation
**Recommendation: fresh repo (`pity-party`), copied from a BWM snapshot, no shared package.** Matches Yoda's default and "separate site". Shared packages would force BWM refactors (forbidden now) and lock both games to one release cadence. Accept drift; cherry-pick shell fixes by hand later. Copy via `git archive` of a tagged BWM commit (no history, no BWM secrets/IDs), record the source SHA in README.

## Copy plan
Keep: apps/server {auth, social, push, feedback, limits, filter, admin, cred (minus Spades bits), dispatch}, apps/web {online, social, account, profile, push, settings, audio engine, three shell + 2–3 venue rooms, transitions, PWA}, workflows, tsconfig/vitest/pnpm setup.
Strip: packages/bots (keep names/pronounce), story/ (web+server+bots), voice/rundown assets, Spades UI files listed in AUDIT (a), tournaments + wagers (stub, return later), 526 MB public/ (copy only needed audio/venue art; new art from Desi).
Stub: packages/rules → `packages/game` with placeholder engine; rename scope `@pp/*` → `@pp/*`.
Migrations: squash generic tables into a fresh `0001_init.sql` (accounts, sessions, passkeys, social, dms, push, cred/coins, presence, mutes, player_card); new game tables later.

## Game interface = rule-set registry (packages/game)
```ts
type ModeId = 'pitty-pat' | 'tonk';
interface RuleSet<S, M, O> {
  modeId: ModeId; title: string;
  optionsSchema: OptionDef[];            // drives per-mode Setup UI + validation
  defaults: O; validate(o: unknown): O;
  newGame(o: O, seats: number, seed: string): S;
  legalMoves(s: S, seat: number): M[];
  applyMove(s: S, seat: number, m: M): S; // pure; throws RuleError
  toAct(s: S): number[];                  // usually one seat; >1 for slap windows
  view(s: S, seat: number | 'spectator'): unknown; // hides hands/stock
  results(s: S): { done: boolean; placements: number[]; deltas: number[]; recap: unknown };
}
export const REGISTRY: Record<ModeId, RuleSet<any, any, any>>;
```
- `packages/game/core`: Card, Deck, seeded RNG (port BWM rng.ts), shuffle/deal, card values, meld utils (isBook, isRun, min-deadwood solver), stake/pot ledger.
- `packages/game/modes/pittyPat`, `modes/tonk`: own state/moves/options/results; no cross-imports.
- `packages/bots/{pittyPat,tonk}`: `BotStrategy.choose(view, legal, tier)`; tiers easy/normal/hard; shared think-time jitter + talk hook (tell-free).
- Server (TableDO/room.ts) imports only `REGISTRY` + `BOTS`; persists `{modeId, options, state}`; stats store generic `deltas` + mode `recap` JSON. No mode branches.
- Web: Setup = mode picker → form generated from `optionsSchema` (+ presets); Table shell + `GameViews[modeId]` (A: hand, upcard, stock, pairs shelf, Pair/Flip/Pass; B: hand, stock+discard, spreads per seat, Draw/Spread/Hit/Discard/Drop, count badge); `Recaps[modeId]` (A: pot/pairs; B: counts + Tonk/drop/caught payouts).
- Protocol: `{type:'move', modeId, move}`; server validates against `legalMoves`.

## Tests
- Unit test per RULES.md row; every [UNVERIFIED] rule is an option flag with tests on both settings.
- Property tests (fast-check): 52-card conservation, toAct non-empty ⇒ legalMoves non-empty, applyMove(legal) never throws, hand terminates within bound, view never leaks hidden cards.
- Seeded golden games (seed → move log + results snapshot) per mode × preset.
- Bot arena: seeded bot-vs-bot batches; hard beats easy >60%; no illegal moves.
- Server room tests use a placeholder mode so shell tests don't depend on Pitty Pat rules.

## Milestones (revised 2026-10-26: every BWM feature is kept)
Demetrius wants **all** Bid Wit Me functions. The Spades-only features were switched off in 2.2b part 2
and come back on the registry. See `docs/plan/REBUILD.md`.

1. Snapshot copy, renames, strip story/voice/Spades UI, build green (3 PRs, done: #1–#3).
2. game/core + registry + placeholder mode; room.ts on registry (4 PRs: #4 core, #5 adapter, #6 turn clock, 2.2b-2 registry-only room).
3. Web TableShell + GameViews/Recaps registry; schema-driven Setup with mode picker (2 PRs, done: #8, #9).
3+. Spades cleanup (4 PRs): 3a web Spades removal (#10), 3b table rules → seats + turn timer, drop `@pp/rules`/`@pp/bots` (this PR), 3c lobby (turn timer + game options shown, per-mode seat limits, host changes mode), 3d neutral re-style.
4. Online rooms/chat/spectators on new worker (1 PR). ← skeleton boots
5. Accounts, social, push on new D1/secrets (1–2 PRs).
6. Mode A (Pitty Pat) engine + options + tests (2 PRs).
7. Mode A bots (3 tiers) + table view + recap (2–3 PRs). ← **Mode A playable**
7R. **Rebuild (a):** series/rematch tally (1), rated games/Elo per mode (1), richer stats + leaderboards/honors + abandoned records (1–2). **3–4 PRs.**
8. Mode B (Tonk) engine (spreads, hit, drop, payouts) + meld solver + tests (3 PRs).
9. Mode B bots (3 tiers) + table view (spread areas, hit targets) + recap (3 PRs). ← **Mode B playable**
9R. **Rebuild (b), before visuals/deploy:** tournaments on placements + coin deltas (2), Big Bank escrow/wagers (2), leagues/season challenges (1), challenges (1, shares Big Bank plumbing), bot chat/trash talk + highlights per mode (1–2), hand log/Run It equivalents per mode (1–2). **8–10 PRs.**
10. Desi visuals/palette, PWA (2 PRs).
10R. **Rebuild (c), web experience removed in #10/3b** (REBUILD.md rows W1–W8), in this order: 3D table + venues/scenes on the registry (2), deck + venue pickers (1), trash talk/bot voices (1, after 9R bot chat), bid coach → per-mode hints + locked-rules sheet (1), Run It/animations (1–2, after 9R hand log), Story Mode + story badges + Dee's guide (2–3, last). Summary bar folds into the M7/M9 table-view PRs. **8–10 PRs.**
11. Cloudflare provisioning + first deploy after Yoda confirms (1 PR). **Every rebuild item (7R, 9R, 10R) must be back before this.**

Total ≈ **45–52 PRs** (was 33–38): +4 for the Spades cleanup 3a–3d, +8–10 for rebuild (c) web experience (10R; venues moved there from 10).
Done so far: 10 merged plus this one (3b). Skeleton = steps 1–4. Mode A can still ship first internally with Mode B
hidden behind a setup flag, but launch (11) waits for everything.

## Risks
- room.ts/Table.tsx untangling (3k LOC each) — highest effort.
- Hidden Spades assumptions in stats/cred/achievements and D1 schema.
- Hard-coded `bid-wit-me` origins, RP ID, cookie names, storage keys, sw cache names → grep all.
- Asset licensing: CREDITS.md items may not transfer; re-check each copied asset.
- Drift: BWM fixes won't flow automatically.
- Unverified house rules: kept as option flags, so Demetrius's answers change defaults, not code.
- Mode B spreads/hit UI on 393px portrait with 4 seats needs a Desi layout.
