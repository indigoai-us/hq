---
id: hq-vercel-env-no-newlines
title: Use printf for Vercel Env Vars
scope: global
trigger: when adding environment variables to Vercel via CLI
enforcement: hard
version: 1
created: 2026-02-22
updated: 2026-02-22
source: migration
---

## Rule

When piping values to `vercel env add`, ALWAYS use `printf` (no trailing newline) — NOT `echo`. `echo` appends `\n` to the value, causing API calls with those credentials to fail with 400 Bad Request. Diagnose with `vercel env pull` and inspect for `\n` in values.

