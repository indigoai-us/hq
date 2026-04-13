---
id: credential-access-protocol
title: Credential Access Protocol
scope: global
trigger: before any credential or settings access
enforcement: hard
version: 1
created: 2026-03-05
updated: 2026-03-05
source: session-learning
---

## Rule

Before accessing ANY company credentials (`companies/{co}/settings/`):

1. **Identify the active company** — from cwd, repo ownership (check manifest), domain being worked on, or explicit user context
2. **Read `companies/manifest.yaml`** — look up the company's `services` field to confirm it owns the credential type you need (aws, linear, slack, etc.)
3. **Read ONLY that company's `settings/`** — never try another company's credentials as "fallback"
4. **Use profiles, not inline secrets** — for AWS: `AWS_PROFILE={co}` (profiles in `~/.aws/credentials`). NEVER paste `AWS_ACCESS_KEY_ID=...` inline in bash commands
5. **Read company policies first** — `companies/{co}/policies/` may have service-specific instructions (e.g. `dns-via-route53.md` for {Product})

Violations:
- Trying a different company's credentials before the correct one
- Pasting secrets as inline env vars in bash commands
- Skipping manifest lookup and guessing which company owns a service

## Rationale

Cross-company credential access leaks secrets into wrong contexts and risks deploying to wrong infrastructure. Inline secrets in bash commands persist in shell history and tool logs.
