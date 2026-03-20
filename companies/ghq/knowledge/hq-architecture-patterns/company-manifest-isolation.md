---
title: "Company Manifest and Credential Isolation"
category: hq-architecture-patterns
tags: ["runtime-isolation", "security", "knowledge-management", "production-patterns", "configuration"]
source: "https://github.com/coreyepstein/hq-starter-kit, https://github.com/hassaans/ghq"
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

## The Pattern

A single `companies/manifest.yaml` maps every company to its resources: repos, settings, skills, knowledge, deploy targets, and search collections. This manifest becomes the single source of truth for routing — never guess which company owns what.

### Isolation Layers

1. **Manifest lookup**: Before any company-scoped operation, resolve company from context (cwd, repo, domain)
2. **Policy loading**: Read `companies/{co}/policies/` for company-specific rules
3. **Credential routing**: Use manifest fields (`aws_profile`, `vercel_team`, `dns_zones`) instead of guessing
4. **Hook enforcement**: PreToolUse hook warns when reading a company's settings that doesn't match cwd context
5. **Search scoping**: `qmd -c {collection}` to avoid cross-company results
6. **`.claudeignore`**: Shield `companies/*/settings/**` from agent reads entirely

### Hard Rules (from hq-starter-kit)

- Never read credentials from a different company's settings
- Never try another company's credentials as fallback
- Never paste secrets inline in bash commands
- Never deploy to a company's targets from a different company's context

## Why This Matters for GHQ

GHQ v0.2 has a `companies/manifest.yaml` (in the hassaans/ghq fork) but the current local GHQ doesn't use a manifest — companies are just symlink directories. As GHQ scales beyond personal knowledge management to handling multiple companies' projects, this becomes critical for:

1. **Credential safety**: Preventing accidental cross-company credential access
2. **Context routing**: Knowing which qmd collection to search for a given task
3. **Deploy safety**: Ensuring deploys go to the right Vercel project / AWS account
4. **Onboarding**: New companies get scaffolded with all required directories via `/newcompany`
