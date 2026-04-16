---
id: vercel-env-no-echo
title: Use printf (not echo) when piping to vercel env add
scope: global
trigger: vercel env add
enforcement: hard
created: 2026-03-18
---

## Rule

When adding Vercel environment variables via CLI pipe, ALWAYS use `printf` instead of `echo`:

```bash
# CORRECT — no trailing newline
printf 'sk-ant-api03-...' | vercel env add KEY_NAME production --scope team

# WRONG — echo adds trailing \n that gets stored in the value
echo "sk-ant-api03-..." | vercel env add KEY_NAME production --scope team
```

