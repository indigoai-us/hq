---
title: "Filesystem and Collection Scoping for Company Segregation"
category: knowledge-segregation
tags: ["knowledge-management", "information-architecture", "cli", "personal-knowledge", "runtime-isolation"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Practical patterns for enforcing knowledge segregation through filesystem layout and search collection boundaries. These are the most immediately actionable controls in a system like GHQ.

## Filesystem Layout

The GHQ `companies/{slug}/` structure already provides a natural boundary. Each company gets its own directory tree with projects and repos underneath. The key question is how to extend this to knowledge:

- **Company-scoped knowledge**: `companies/{slug}/knowledge/` — knowledge that is specific to this company, never searched outside its context
- **General knowledge**: `knowledge/` — domain knowledge, patterns, and techniques that are company-agnostic
- **The gray area**: Insights learned *while* working for a company that are general in nature (e.g., "React Server Components work well for X pattern"). These need a process for sanitization before promotion to general knowledge.

## Collection Scoping

Search tools like qmd support named collections. A segregation model could use:

- `ghq` collection: general knowledge only
- `{company-slug}` collection: company-specific knowledge + general knowledge
- Never mix company collections in a single query

## CLAUDE.md Scoping

Claude Code's project instructions (`companies/{slug}/.claude/CLAUDE.md`) already scope per working directory. This is a natural place to declare which knowledge collections are in-scope and enforce constraints like "never reference knowledge from other company directories."

## Gaps

- No automated enforcement exists yet — segregation relies on discipline and convention
- qmd doesn't currently support collection-level access controls
- The sanitization process for promoting company-learned insights to general knowledge is undefined
