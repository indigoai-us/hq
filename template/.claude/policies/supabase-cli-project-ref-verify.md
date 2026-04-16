---
id: hq-supabase-cli-project-ref-verify
title: Verify Supabase CLI project ref matches .env.local URL before using keys
scope: global
trigger: using supabase CLI to get API keys or service role keys
enforcement: soft
version: 1
created: 2026-03-23
updated: 2026-03-23
source: success-pattern
---

## Rule

ALWAYS verify the Supabase CLI-linked project ref matches the `.env.local` URL before using keys from `supabase projects api-keys`. Decode the JWT to check: `node -e "console.log(JSON.parse(Buffer.from(key.split('.')[1],'base64')).ref)"`. Vercel-managed Supabase integrations often create a different project than the locally-linked one.

