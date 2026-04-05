---
id: company-context-verify
title: Verify Company Context Before Scoped Work
scope: global
trigger: before any company-scoped operation (deploy, credential access, DNS, Linear, Vercel)
enforcement: hard
version: 1
created: 2026-03-05
updated: 2026-03-05
source: session-learning
learned_from: "Failed to load {Product} policies before Route 53 work — missed documented DNS workflow"
---

## Rule

Before any company-scoped operation:

1. **Identify active company** — infer from repo (check manifest `repos` field), domain, worker, or cwd
2. **Load company policies** — `ls companies/{co}/policies/` and read any relevant to the current task
3. **Check manifest for infrastructure** — `vercel_team`, `aws_profile`, `dns_zones`, `services` fields tell you exactly which accounts/profiles to use
4. **Use manifest-declared values** — don't guess Vercel scopes, AWS profiles, or DNS zone IDs. The manifest has them

Infrastructure lookup checklist:
- **Vercel deploy** → manifest `vercel_team` field → `--scope {team}`
- **AWS/Route 53** → manifest `aws_profile` field → `AWS_PROFILE={profile}`
- **DNS zone** → manifest `dns_zones` field → hosted zone ID
- **Linear** → company `settings/linear/config.json` → validate workspace

## Rationale

Company policies contain hard-won instructions for specific services (e.g. "use Vercel API, not CLI for custom domains"). Skipping them means repeating known failures. The manifest now has infrastructure mappings to eliminate guessing.
