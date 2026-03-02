# PRD Schema

Product Requirements Documents (PRDs) in GHQ define projects and their user stories. In v2, PRDs are managed through beads (`bd` CLI) for issue tracking, replacing the monolithic JSON file approach.

## Location

```
projects/{project-name}/
  README.md              # Project overview and decisions
  .beads/                # Beads issue tracking data
```

## Beads Workflow

Stories are managed as beads issues using the `bd` CLI:

```bash
# List all stories
bd list

# Show story details
bd show US-001

# Create a new story
bd create "User registration form"

# Close a completed story
bd close US-001

# Initialize beads in a project
bd init
```

### Story Fields

Each story (bead) contains:

| Field | Description |
|-------|-------------|
| ID | Unique identifier (format: `US-XXX`) |
| Title | Short descriptive title |
| Description | Full description (prefer "As a [user], I want [feature] so that [benefit]") |
| Acceptance Criteria | Verifiable criteria for completion |
| E2E Tests | End-to-end tests that must pass |
| Priority | Execution priority (1 = highest) |
| Status | open / closed |
| Labels | Categorization tags |
| Depends On | IDs of stories that must complete first |
| Notes | Implementation notes (filled by executor) |

### E2E Tests (Required)

Every story must include E2E tests. These specify verifiable checks that must pass before a story can be marked complete.

**For Web/UI Stories:**
- "Page loads and renders expected content"
- "User can complete [action] successfully"

**For API Stories:**
- "GET /endpoint returns 200 with expected schema"
- "POST /endpoint creates resource and returns 201"

**For CLI/Infrastructure Stories:**
- "Command runs without errors and exits with code 0"
- "ls knowledge/ralph/ | wc -l returns 13+"

### Story Lifecycle

```
open -> in-progress -> closed
                    -> blocked (if back-pressure fails)
```

Closed stories remain in beads history. Unlike v1's `archive` field, beads tracks lifecycle natively.

## Project README.md

Each project has a README.md for human context:

```markdown
# {Project Name}

> One-sentence description.

## Goal

What problem does this project solve?

## Success Criteria

How will we know the project is complete?

## Stories

| ID | Title | Status |
|----|-------|--------|
| US-001 | ... | open |

## Key Decisions

Document significant decisions made during the project.
```

See [project-template.md](project-template.md) for the full template.

## Quality Gates

Quality gates are configured per-project and run by the orchestrator after each skill completes:

```
tests:     npm run test
typecheck: npm run typecheck
lint:      npm run lint
build:     npm run build
```

## Execution

The orchestrator processes stories from beads:

```
/run-project
  -> bd list (get stories by priority)
  -> for each open story (respecting depends-on)
    -> /execute-task
      -> run skill chain
      -> run back-pressure (quality gates)
      -> bd close US-XXX on success
      -> append to loops/state.jsonl
```

## Validation

Stories are validated by the orchestrator before execution:

1. **ID format** -- Story IDs match `US-XXX` pattern
2. **E2E tests present** -- Every open story has E2E tests
3. **Dependencies exist** -- All depends-on IDs reference existing stories
4. **No circular deps** -- Dependency graph is acyclic

## See Also

- [Project Template](project-template.md) -- README.md template for new projects
- [Loops Schema](loops-schema.md) -- Execution state format
- [Quick Reference](quick-reference.md) -- GHQ overview
