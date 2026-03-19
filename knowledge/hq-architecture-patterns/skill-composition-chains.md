---
title: "Skill Composition Chains"
category: hq-architecture-patterns
tags: ["skills", "skill-creation", "agent-loop", "production-patterns", "coordination"]
source: "https://github.com/hassaans/ghq"
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

## The Pattern

Skills declare dependencies as ordered chains. A composition skill (e.g., `full-stack`) doesn't implement logic itself — it sequences other skills and passes context between them.

### Example: Full-Stack Chain

```
architect → backend → frontend → code-reviewer → qa
```

Each skill in the chain:
1. Receives the output/context from the previous skill
2. Runs its own back-pressure checks (tests, lint, typecheck)
3. Passes results forward or blocks the chain

### Composition Skill Structure

The composition SKILL.md declares a `## Skill Chain` table listing dependencies in order, with each skill's responsibility and success criteria.

### Enhancement Chain (lighter)

```
code-reviewer → qa
```

Used for incremental improvements — review existing code, then validate changes.

## Why This Matters for GHQ

GHQ currently has standalone skills (`/research`, `/learn`, `/blueprint`) but no composition mechanism. The `/research-loop` is a manual chain: read queue → pick item → research → write entry → reindex. This could be formalized as a chain with back-pressure.

Potential GHQ chains:
- **Deep Research**: `queue-pick → web-search → synthesize → write-entry → reindex → validate`
- **Knowledge Audit**: `tag-audit → dedup-check → staleness-scan → cleanup`
- **Blueprint + Fill**: `blueprint → research-loop` (bootstrap domain, then research gaps)

Chains would also make the subprocess model (`ask-claude.sh`) more structured — each chain step maps to one subprocess invocation with clear inputs/outputs.
