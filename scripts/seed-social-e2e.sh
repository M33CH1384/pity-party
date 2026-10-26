#!/usr/bin/env bash
# LOCAL ONLY: seeds the miniflare D1 (wrangler --local) with three accounts + sessions for apps/web/test/social-play.e2e.ts
# and clears their friendships so the request → accept step runs fresh. Never touches a remote database.
set -euo pipefail
cd "$(dirname "$0")/../apps/server"
NOW=$(date +%s%3N); SQL=$(mktemp)
echo "DELETE FROM friends WHERE a LIKE 'u-e2e-%' OR b LIKE 'u-e2e-%';" > "$SQL"
for row in alice:Alice:e2esessionalice0123456789abcdef bobby:Bobby:e2esessionbobby0123456789abcdef cara:Cara:e2esessioncara00123456789abcdef; do
  IFS=: read -r k n t <<<"$row"
  h=$(node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('base64url'))" "$t")
  echo "INSERT OR REPLACE INTO users (id, username, username_key, created_at) VALUES ('u-e2e-$k','$n','${n,,}',$NOW);" >> "$SQL"
  echo "INSERT OR REPLACE INTO sessions (id_hash, user_id, created_at, expires_at) VALUES ('$h','u-e2e-$k',$NOW,$((NOW+86400000)));" >> "$SQL"
done
# local miniflare only: make sure the local copy has every migration, then seed (never --remote)
npx --yes wrangler@3 d1 migrations apply pity-party --local >/dev/null
npx --yes wrangler@3 d1 execute pity-party --local --file "$SQL" >/dev/null
echo "seeded local D1 (alice, bobby, cara)"
