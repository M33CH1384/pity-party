# Pity Party — first deploy runbook (NOTHING CREATED YET)

Status: **plan only.** No Cloudflare resource, secret or token has been created or used for Pity Party.
Creation waits for Yoda to clear it with Demetrius. Once cleared, this is one sitting (~15 min).
Never reuse anything from Bid Wit Me (D1 id, DO namespaces, secrets, OAuth apps, VAPID keys, tokens).
Same Cloudflare account is OK, but the free-tier quotas are **account-wide and shared with BWM** (see the end).

## 0. Token (create first, by Demetrius)
A new **account-scoped API token** "pity-party-deploy", used only for this repo:

| Scope | Permission | Why |
|---|---|---|
| Account · Workers Scripts | Edit | `wrangler deploy` of `pity-party-server` (incl. DO classes + migrations) |
| Account · D1 | Edit | `d1 create`, `d1 migrations apply --remote` |
| Account · Cloudflare Pages | Edit | `pages project create`, `pages deploy` |
| Account · Account Settings | Read | wrangler `whoami` / account lookup |
| User · User Details | Read | wrangler's identity check |
| Zone | none | workers.dev + pages.dev only, no custom domain |
| Workers AI | **none** | AI is off |

Account resources: only the one account. TTL: optional (e.g. 90 days). Store as GitHub Actions secrets
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` only when CI is unparked (the GitHub token still lacks the
`workflow` scope; CI stays parked in docs/ci-workflow.yml until that is fixed by the owner).

## 1. Resources to create (exact commands, from repo root)
```bash
export CLOUDFLARE_API_TOKEN=…  CLOUDFLARE_ACCOUNT_ID=…
W="npx --yes wrangler@3"

# D1 (new database; prints database_id)
(cd apps/server && $W d1 create pity-party)
#   → paste the id into apps/server/wrangler.toml  [[d1_databases]] database_id  (only placeholder left)

# Pages project (static site + /api Pages Function proxy)
(cd apps/web && $W pages project create pity-party --production-branch=main)
```
The Worker `pity-party-server` and its Durable Object namespaces are created by the first `wrangler deploy`
(no separate command). Pages' service binding `API → pity-party-server` is read from apps/web/wrangler.toml.

## 2. wrangler.toml — what is already set vs. placeholders
apps/server/wrangler.toml (already renamed in milestone 4):
- `name = "pity-party-server"`, `workers_dev = true`
- `ALLOWED_ORIGINS = "https://pity-party.pages.dev,http://localhost:5173,http://localhost:4173,http://127.0.0.1:4173"`
- `PUBLIC_ORIGIN = "https://pity-party.pages.dev"` (OAuth redirect base, passkey RP ID, cookie site)
- `ADMIN_USERNAMES = "M33CH"` — confirm with Demetrius (chat moderators)
- `[[d1_databases]] binding = "DB"`, `database_name = "pity-party"`,
  **`database_id = "00000000-0000-0000-0000-000000000000"` ← the only placeholder; fill after step 1**
- no `[ai]` block (Workers AI off; `env.AI` is optional in code)
- `[triggers] crons = ["5 * * * *"]` (hourly push reminders; harmless with no VAPID keys — sends nothing)

apps/web/wrangler.toml: `name = "pity-party"`, `pages_build_output_dir = "dist"`, `[[services]] API → pity-party-server`.

`scripts/deploy-online.sh` targets pity-party and **refuses to run while the placeholder D1 id is present**.

## 3. Durable Objects + migration tags (fresh, start at v1)
`pity-party-server` is a brand-new script, so its DO migration history starts empty; the tags in
wrangler.toml are applied in order on the first deploy. All SQLite-backed (required on the Free plan):

| Tag | Class | Binding | Purpose |
|---|---|---|---|
| v1 | TableDO | TABLES | one per table (room, chat, spectators) |
| v2 | FeedbackDO | FEEDBACK | player feedback inbox |
| v3 | RateLimitDO | LIMITER | per-IP create/join/sign-in limits |
| v4 | SocialDO | SOCIAL | presence, open-tables list, global chat |
| v5 | TournamentDO | TOURNAMENTS | kept bound (code references it; feature parked, REBUILD.md) |
| v6 | ChallengeDO | CHALLENGES | kept bound (coins-only challenges; parked) |

Rule from here on: never edit/remove an applied tag; add v7+ (`new_sqlite_classes`, or `deleted_classes`
/ `renamed_classes`) for any change.

## 4. Secrets (all generated fresh — `cd apps/server && npx wrangler@3 secret put NAME`)
Required for a useful launch:
- `FEEDBACK_ADMIN_TOKEN` — random 32+ chars (`openssl rand -base64 32`)

Optional (feature stays off until both/all of a group exist):
- Web Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (new keypair: `npx web-push generate-vapid-keys`)
- Feedback email: `RESEND_API_KEY`, `FEEDBACK_EMAIL_TO`, `FEEDBACK_EMAIL_FROM`
- Sign-in (new OAuth apps, redirect URI `https://pity-party.pages.dev/api/auth/<provider>/callback`):
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`,
  `X_CLIENT_ID`/`X_CLIENT_SECRET`, `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`. Passkeys need none (RP ID = pity-party.pages.dev).
- TURN (video relay): `TURN_KEY_ID`, `TURN_KEY_API_TOKEN` — leave unset at launch (STUN only; Realtime TURN may bill).
Never set: `AUTH_MOCK`, `TEST_HOOKS`, `RATE_LIMITS_OFF` (local tests only).

## 5. First deploy (after 1–4)
```bash
(cd apps/server && npx --yes wrangler@3 d1 migrations apply pity-party --remote)   # 0001…0034
bash scripts/deploy-online.sh   # deploys the Worker (DO migrations v1–v6), builds web with VITE_SERVER_URL, deploys Pages
curl -fsS https://pity-party-server.<subdomain>.workers.dev/health   # {"ok":true}
```
Smoke: open https://pity-party.pages.dev → Play online → create a table → second browser joins by code →
Watch from Open tables → chat → reload (reconnect) → finish → Rematch (same flow as test/mode-play.e2e.ts).

## 6. Free-tier-only settings (checked)
- Workers Free plan; no paid add-ons; no custom domain; no Logpush; no Queues/R2/KV.
- DOs: SQLite backend only (`new_sqlite_classes`), WebSocket hibernation (as today).
- Workers AI: **off** (no binding). BWM already uses up to 8k of the 10k neurons/day account allowance.
- TURN: off. Cron: 1 trigger (account limit 5 on Free).
- Shared account quotas with BWM: 100k Worker requests/day (all scripts), DO 100k req/day,
  D1 5M rows read / 100k written per day, Pages 500 builds/month. Watch the dashboard the first week.
- Coins only — no payment provider, no real-money secrets.

## 7. Known leftovers (not blockers)
Cookie names (`bwm_sid`, `bwm_oauth`) and `bwm.*` storage keys are per-origin, so they cannot collide with
BWM on a different pages.dev host; renaming them is cosmetic (REBUILD.md / 3d list). privacy.html/terms.html
still name BWM — needs a legal text pass before public launch.
