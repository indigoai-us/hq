# Task Schema

Tasks in GHQ are managed through beads (`bd` CLI). Only companies and projects are epics. Tasks contain subtasks that are executed by `/run-loop` and `/execute-task`.

## Hierarchy

Tasks are stored in the beads database (`.beads/`). No filesystem files needed -- all task data lives in beads.

```
Company Epic                    ← created by /newcompany
└── Project Epic                ← created manually or by /create-task (if project doesn't exist)
    └── Task                    ← created by /create-task
        ├── Subtask 1
        ├── Subtask 2 (depends on 1)
        └── Subtask 3
```

**Only companies and projects are epics.** Tasks and subtasks use `--type task`.

## Creating Tasks

### Company Epic (created by /newcompany)

```bash
bd create "Company Name" --type epic --labels "company"
```

### Project Epic (under company)

```bash
bd create "Project Name" \
  --type epic \
  --parent {company-epic-id} \
  --description "Project description" \
  --labels "company-label"
```

### Task (under project epic — created by /create-task)

```bash
bd create "Feature title" \
  --parent {project-epic-id} \
  --type task \
  --description "1-sentence goal" \
  --metadata '{"qualityGates":["npm run typecheck && npm run lint"],"repoPath":"/path/to/repo","relatedSkills":["architect","backend"],"goal":"Overall goal","successCriteria":"Measurable outcome","workMode":"main"}' \
  --labels "company-label"
```

### Subtasks (under task)

```bash
bd create "Subtask title" \
  --parent {task-id} \
  --type task \
  --description "As a [user], I want [feature] so that [benefit]" \
  --priority 1 \
  --metadata '{"acceptanceCriteria":["criterion 1"],"e2eTests":["test 1"]}'
```

### Dependencies

```bash
bd dep add {subtask-id} {depends-on-id}
```

## Task Fields

### Task Metadata (on the task created by /create-task)

| Field | Description |
|-------|-------------|
| `qualityGates` | Commands to run after each skill (e.g. `["npm run typecheck"]`) |
| `repoPath` | Path to target repository |
| `relatedSkills` | Skill IDs from registry (e.g. `["architect", "backend"]`) |
| `goal` | Overall goal statement |
| `successCriteria` | Measurable outcome |
| `workMode` | `main` or `worktree` |

### Subtask Metadata

| Field | Description |
|-------|-------------|
| `acceptanceCriteria` | Verifiable criteria for completion |
| `e2eTests` | End-to-end tests that must pass |

### Standard Beads Fields

| Field | Description |
|-------|-------------|
| ID | Unique identifier (e.g. `ghq-abc123`) |
| Title | Short descriptive title |
| Description | Full description (prefer "As a [user], I want [feature] so that [benefit]") |
| Priority | 0-4 (0 = highest) |
| Status | open / in_progress / closed |
| Labels | Categorization tags |
| Type | `epic` (companies and projects only) / `task` (tasks and subtasks) |
| Parent | Parent ID (project epic for tasks, task for subtasks) |

## E2E Tests (Required)

Every subtask must include E2E tests in metadata. These specify verifiable checks that must pass before a task can be closed.

**For Web/UI Tasks:**
- "Page loads and renders expected content"
- "User can complete [action] successfully"

**For API Tasks:**
- "GET /endpoint returns 200 with expected schema"
- "POST /endpoint creates resource and returns 201"

**For CLI/Infrastructure Tasks:**
- "Command runs without errors and exits with code 0"

## Task Lifecycle

```
open -> in_progress -> closed
                    -> blocked (if back-pressure fails)
```

Managed via `bd` CLI:
```bash
bd list                    # List all tasks
bd show {id}               # Show task details
bd children {epic-id}      # List subtasks
bd close {id}              # Mark task complete
bd set-state {id} blocked  # Mark as blocked
```

## Quality Gates

Quality gates are configured per-epic in metadata and run by the orchestrator after each skill completes:

```
tests:     npm run test
typecheck: npm run typecheck
lint:      npm run lint
build:     npm run build
```

## Execution

The orchestrator processes subtasks from beads:

```
/run-loop {task-id}
  -> bd children {task-id} --json (get subtasks by priority)
  -> for each open subtask (respecting dependencies)
    -> /execute-task {subtask-id}
      -> run skill chain
      -> run back-pressure (quality gates from parent task metadata)
      -> bd close {subtask-id} on success
      -> append to loops/state.jsonl
```

## Validation

Subtasks are validated by the orchestrator before execution:

1. **Dependencies met** -- All depends-on tasks are closed
2. **E2E tests present** -- Every open subtask has e2eTests in metadata
3. **No circular deps** -- Dependency graph is acyclic

## See Also

- [Loops Schema](loops-schema.md) -- Execution state format
- [Quick Reference](quick-reference.md) -- GHQ overview
