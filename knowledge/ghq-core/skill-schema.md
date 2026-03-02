# Skill Schema (SKILL.md)

Skills are the composable execution units in GHQ. Each skill lives in `.claude/skills/{skill-id}/SKILL.md` and uses the native Claude Code skill format -- a Markdown file with YAML frontmatter.

> For the conceptual overview of the skill system (types, composition, execution model), see [knowledge/skills/README.md](../skills/README.md). This document focuses on the SKILL.md schema itself.

## File Location

```
.claude/skills/
  {skill-id}/
    SKILL.md           # Skill definition (native Claude Code format)
    README.md          # Optional extended docs
```

No registry file is needed. Claude Code discovers skills automatically from `.claude/skills/*/SKILL.md`.

## SKILL.md Format

A SKILL.md file is a Markdown document with YAML frontmatter. The frontmatter declares metadata; the Markdown body contains instructions.

### Minimal Example

```markdown
---
name: Backend Developer
description: Implements server-side logic, APIs, and database integrations
---

# Backend Developer

Implement the backend changes described in the task.

- Follow existing patterns in src/
- Write tests for all new code
- Run `npm run typecheck` before marking work complete
```

### Full Example

```markdown
---
name: Architect
description: System design, API design, and architecture decisions
---

# Architect

You are the architect skill. Design the system changes needed for the task.

## Responsibilities

- Analyze requirements and propose architecture
- Document API contracts and data models
- Make technology decisions with rationale
- Consider scalability, maintainability, and security

## Output

Produce a design document covering:
1. Overview of changes
2. API endpoints or interfaces
3. Data model changes
4. Key decisions with rationale

## Constraints

- Follow existing patterns in the codebase
- Prefer simple solutions over clever ones
- Document trade-offs explicitly
```

## Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable display name |
| `description` | string | Yes | One-sentence summary shown in skill listings |

The skill's `id` is inferred from the directory name (e.g., `.claude/skills/architect/` has id `architect`).

## Markdown Body

The body is the instruction prompt loaded when the skill activates. It should:

- Focus on the skill's domain
- Define responsibilities and constraints
- Specify expected output format
- Reference relevant knowledge paths rather than duplicating content

## Skill Types

GHQ skills have three conceptual types, expressed through their instructions:

| Type | Purpose | How Expressed |
|------|---------|---------------|
| `execution` | Does work directly (writes code, reviews, designs) | Instructions describe work to do |
| `composition` | Chains other skills | Instructions describe the chain and handoff protocol |
| `library` | Shared context loaded by other skills | Instructions provide reference material |

## Composition Skills

A composition skill's SKILL.md describes the dependency chain in its instructions:

```markdown
---
name: Full Stack
description: End-to-end feature delivery chaining architect, backend, frontend, and review
---

# Full Stack

This is a composition skill. Execute the following skills in order:

1. **architect** -- Design the solution
2. **backend** -- Implement server-side logic (if task involves server-side)
3. **frontend** -- Implement UI changes (if task involves UI)
4. **code-reviewer** -- Review all changes

Pass handoff JSON between each skill.
```

## Migration from skill.yaml (v1)

v2 replaces the custom `skill.yaml` + `registry.yaml` system with native Claude Code `SKILL.md` files:

| v1 (skill.yaml) | v2 (SKILL.md) |
|------------------|----------------|
| `id:` field | Inferred from directory name |
| `name:` field | `name:` in frontmatter |
| `description:` field | `description:` in frontmatter |
| `type:` field | Expressed in instructions |
| `depends_on:` field | Described in instructions |
| `context:` block | Not needed; Claude Code handles context |
| `instructions:` field | Markdown body |
| `registry.yaml` | Not needed; auto-discovered |

## Validation

A valid SKILL.md must:

1. Have YAML frontmatter with `name` and `description`
2. Have a non-empty Markdown body with instructions
3. Live in `.claude/skills/{skill-id}/SKILL.md`
4. Have a directory name that is lowercase with hyphens

## See Also

- [Skill Authoring Guide](../skills/README.md) -- Concepts, creation workflow
- [.claude/skills/](../../.claude/skills/) -- All skill definitions
- [Quick Reference](quick-reference.md) -- GHQ overview
