---
description: Decompose a task into subtasks for execution via /run-project
allowed-tools: Task, Read, Glob, Grep, Write, Bash, Edit
argument-hint: [task/feature description]
visibility: public
---

# /plan-project - Decompose Task into Subtasks

Break down an existing task into subtasks for execution via `/run-project`. Only companies and projects are epics — tasks are never epics.

**User's input:** $ARGUMENTS

**Pipeline:** `/idea` → `/brainstorm` → **`/plan-project`** → `/run-project`

**Important:** Do NOT implement. Just create the tasks.

## Hierarchy

```
Project Epic (root)             ← created by /new-project
└── Task (created here)         ← /plan-project creates subtasks under this
    ├── Subtask 1
    ├── Subtask 2
    └── Subtask 3
```

Only projects are epics (root-level, no parent). `/plan-project` decomposes a task into subtasks under a project epic.

## Step 1: Get Task Description

If $ARGUMENTS provided, use as starting point.
If empty, ask: "Describe what you want to build or accomplish."

### Check for Existing Task

1. If `$ARGUMENTS` matches a bd task ID (e.g. `ghq-abc`), read the task with `bd show {task-id} --json`
   - Use the task's title and description as starting context
2. If the task description contains a brainstorm (has `## Approaches` and `## Recommendation` sections):
   - Extract: context, recommendation, approaches, next steps
   - Announce: "Found brainstorm: **{title}** — using recommended approach (Option {X})"
   - Pre-populate the discovery interview (Step 4) with brainstorm context — skip questions already answered

## Step 2: Scan GHQ Context

Before asking questions, explore GHQ:

**Skills:**
- Scan `.claude/skills/*/SKILL.md` frontmatter for available skills

**Companies & Context:**
- Read `companies/manifest.yaml` (which companies exist, their repos/knowledge)

**Existing Epics (projects):**
- `bd list --type epic --json` (list company and project epics)

**Knowledge (use qmd, not Grep):**
- `qmd vsearch "<description keywords>" --json -n 10` -- semantic search for related knowledge, prior work, skills

**Target Repo (if repo specified or discovered):**
- If target repo has a qmd collection: `qmd vsearch "<description keywords>" -c {collection} --json -n 10`
- Present: "Found related code: {list of relevant files}"

Present:
```
Scanned GHQ:
- Skills: {relevant list from registry}
- Project epics: {list of project epics}
- Relevant knowledge: {if any}
- Category: [company-specific | personal | GHQ infrastructure]
```

## Step 2b: Resolve Company Context

From the scan, identify which company this task belongs to. Then ensure all `bd` commands run in the company directory:

```bash
cd companies/{slug}
```

All subsequent `bd` commands in this session must run from the company directory.

## Step 3: Select Project Epic

List available project epics from the scan and ask the user which one this task belongs under:

```
Available project epics:
  1. {epic-id}: {title} (company: {label})
  2. {epic-id}: {title} (company: {label})
  ...

Which project epic should this task go under?
```

If the user says the project doesn't exist yet, create a root project epic:

```bash
bd create "{project name}" \
  --type epic \
  --description "{project description}" \
  --labels "{company-label},{project-slug}" \
  --silent
```

Then use the new project epic ID as the parent for the task.

Also infer or ask for a short task title. Check for similar existing tasks under the selected project:

```bash
bd children {project-epic-id} --json
```

If a similar task exists: "A similar task exists ({id}: {title}). Continue with a new one or add subtasks to the existing one?"

## Step 4: Discovery Interview

Ask questions in batches using AskUserQuestion

**Batch 1: Problem & Success**
1. Core problem or goal?
2. What does success look like? (measurable)
3. Who benefits?

**Batch 2: Scope & Constraints**
4. What's in scope for MVP?
5. Hard constraints (time, tech, budget)?
6. Dependencies on other tasks?

**Batch 3: Integration & Quality**
7. Quality gates? (detect repo from scan, suggest commands)
   A. `bun run typecheck && bun run lint`
   B. `npm run typecheck && npm run lint`
   C. None (no automated checks)
   D. Other: [specify]
8. Based on scan: "Should this use skills: {relevant skills from registry}?"
9. Repo path? (e.g. path to repo, or "none" if non-code)
10. Work mode? GHQ never uses feature branches.
    A. Work on `main` (simple, direct)
    B. Use a git worktree (isolated, parallel-safe)

**Batch 4: E2E Testing (recommended for deployable tasks)**
For each subtask targeting a deployable repo, specify E2E tests:

11. What E2E tests should verify this subtask works?
    - For UI: "Page loads", "User can complete [action]", "Form shows validation errors"
    - For API: "Endpoint returns expected response", "Error cases handled"
    - For CLI: "Command runs successfully", "Opens correct URL"
    - For integration: "Full flow from [A] to [B] works"
    - Leave empty for non-deployable tasks (knowledge, content, data)

## Step 5: Create Task + Subtasks in Beads

### 5a. Create Task Under Project Epic

```bash
bd create "{task title}" \
  --parent {project-epic-id} \
  --type task \
  --description "{1-sentence goal}

## Acceptance Criteria

- {criterion 1}
- {criterion 2}
- ..." \
  --metadata '{"qualityGates":["{commands}"],"repoPath":"{path}","relatedSkills":["{ids}"],"goal":"{goal}","successCriteria":"{criteria}","workMode":"{main|worktree}"}' \
  --labels "{company-label},{category}" \
  --silent
```

Capture the returned task ID (e.g. `ghq-abc123`).

### 5b. Create Subtasks

For each subtask, create a child under the task:

```bash
bd create "{subtask title}" \
  --parent {task-id} \
  --type task \
  --description "{As a [user], I want [feature] so that [benefit]}

## Acceptance Criteria

- {criterion 1}
- {criterion 2}
- ..." \
  --priority {1-4} \
  --metadata '{"acceptanceCriteria":["{criteria}"],"e2eTests":["{tests}"]}' \
  --silent
```

### 5c. Add Dependencies Between Subtasks

If subtasks have ordering dependencies:

```bash
bd dep add {subtask-id} {depends-on-id}
```

## Step 6: Reindex

```bash
qmd update 2>/dev/null || true
```

## Step 7: Lint

```bash
bd lint
```

Fix any issues reported before proceeding.

## Step 8: Confirm & STOP

Present the full plan to the user. Show the task description and each subtask's description in separate code blocks so the user can review exactly what was created.

Format:

---

Task **{task-id}**: {title}
Project: {project-epic-id} ({project title})
Subtasks: {N}

### Task Description

```
{full task description text, as stored in beads}
```

### Subtasks

**{subtask-1-id}**: {title} (P{priority})
{dependency info, e.g. "blocked by .1"}

```
{full subtask-1 description text, as stored in beads}
```

**{subtask-2-id}**: {title} (P{priority})
{dependency info}

```
{full subtask-2 description text, as stored in beads}
```

{...repeat for all subtasks...}

---

To execute, start a new session and run:
```
/run-project {task-id}        (run all subtasks via bd-worker)
```

To view:
```
bd show {task-id}
bd children {task-id}
```

**Then STOP.** Do NOT proceed to execution.

## Subtask Guidelines

### Sizing
- Each subtask completable by a single agent in one context window — typically 1-2 files, one logical change
- 1-2 files modified (3 max for tightly coupled changes)
- If you need "and" to describe what a subtask does, split it
- Keep subtasks atomic (one deliverable each)

### Acceptance Criteria
- Each criterion must be binary pass/fail (not subjective like "works correctly")
- At least one criterion must be machine-checkable (test, lint, typecheck, curl)
- Include at least one negative case (what should NOT happen)
- Each criterion testable without depending on other incomplete subtasks

### Ordering & Testing
- Order: schema -> backend -> UI -> integration
- `e2eTests`: required for subtasks with user-facing or deployable changes. Not needed for schema-only, refactor, or infrastructure subtasks. Store in metadata.
- For deployable tasks, include at least one subtask dedicated to E2E test infrastructure (Phase 0 pattern)

## Rules

- Scan GHQ first, ask questions second
- Batch questions (don't overwhelm)
- **Never create epics** -- only projects are epics (root-level). `/plan-project` creates subtasks only
- **Beads is the source of truth** -- all tasks managed via `bd` CLI
- **Do NOT use EnterPlanMode** -- this skill IS planning
- **Do NOT use TodoWrite** -- beads subtasks track tasks
- **Skills, not workers** -- reference skill IDs from `.claude/skills/`, not worker names
- **Work mode: main or worktree only** -- GHQ never uses feature branches. Ask user to choose in interview
- **Company context** -- if the task relates to a company, apply the appropriate company label
- **HARD BLOCK: Do NOT implement** -- ONLY create beads subtasks. NEVER edit target repo files during a /plan-project session
- **STOP after planning** -- After Step 8 confirmation, end session. NEVER start executing subtasks in the same session
- **MANDATORY: Always create beads subtasks** -- Every /plan-project invocation MUST produce subtasks under a task. Never output a plan to chat only
