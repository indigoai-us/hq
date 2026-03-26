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

## Rationale

**Why:** `echo` appends a trailing `\n` to the value. SDKs that send the value as an HTTP header (e.g., Anthropic SDK sends API key as `x-api-key`) will fail with `"not a legal HTTP header value"` because newlines are illegal in HTTP headers. The error manifests as a generic "Connection error" with no obvious cause — diagnosis requires inspecting `err.cause`.

**How to apply:** Any `vercel env add` command that pipes a value. Also applies to other CLI tools that store piped values verbatim (e.g., `fly secrets set`, `railway variables set`).
