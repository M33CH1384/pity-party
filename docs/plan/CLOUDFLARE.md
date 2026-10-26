# Pity Party Cloudflare plan (proposal only – nothing created)
| Resource | Name |
|---|---|
| Pages project | `pity-party` → https://pity-party.pages.dev |
| Worker | `pity-party-server` (workers_dev) |
| D1 | `pity-party` (new database_id; never BWM's 31453fef-…) |
| DOs (SQLite, fresh migration tags v1…) | TableDO, FeedbackDO, RateLimitDO, SocialDO (later TournamentDO, ChallengeDO) |
| Cron | `5 * * * *` only if push reminders kept |
| Workers AI | optional, off at launch |

## server wrangler.toml (adapt from BWM)
Copy structure; change: name, ALLOWED_ORIGINS/PUBLIC_ORIGIN → pity-party.pages.dev, ADMIN_USERNAMES, d1 database_name/id, migrations restart at v1 with `new_sqlite_classes` (Free plan requires SQLite DOs). Drop `[ai]` unless needed. Web wrangler.toml: name `pity-party`, `[[services]] API → pity-party-server`.

## Secrets (all regenerated fresh, never copied)
VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT; FEEDBACK_ADMIN_TOKEN; optional RESEND_API_KEY/FEEDBACK_EMAIL_*; OAuth: new apps for GOOGLE_/DISCORD_/X_/FACEBOOK_ CLIENT_ID+SECRET (redirect URIs on pity-party.pages.dev); TURN_KEY_ID/TURN_KEY_API_TOKEN optional. Passkeys: RP ID = pity-party.pages.dev (separate credential set by design).
GitHub Actions (new repo): CLOUDFLARE_API_TOKEN (new scoped token: Pages + Workers + D1 [+AI]), CLOUDFLARE_ACCOUNT_ID. Deploy: `wrangler d1 migrations apply pity-party --remote`, `wrangler deploy`, `wrangler pages deploy dist --project-name pity-party`.

## Must not be shared
BWM D1, DO namespaces, KV/any binding IDs, VAPID keys, OAuth apps, cookie names, feedback token, API token. Same Cloudflare account is fine.

## Free-tier check (account-wide, shared with BWM!)
- Workers: 100k req/day across ALL workers in the account — BWM + Pity Party share it. Main risk.
- DO (SQLite): free, 100k req/day, 13k GB-s/day, 5 GB storage — account-wide. Use websocket hibernation as BWM does.
- D1: 5M rows read/day, 100k written/day, 5 GB total — account-wide; 10 DBs allowed.
- Pages: 500 builds/month, 25 MiB per file, 20k files — keep videos/audio small.
- Workers AI: 10k neurons/day account-wide (BWM already uses up to 8k) → leave Pity Party AI off.
- Cron: 5 triggers per account on free → fine.
