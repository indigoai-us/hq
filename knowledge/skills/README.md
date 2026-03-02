# Skill Authoring Guide

Skills are composable modules that load on demand in GHQ. They use the native Claude Code `SKILL.md` format -- a Markdown file with YAML frontmatter that Claude Code discovers automatically.

## Quick Start

1. Create the skill directory:
   ```bash
   mkdir .claude/skills/my-skill
   ```

2. Write `.claude/skills/my-skill/SKILL.md`:
   ```markdown
   ---
   name: My Skill
   description: One-sentence summary of what this skill does
   ---

   # My Skill

   Instructions for what this skill does when activated.

   - Responsibility 1
   - Responsibility 2
   - Constraint or quality gate
   ```

3. Done. Claude Code discovers it automatically from `.claude/skills/*/SKILL.md`.

## SKILL.md Format

### Frontmatter (Required)

```yaml
---
name: Human-Readable Name
description: One-sentence summary shown in skill listings
---
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name (e.g., "Backend Developer") |
| `description` | string | Yes | One-sentence summary |

The skill's **id** is inferred from the directory name. For example, `.claude/skills/code-reviewer/SKILL.md` has id `code-reviewer`.

### Body (Required)

The Markdown body is the instruction prompt loaded when the skill activates. Write it as if you are briefing a developer:

- Define the skill's responsibilities
- Specify constraints and quality expectations
- Describe expected output format
- Reference knowledge paths rather than duplicating content

## Skill Types

GHQ recognizes three conceptual skill types. The type is expressed through the instructions, not a metadata field:

| Type | Purpose | Example |
|------|---------|---------|
| **execution** | Does work directly | architect, backend, code-reviewer |
| **composition** | Chains other skills in sequence | full-stack |
| **library** | Provides shared context | (loaded by other skills) |

### Execution Skills

The most common type. The SKILL.md contains direct instructions for work:

```markdown
---
name: Backend Developer
description: Implements server-side logic, APIs, and database integrations
---

# Backend Developer

Implement the backend changes described in the task.

## Responsibilities
- Write server-side code following existing patterns
- Create or update API endpoints
- Write tests for all new code

## Quality Gates
- Run `npm run typecheck` before completing
- All new endpoints must have test coverage
```

### Composition Skills

A composition skill orchestrates other skills. Its SKILL.md describes the chain:

```markdown
---
name: Full Stack
description: End-to-end feature delivery chaining multiple skills
---

# Full Stack

Execute the following skills in order, passing handoff context between each:

1. **architect** -- Design the solution
2. **backend** -- Implement server-side logic (if needed)
3. **frontend** -- Implement UI changes (if needed)
4. **code-reviewer** -- Review all changes
```

### Library Skills

Library skills provide shared context. They are referenced in other skills' instructions:

```markdown
---
name: API Patterns
description: Shared REST API patterns and conventions for backend skills
---

# API Patterns

## Endpoint Conventions
- Use plural nouns for resource paths
- Always return JSON
- Include pagination for list endpoints
...
```

## Handoff Protocol

When skills run in a chain, each skill passes structured context to the next:

```json
{
  "from_skill": "architect",
  "to_skill": "backend",
  "summary": "Designed REST API with 3 endpoints",
  "files_changed": ["docs/design.md"],
  "decisions": ["chose REST over GraphQL for simplicity"],
  "back_pressure": {
    "tests": "pass",
    "types": "pass"
  }
}
```

## Back-Pressure

After each skill completes, the orchestrator runs quality gates (tests, typecheck, lint, build). If checks fail:

1. Skill gets one retry
2. If retry fails, story is blocked
3. Result is appended to `loops/state.jsonl`

## Naming Conventions

- Directory name: lowercase with hyphens (e.g., `code-reviewer`)
- Display name: title case (e.g., "Code Reviewer")
- Description: one sentence, no period

## Directory Layout

```
.claude/skills/
  architect/
    SKILL.md
  code-reviewer/
    SKILL.md
  full-stack/
    SKILL.md
```

## See Also

- [Skill Schema Reference](../ghq-core/skill-schema.md) -- Full SKILL.md field definitions
- [.claude/skills/](../../.claude/skills/) -- All skill definitions
- [Quick Reference](../ghq-core/quick-reference.md) -- GHQ overview
