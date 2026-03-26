---
id: hq-vercel-env-no-trailing-newline
title: Use printf not echo when piping to vercel env add
scope: global
trigger: setting Vercel environment variables via CLI
enforcement: hard
version: 1
created: 2026-03-17
updated: 2026-03-17
source: back-pressure-failure
---

## Rule

ALWAYS use `printf '%s' "$VALUE" | vercel env add NAME production` instead of `echo "$VALUE" | vercel env add`. `echo` appends a trailing newline which Vercel stores as part of the value, causing "leading or trailing whitespace" build errors for HTTP header values like CRON_SECRET.

## Rationale

Deploy failed with "CRON_SECRET environment variable contains leading or trailing whitespace" because `echo` piped a newline-terminated string.
