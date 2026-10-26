# Pity Party

Card games with friends and bots: **Pitty Pat** (Mode A) and **Tonk** (Mode B), played offline or at online tables.
Coins only, never real money. Built from the Bid Wit Me codebase (snapshot tag `bwm-snapshot-2026-10-26`).

## Layout

```
packages/game      the mode registry: rule sets, bots and option schemas for every game (@pp/game)
packages/protocol  client/server messages and the generic table rules (seats + turn timer)
apps/web           Vite + React client: Setup picker, offline and online tables, lobby, social
apps/server        Cloudflare Worker: table rooms (Durable Objects) + D1 stats, social, accounts
docs/plan          STRUCTURE.md (milestones), REBUILD.md (switched-off features to rebuild before launch)
```

## Commands

```bash
pnpm install
pnpm test                    # vitest: game registry, protocol, server, web
pnpm typecheck
pnpm dev                     # dev server on http://localhost:5173
pnpm build && pnpm preview   # production build served on http://localhost:4173
pnpm server:dev              # local Worker (Miniflare)
```

The old Spades engine (`@pp/rules`) and bots (`@pp/bots`) were removed in milestone 3b; their code is
available at the tag `bwm-snapshot-2026-10-26` and at commit `89c5c25` (see docs/plan/REBUILD.md).
