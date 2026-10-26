# Snapshot notes
Source: M33CH1384/bid-wit-me @ 4f436e6 (local tag bwm-snapshot-2026-10-26, not pushed). No git history copied.

Left out (≈ 660 MB): apps/web/public/{audio (59 MB), voices (360 MB), story (60 MB), assets (45 MB: card-backs, decks, hdri, neon, personas, sfx, textures, wordmark), shot (2.2 MB)}; screenshots/, audio-candidates/, docs/ (BWM design docs + images), brand/, voice/, SPEC.md/html/pdf; .github/workflows/deploy.yml and voice-bake.yml.
Kept from public/: manifest.json, sw.js, legal pages (privacy/terms/data-deletion, to be rewritten), icons/favicon replaced with plain placeholders.
Changed: apps/server/wrangler.toml database_id → zero placeholder (never reuse BWM's D1). No secrets were present in the tree.
Missing assets mean some 3D venues/audio 404 at runtime until Desi's art lands; build and tests do not need them.
