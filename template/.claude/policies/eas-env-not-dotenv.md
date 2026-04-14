---
id: eas-env-not-dotenv
title: EAS remote builds don't read .env.local
scope: repo
trigger: eas build
enforcement: hard
---

## Rule

EAS remote builds do NOT read `.env.local` files. Any `EXPO_PUBLIC_*` env vars needed in the build must be added to either:
1. The `env` block in the relevant `eas.json` build profile
2. EAS Secrets via `eas secret:create`

`.env.local` only works for local dev server (`npx expo start`) and local builds (`eas build --local`).

