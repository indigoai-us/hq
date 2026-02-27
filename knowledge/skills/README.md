# Skill Framework

Skills are composable modules that replace HQ's worker system. They live in `.claude/skills/` and load on demand -- no context is burned until a skill activates.

## Concepts

**Skill** -- a YAML file (`skill.yaml`) that declares identity, dependencies, context needs, and instructions. Skills are not autonomous agents. They are context modules that an orchestrator (`/execute-task`) loads into a sub-agent.

**Skill types:**

| Type | Purpose | Executable? |
|------|---------|-------------|
| `execution` | Does work directly (writes code, reviews, designs) | Yes |
| `composition` | Chains other skills via `depends_on` | No (orchestrator resolves the chain) |
| `library` | Shared utilities loaded by other skills | No (loaded as context by other skills) |

**Registry** -- `.claude/skills/registry.yaml` lists all skills. Kept in sync by `/cleanup --reindex`.

## Skill Schema

Every skill lives in `.claude/skills/{skill-id}/skill.yaml`. The full template is at `.claude/skills/_template/skill.yaml`.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier, matches directory name |
| `name` | string | Human-readable display name |
| `description` | string | One-sentence summary |
| `type` | enum | `execution`, `composition`, or `library` |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `depends_on` | list | Skills this skill depends on |
| `context` | object | Files to load (`base`, `dynamic`, `exclude`) |
| `instructions` | string | Prompt loaded when the skill activates |

### No Version Field

Git history tracks skill evolution. No `version:` field needed.

## Dependencies and Composition

Skills declare dependencies via `depends_on`. The orchestrator (`/execute-task`) resolves the full dependency chain before execution.

### Simple Dependencies

```yaml
depends_on:
  - architect
  - code-reviewer
```

Both skills always load when this skill is used.

### Conditional Dependencies

```yaml
depends_on:
  - skill: database
    when: "task involves schema changes"
  - skill: architect
    when: always
```

The `when` field is a natural-language condition evaluated by `/execute-task` against the task description. `when: always` means the dependency is unconditional.

### Composition Skills

A composition skill does no work itself. It declares a dependency chain that the orchestrator executes in order.

Example: `full-stack` depends on `[architect, backend, frontend, code-reviewer, qa]`. When `/execute-task` classifies a task as full-stack, it:

1. Loads `full-stack/skill.yaml`
2. Resolves `depends_on` into an ordered list
3. Evaluates each `when` condition against the task
4. Executes matching skills sequentially, passing handoff JSON between them

## Context Loading

Skills declare what files they need. Nothing loads until the skill activates.

```yaml
context:
  base:
    - .claude/skills/my-skill/        # Always loaded
    - knowledge/patterns/             # Always loaded

  dynamic:
    - pattern: "{repo}/src/"          # Loaded at runtime
      when: always
    - pattern: "{repo}/prisma/"
      when: "task involves database"

  exclude:
    - node_modules/
    - dist/
```

**`base`** -- files always loaded when the skill activates.
**`dynamic`** -- files loaded conditionally. `{repo}` is replaced with the target repository path at runtime.
**`exclude`** -- patterns to never load (saves context window).

## Execution Model

Skills do not run themselves. The execution flow is:

```
/run-project
  -> loops through PRD stories
  -> /execute-task per story
    -> classifies task type
    -> resolves skill chain
    -> spawns sub-agent per skill with fresh context
    -> passes handoff JSON between skills
    -> runs back-pressure checks after each skill
```

### Handoff Protocol

Each skill in a chain receives structured handoff JSON from the previous skill:

```json
{
  "from_skill": "architect",
  "to_skill": "backend",
  "summary": "Designed REST API with 3 endpoints",
  "files_changed": ["src/api/routes.ts"],
  "decisions": ["chose REST over GraphQL for simplicity"],
  "back_pressure": {
    "tests": "pass",
    "types": "pass"
  }
}
```

### Back-Pressure

After each skill completes, the orchestrator runs verification checks (tests, type checks, lint). If checks fail, the skill gets one retry. If the retry fails, the story is marked as blocked.

## How Skills Differ from HQ Workers

| Aspect | HQ Workers | GHQ Skills |
|--------|-----------|------------|
| Identity | `worker.yaml` with type, team, version | `skill.yaml` with type only |
| Execution | MCP servers, state machines, spawn methods | Context modules loaded by orchestrator |
| Organization | Teams (dev-team, content-team, social-team) | Flat directory, no teams |
| Composition | Ad-hoc worker pipelines | Declarative `depends_on` chains |
| Context | Always loaded via CLAUDE.md references | Loaded on demand when skill activates |
| Configuration | execution, verification, reporting, mcp sections | Just context and instructions |
| Complexity | ~100 lines per worker.yaml | ~30-50 lines per skill.yaml |

## Creating a New Skill

1. Copy the template:
   ```
   cp -r .claude/skills/_template .claude/skills/{my-skill}
   ```

2. Edit `.claude/skills/{my-skill}/skill.yaml`:
   - Set `id`, `name`, `description`, `type`
   - Add `depends_on` if this skill chains others
   - Define `context` paths
   - Write `instructions`

3. Register in `.claude/skills/registry.yaml`:
   ```yaml
   - id: my-skill
     path: .claude/skills/my-skill/
     type: execution
     description: "What this skill does"
   ```

4. Run `/cleanup --reindex` to validate.

## Directory Layout

```
.claude/skills/
  _template/          Schema reference (not a skill)
    skill.yaml
  registry.yaml       Index of all skills
  architect/
    skill.yaml
  code-reviewer/
    skill.yaml
  full-stack/
    skill.yaml
  backend/            (future — US-018)
    skill.yaml
  frontend/           (future — US-018)
    skill.yaml
  database/           (future — US-018)
    skill.yaml
  qa/                 (future — US-018)
    skill.yaml
```
