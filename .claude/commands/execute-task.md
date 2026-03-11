---
description: Execute a single task through coordinated skill phases
allowed-tools: Task, Read, Write, Edit, Glob, Grep, Bash
argument-hint: [task-id]
visibility: public
---

# /execute-task - Skill-Chain Task Execution

Execute a single beads task through coordinated skill phases. Each skill handles its domain, passes structured handoff context to the next.

**Arguments:** $ARGUMENTS

## Core Principle

"Pick a task, complete it, commit it."

- Fresh context per skill phase
- Sub-agents do heavy lifting
- Back pressure keeps code on rails
- Handoffs preserve context between skills
- Skill chains replace worker pipelines

## Process

### 1. Parse Arguments

Extract `{task-id}` from arguments.

If no arguments:
```
Usage: /execute-task {task-id}

Example: /execute-task ghq-abc123
```

### 2. Load Task Spec

Resolve the company from the task ID's epic prefix (e.g. `ghq-uik` → launch-grid, `ghq-53s` → production-house). Map via `companies/manifest.yaml` epic field. Then `cd companies/{slug}` so all `bd` commands use the correct per-company database.

Fetch the task from beads:

```bash
cd companies/{slug}
bd show {task-id} --json
```

Parse the JSON output:

```javascript
const task = JSON.parse(bdOutput)

if (!task || task.status === "closed") {
  STOP: `Task ${taskId} not found or already closed.`
}
```

Extract:
- `id`, `title`, `description`
- `metadata.acceptanceCriteria` (from metadata JSON)
- `metadata.e2eTests` (from metadata JSON)

Mark the task as in-progress:

```bash
bd update {task-id} --status in_progress
```

Check dependencies:
```bash
bd dep list {task-id} --json
```

If any dependency is still open:
```
Blocked: {task-id} depends on open tasks: {list}
```

Load parent task metadata for quality gates and repo path:

```bash
# Get parent ID from task data (parent field)
bd show {parent-id} --json
```

Extract from parent metadata:
- `qualityGates` -- commands to run after each skill
- `repoPath` -- target repository path
- `relatedSkills` -- skill IDs from registry

### 3. Classify Task Type

Analyze task title, description, and acceptance criteria. Match against patterns:

| Type | Indicators |
|------|------------|
| `schema` | database, migration, schema, table, column, SQL, Prisma |
| `api` | endpoint, API, REST, GraphQL, route, service, server |
| `ui` | component, page, form, button, React, UI, responsive, CSS |
| `full-stack` | Combination of backend + frontend indicators |
| `content` | docs, README, copy, content, marketing |
| `enhancement` | animation, polish, refactor, optimization, bug fix, UX |

Report classification:
```
Task: {task.id} - {task.title}
Type: {type} (matched: {indicators})
```

### 4. Resolve Skill Chain

Based on classified type, resolve the skill chain from composition skills or build one directly:

**Step 4a: Map type to skill**

| Type | Primary Skill |
|------|--------------|
| `full-stack` | `.claude/skills/full-stack/SKILL.md` |
| `schema` | `.claude/skills/database/SKILL.md` |
| `api` | `.claude/skills/backend/SKILL.md` |
| `ui` | `.claude/skills/frontend/SKILL.md` |
| `enhancement` | `.claude/skills/enhancement/SKILL.md` |
| `content` | Direct execution (no skill chain) |

**Step 4b: Resolve depends_on chain**

For composition skills (full-stack, enhancement), read `SKILL.md` and parse the `## Skill Chain` table:

```markdown
## Skill Chain
| Order | Skill | Condition |
|-------|-------|-----------|
| 1 | architect | always |
| 2 | database | task involves schema changes or migrations |
| 3 | backend | task involves API or server-side logic |
| 4 | frontend | task involves UI or client-side code |
| 5 | code-reviewer | always |
| 6 | qa | always |
```

Evaluate each `when` condition against the task description:
- `always` -> include
- Conditional string -> match against task description/acceptance criteria keywords
- Exclude skills whose conditions do not match

**Step 4c: For non-composition execution skills (schema, api, ui)**

Build a default chain:
```
[target-skill] -> code-reviewer -> qa
```

For `content` type (no chain):
```
Direct execution -- no skill chain needed.
```

**Step 4d: Load each skill's SKILL.md**

For each skill in the resolved chain:
```
Read .claude/skills/{skill-id}/SKILL.md
```

Extract: frontmatter (`name`, `description`) and markdown body (instructions)

Present the execution plan:
```
Execution Plan for {task.id}:

Phase 1: architect   -> Design solution and define contracts
Phase 2: backend     -> Implement API / server logic
Phase 3: frontend    -> Implement UI / client-side code
Phase 4: code-reviewer -> Review all changes
Phase 5: qa          -> Run tests, validate behavior

Proceed? [Y/n]
```

### 5. Initialize Execution State

Append to `loops/state.jsonl`:

```jsonl
{"ts":"{ISO8601}","type":"skill_start","story_id":"{task.id}","skill_id":"{first-skill}","data":{}}
```

### 5.5 Load Applicable Policies

Load policies from available directories:

1. **Repo policies**: Check `knowledge/policies/` in the target repo
2. **GHQ policies**: Check `knowledge/policies/` in GHQ root
3. **Company policies**: If company context is set, check `companies/{co}/policies/`

Include applicable policy rules in skill prompts under `### Applicable Policies`.

### 6. Execute Each Phase

For each skill in the resolved chain:

#### 6a. Load Skill Config

Read `.claude/skills/{skill-id}/SKILL.md`:
- Frontmatter -- Skill's name and description
- Markdown body -- Skill's instructions, role, and process

#### 6b. Build Skill Prompt

```markdown
## You are executing skill: {skill.name}
## Task: {task.id} - {task.title}

### Description
{task.description}

### Acceptance Criteria
{task.metadata.acceptanceCriteria as checklist}

### Context from Previous Phase
{handoff_context from previous skill, if any}

### Applicable Policies
{policies loaded in step 5.5, if any}

### Your Instructions
{instructions from SKILL.md body}

### Back Pressure (Run Before Completing)
After completing your work:
1. Run the task's test suite (if one exists)
2. Run typecheck (if TypeScript project)
3. Run linter (if configured)
4. Commit your changes with a descriptive message

### Output Requirements
When complete, provide JSON:
{
  "summary": "What you accomplished",
  "files_created": ["paths"],
  "files_modified": ["paths"],
  "key_decisions": ["decision and rationale"],
  "context_for_next": "Instructions for next skill",
  "back_pressure": {
    "tests": "pass|fail|skipped",
    "lint": "pass|fail|skipped",
    "typecheck": "pass|fail|skipped"
  },
  "issues": ["any blocking issues"],
  "discovered_work": [
    {"title": "short description", "rationale": "why this is needed", "urgency": "blocking|important|nice-to-have"}
  ]
}
```

#### 6c. Spawn Skill Sub-Agent

Use Task tool:
```
Task({
  prompt: {built prompt above},
  description: "{skill.id} for {task.id}"
})
```

#### 6d. Process Skill Output

Parse skill's JSON output.

**If back pressure failed:**

1. **Auto-recovery** (max 1 retry per phase):
   - Spawn a recovery sub-agent with the error context:
     ```
     Task({
       prompt: "Diagnose and fix back-pressure failure.
         Skill: {skill.id}
         Check: {failed_check_name}
         Error: {error_output}
         cwd: {target_repo_path}
         Fix the issue, then re-run the failing checks.",
       description: "recovery for {task.id} phase {N}"
     })
     ```
2. **Re-run back-pressure checks** after recovery
3. If passes -> mark phase completed, continue
4. If still fails -> pause and report to user

**If success:**
- Store handoff context
- Append to loops/state.jsonl: `{"ts":"...","type":"skill_complete","story_id":"{task.id}","skill_id":"{skill}","data":{...}}`
- Continue to next phase

#### 6e. Build Handoff JSON

After each phase, construct handoff for the next skill:

```json
{
  "from_skill": "architect",
  "to_skill": "backend",
  "timestamp": "ISO8601",
  "summary": "1-2 sentence description",
  "files_created": ["src/services/foo.ts"],
  "files_modified": ["src/index.ts"],
  "key_decisions": [
    "Used strategy pattern for flexibility",
    "Added caching for performance"
  ],
  "context_for_next": "Focus on implementing the API contracts defined in the architecture doc",
  "back_pressure": {
    "tests": "pass",
    "lint": "pass",
    "typecheck": "pass"
  }
}
```

### 7. Complete Task

When all phases complete:

#### 7a. Close Task in Beads

```bash
bd close {task-id}
```

#### 7b. Append Completion to State

```jsonl
{"ts":"{ISO8601}","type":"story_complete","story_id":"{task.id}","data":{"skills_run":["{list}"]}}
```

#### 7c. Capture Learnings via /learn

Run `/learn` with structured input from execution:

```json
{
  "task_id": "{task.id}",
  "source": "task-completion",
  "severity": "medium",
  "scope": "auto",
  "skills_used": ["list of skills that ran"],
  "back_pressure_failures": [{"skill": "...", "check": "...", "error": "..."}],
  "retries": 0,
  "key_decisions": ["aggregated from skill outputs"],
  "issues_encountered": ["from skill outputs"],
  "patterns_discovered": ["success patterns worth preserving"]
}
```

If task completed cleanly with no failures/retries/notable patterns, `/learn` logs the event only (no rule created).

#### 7d. Reindex

```bash
qmd update 2>/dev/null || true
```

#### 7e. Report Completion

```
Task Complete: {task.id} - {task.title}

Phases: {N} completed
Skills: {list}
Files touched: {count}

Key decisions:
- {decision 1}
- {decision 2}

Task closed in beads.
```

#### 7f. Structured Output for Orchestrator

When invoked as a sub-agent by `/run-loop`, end with this JSON so the orchestrator can parse results:

```json
{
  "task_id": "{task.id}",
  "status": "completed",
  "summary": "1-sentence summary of what was accomplished",
  "workers_used": ["{skill1}", "{skill2}"],
  "models_used": {},
  "back_pressure": {
    "tests": "pass|fail|skipped",
    "lint": "pass|fail|skipped",
    "typecheck": "pass|fail|skipped",
    "build": "pass|fail|skipped"
  },
  "discovered_work": [
    {"title": "short description", "rationale": "why needed", "urgency": "blocking|important|nice-to-have"}
  ]
}
```

### 8. Handle Failures

If any phase fails after retry:

**8.1 Auto-capture failure as learning:**

Run `/learn` with:
```json
{
  "source": "back-pressure-failure",
  "severity": "high",
  "scope": "skill:{failed-skill-id}",
  "back_pressure_failures": [{"skill": "...", "check": "...", "error": "..."}],
  "task_id": "{task.id}"
}
```

**8.2 Append to state.jsonl:** `{"ts":"...","type":"skill_error","story_id":"{task.id}","skill_id":"{skill}","data":{"error":"...","retry":true}}`

**8.3 Present options:**

```
Phase {N} ({skill}) failed: {error}

Options:
1. Fix manually and resume: /execute-task {task-id} --resume
2. Skip this skill and continue
3. Abort execution
```

**8.4 Structured failure output** (for orchestrator):

```json
{
  "task_id": "{task.id}",
  "status": "failed",
  "summary": "Phase {N} ({skill}) failed: {brief error}",
  "workers_used": ["{skills that ran}"],
  "models_used": {},
  "back_pressure": {}
}
```

## Rules

- **ONE task at a time** -- Never work on multiple tasks
- **Fresh context per skill** -- Spawn sub-agents, don't accumulate
- **Back pressure is mandatory** -- No skipping tests/lint/typecheck
- **Capture learnings** -- Every task generates a learning entry
- **Handoffs preserve context** -- Next skill knows what happened
- **Fail fast, fail loud** -- Stop on errors, don't hide them
- **Beads is the source of truth** -- task state comes from `bd show`, not files
- **Orchestrator-compatible output** -- always end with structured JSON block (step 7f)
- **Sub-agents MUST commit** -- each sub-agent commits its own work before completing
- **Do NOT use EnterPlanMode or TodoWrite** -- the task classification and skill sequencing replace ad-hoc planning. Follow the steps in order
- **Always reindex after task completion** -- `qmd update` after every completed task (step 7d)
- **Skill chains replace workers** -- resolve skill chain from SKILL.md, not worker.yaml
- **NEVER use `isolation: "worktree"` on Agent/Task tool calls** -- this creates separate git worktrees per agent, scattering commits across branches. Sub-agents must work in the same directory as the orchestrator (either main or a shared worktree managed by `/run-loop`)
