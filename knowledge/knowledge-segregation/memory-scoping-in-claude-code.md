---
title: "Memory Scoping in Claude Code for Multi-Company Work"
category: knowledge-segregation
tags: ["claude-code", "knowledge-management", "context-management", "personal-knowledge", "security"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Claude Code's memory system has built-in scoping that partially addresses multi-company segregation, but gaps remain.

## How Claude Code Memory Scoping Works

Claude Code stores memories at two levels:

1. **Global memory** (`~/.claude/projects/.../memory/MEMORY.md`): Loaded in every conversation. Contains user preferences, cross-project feedback, and general workflow rules.

2. **Project memory** (`{project}/.claude/projects/.../memory/MEMORY.md`): Loaded only when the working directory matches. Contains project-specific facts, decisions, and context.

The project-scoping mechanism means that memories saved while working in `companies/acme/` should only load when the working directory is within that path. This provides passive segregation.

## Remaining Risks

1. **Global memory leakage**: If a user saves a company-specific insight to global memory (intentionally or by accident), it becomes visible in all contexts.

2. **Memory content vs. learned behavior**: Even if memories are scoped, the *model's behavior* may be influenced by patterns seen in prior conversations within the same session. Starting a fresh session per company mitigates this.

3. **CLAUDE.md instructions**: Project-level CLAUDE.md files are well-scoped, but global CLAUDE.md (`~/.claude/CLAUDE.md`) applies everywhere. Company-specific rules must never go in global config.

4. **No delete-on-switch**: There's no mechanism to purge conversation context when switching between company working directories within a single session.

## Practical Recommendations (Speculative)

- Use separate terminal sessions per company, not just separate directories
- Review global memory periodically for company-specific leakage
- Add explicit segregation rules to each company's `.claude/CLAUDE.md`
- Consider whether worktrees (separate git working trees) provide additional isolation
