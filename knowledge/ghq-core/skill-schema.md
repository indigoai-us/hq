# Skill Schema

Skills are the composable execution units in GHQ. Each skill lives in `.claude/skills/{skill-id}/skill.yaml` and declares its identity, dependencies, context needs, and instructions.

> For the conceptual overview of the skill system (types, composition, execution model, handoff protocol), see [knowledge/skills/README.md](../skills/README.md). This document focuses on the YAML schema itself.

## File Location

```
.claude/skills/
  registry.yaml          # Index of all skills
  _template/
    skill.yaml           # Schema reference (not a real skill)
  {skill-id}/
    skill.yaml           # Skill definition
    README.md            # Optional extended docs
```

## Full Schema

```yaml
# Required
id: string                     # Unique identifier, matches directory name
name: string                   # Human-readable display name
description: string            # One-sentence summary
type: execution|composition|library

# Optional
depends_on:
  - string                     # Simple: always-loaded dependency
  - skill: string              # Conditional dependency
    when: string               # Natural-language condition or "always"

context:
  base:
    - string                   # Paths always loaded when skill activates
  dynamic:
    - pattern: string          # Path pattern, {repo} replaced at runtime
      when: string             # Natural-language condition or "always"
  exclude:
    - string                   # Patterns to never load

instructions: |
  Multi-line prompt loaded when the skill activates.
```

## Field Definitions

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Matches the directory name exactly. Lowercase with hyphens (e.g., `code-reviewer`) |
| `name` | string | Human-readable label shown in logs (e.g., `Code Reviewer`) |
| `description` | string | One-sentence summary of what the skill does |
| `type` | enum | `execution`, `composition`, or `library` — see Skill Types below |

### Skill Types

| Type | Purpose | Executable? |
|------|---------|-------------|
| `execution` | Does work directly (writes code, reviews, designs) | Yes |
| `composition` | Chains other skills via `depends_on` | No — orchestrator resolves the chain |
| `library` | Shared utilities loaded as context by other skills | No |

### depends_on

Declares skills this skill requires. Two forms:

**Simple (unconditional):**
```yaml
depends_on:
  - architect
  - code-reviewer
```

**Conditional:**
```yaml
depends_on:
  - skill: database
    when: "task involves schema changes"
  - skill: architect
    when: always
```

The `when` field is evaluated by `/execute-task` against the task description. `when: always` is unconditional.

### context

Controls what files are loaded into the sub-agent's context when the skill activates.

| Sub-field | Description |
|-----------|-------------|
| `base` | Paths always loaded. Use for skill instructions, patterns, and static knowledge |
| `dynamic` | Paths loaded conditionally. `{repo}` is replaced with the target repository path at runtime |
| `exclude` | Glob patterns to never load (saves context window) |

**Example:**
```yaml
context:
  base:
    - .claude/skills/backend/
    - knowledge/ghq-core/
  dynamic:
    - pattern: "{repo}/src/"
      when: always
    - pattern: "{repo}/prisma/"
      when: "task involves database"
  exclude:
    - node_modules/
    - dist/
    - "*.test.ts"
```

### instructions

A multi-line YAML string containing the prompt injected into the sub-agent when this skill activates. Keep it focused on the skill's domain. Reference `context.base` files rather than duplicating their content.

```yaml
instructions: |
  You are the backend skill. Your job is to implement server-side logic
  based on the architect's design decisions.

  - Follow patterns in {repo}/src/
  - Write tests for all new endpoints
  - Run `npm run typecheck` before marking work complete
```

## Registry Entry

Every skill must be registered in `.claude/skills/registry.yaml`:

```yaml
- id: my-skill
  path: .claude/skills/my-skill/
  type: execution
  description: "What this skill does"
```

The registry is the index that `/execute-task` uses to discover and load skills. It is kept in sync by `/cleanup --reindex`.

## No Version Field

Unlike HQ workers, skills have no `version:` field. Git history tracks skill evolution. This keeps skill files lean and avoids version drift issues.

## Minimal Example (Execution Skill)

```yaml
id: backend
name: Backend Developer
description: Implements server-side logic, APIs, and database integrations
type: execution

context:
  base:
    - .claude/skills/backend/
  dynamic:
    - pattern: "{repo}/src/"
      when: always

instructions: |
  Implement the backend changes described in the task.
  Follow existing patterns in src/.
  Write tests for all new code.
```

## Composition Example

```yaml
id: full-stack
name: Full Stack
description: Chains architect, backend, frontend, and code-reviewer for complete feature work
type: composition

depends_on:
  - skill: architect
    when: always
  - skill: backend
    when: "task involves server-side logic"
  - skill: frontend
    when: "task involves UI changes"
  - skill: code-reviewer
    when: always
```

## Validation Rules

A valid skill.yaml must:

1. Have all four required fields (`id`, `name`, `description`, `type`)
2. Have `id` that exactly matches its directory name
3. Have `type` that is one of the three allowed values
4. Have a matching entry in `registry.yaml`
5. Not duplicate an existing `id`

## See Also

- [Skill Framework Overview](../skills/README.md) — Concepts, execution model, handoff protocol
- [.claude/skills/](../../.claude/skills/) — All skill definitions
- [.claude/skills/registry.yaml](../../.claude/skills/registry.yaml) — Skill registry
- [Quick Reference](quick-reference.md) — GHQ commands overview
