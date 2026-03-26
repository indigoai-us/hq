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
learned_from: "CLAUDE.md learned rules migration 2026-02-22"
---

## Rule

When piping values to `vercel env add`, ALWAYS use `printf` (no trailing newline) — NOT `echo`. `echo` appends `\n` to the value, causing API calls with those credentials to fail with 400 Bad Request. Diagnose with `vercel env pull` and inspect for `\n` in values.

## Rationale

Trailing newlines in env var values cause silent API auth failures.
