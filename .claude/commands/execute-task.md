---
description: Execute a single story through coordinated skill phases
allowed-tools: Task, Read, Write, Edit, Glob, Grep, Bash
argument-hint: [project/task-id]
visibility: public
---

# /execute-task - Skill-Chain Task Execution

Execute a single user story through coordinated skill phases. Each skill handles its domain, passes structured handoff context to the next.

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

Extract `{project}/{task-id}` from arguments.

If no arguments:
```
Usage: /execute-task {project}/{task-id}

Example: /execute-task my-app/US-003
```

### 2. Load Task Spec

Resolve project location -- search `projects/{project}/prd.json` first, then `companies/*/projects/{project}/prd.json`:

```javascript
const prdPath = glob(`projects/${project}/prd.json`)[0]
  || glob(`companies/*/projects/${project}/prd.json`)[0]
if (!prdPath || !fileExists(prdPath)) {
  STOP: `ERROR: prd.json not found for ${project}. Run /prd ${project} first.`
}

const prd = JSON.parse(read(prdPath))

// Strict: userStories required
const stories = prd.userStories
if (!stories || !Array.isArray(stories)) {
  STOP: "prd.json missing userStories array."
}

// Validate required fields
for (const story of stories) {
  const required = ['id', 'title', 'description', 'passes']
  const missing = required.filter(f => !(f in story))
  if (missing.length > 0) {
    STOP: `Story ${story.id || '?'} missing fields: ${missing.join(', ')}`
  }
}

const task = stories.find(s => s.id === taskId)
```

Extract:
- `id`, `title`, `description`
- `acceptance_criteria`
- `files` (if specified)
- `dependsOn` (check these are complete)

If task not found or already `passes: true`:
```
Task {taskId} not found or already complete.
```

If `dependsOn` references incomplete stories:
```
Blocked: {taskId} depends on incomplete stories: {list}
```

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
| `full-stack` | `.claude/skills/full-stack/skill.yaml` |
| `schema` | `.claude/skills/database/skill.yaml` |
| `api` | `.claude/skills/backend/skill.yaml` |
| `ui` | `.claude/skills/frontend/skill.yaml` |
| `enhancement` | `.claude/skills/enhancement/skill.yaml` |
| `content` | Direct execution (no skill chain) |

**Step 4b: Resolve depends_on chain**

For composition skills (full-stack, enhancement), read `skill.yaml` and resolve `depends_on`:

```yaml
# Example: full-stack/skill.yaml
depends_on:
  - skill: architect
    when: always
  - skill: database
    when: "task involves schema changes or migrations"
  - skill: backend
    when: "task involves API or server-side logic"
  - skill: frontend
    when: "task involves UI or client-side code"
  - skill: code-reviewer
    when: always
  - skill: qa
    when: always
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

**Step 4d: Load each skill's skill.yaml**

For each skill in the resolved chain:
```
Read .claude/skills/{skill-id}/skill.yaml
```

Extract: `instructions`, `context.base`, `context.dynamic`

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

Create execution tracking:

```bash
mkdir -p workspace/executions/{project}
```

Write `workspace/executions/{project}/{task-id}.json`:
```json
{
  "task_id": "{task.id}",
  "project": "{project}",
  "started_at": "{ISO8601}",
  "status": "in_progress",
  "current_phase": 1,
  "skill_chain": ["architect", "backend", "code-reviewer", "qa"],
  "phases": [
    {"skill": "architect", "status": "pending"},
    {"skill": "backend", "status": "pending"},
    {"skill": "code-reviewer", "status": "pending"},
    {"skill": "qa", "status": "pending"}
  ],
  "handoffs": []
}
```

### 5.5 Acquire File Locks

If the story has a non-empty `files` array and prd metadata has `repoPath`:

1. Read `{repoPath}/.file-locks.json` (create if missing: `{"version":1,"locks":[]}`)
2. **Stale lock cleanup**: For each existing lock, check if owner PID is running (`kill -0 {pid} 2>/dev/null`). If not running AND lock is older than 30 minutes, remove it
3. **Conflict check**: For each file in `task.files`, check if already locked by another story:
   - If conflicts found: STOP with `{"status":"blocked","blocked_by":[...]}`
4. **Acquire locks**: For each file, append:
   ```json
   {"file": "{path}", "owner": {"project": "{project}", "story": "{task.id}", "pid": {$$}}, "acquired_at": "{ISO8601}"}
   ```
5. Report: `File locks acquired: {N} files for {task.id}`

### 5.6 Load Applicable Policies

Load policies from available directories:

1. **Repo policies**: Check `.claude/policies/` in the target repo
2. **GHQ policies**: Check `.claude/policies/` in GHQ root
3. **Company policies**: If company context is set, check `companies/{co}/policies/`

Include applicable policy rules in skill prompts under `### Applicable Policies`.

### 6. Execute Each Phase

For each skill in the resolved chain:

#### 6a. Load Skill Config

Read `.claude/skills/{skill-id}/skill.yaml`:
- `instructions` -- Skill's role and process
- `context.base` -- Files skill always needs
- `context.dynamic` -- Files loaded conditionally

#### 6b. Build Skill Prompt

```markdown
## You are executing skill: {skill.name}
## Task: {task.id} - {task.title}

### Description
{task.description}

### Acceptance Criteria
{task.acceptance_criteria as checklist}

### Files to Focus On
{task.files or inferred from description}

### Context from Previous Phase
{handoff_context from previous skill, if any}

### Applicable Policies
{policies loaded in step 5.6, if any}

### Your Instructions
{skill.instructions from skill.yaml}

### Back Pressure (Run Before Completing)
After completing your work:
1. Run the project's test suite (if one exists)
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
  "issues": ["any blocking issues"]
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
- Update execution state
- Continue to next phase

#### 6d.5 Expand File Locks (Dynamic)

If file locking is enabled and skill output contains `files_created` or `files_modified`:
1. Compute new files not already locked for this story
2. Acquire locks for them (same as step 5.5)
3. Update story's `files` array in prd.json with new paths

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

#### 6f. Update Execution State

After each phase:
```json
{
  "phases": [
    {"skill": "architect", "status": "completed", "completed_at": "..."},
    {"skill": "backend", "status": "in_progress"},
    ...
  ],
  "handoffs": [
    {
      "from_skill": "architect",
      "to_skill": "backend",
      "context": {...skill output...}
    }
  ]
}
```

### 7. Complete Task

When all phases complete:

#### 7.0 Release File Locks

If file locking was active:
1. Read `{repoPath}/.file-locks.json`
2. Remove all entries where `owner.project === "{project}" && owner.story === "{task.id}"`
3. Write updated `.file-locks.json`

This runs BEFORE PRD update so locks are released even if later steps fail.

#### 7a. Update PRD

```javascript
task.passes = true
// Write updated prd.json
```

#### 7b. Capture Learnings via /learn

Run `/learn` with structured input from execution:

```json
{
  "task_id": "{task.id}",
  "project": "{project}",
  "source": "task-completion",
  "severity": "medium",
  "scope": "auto",
  "skills_used": ["list of skills that ran"],
  "back_pressure_failures": [{"skill": "...", "check": "...", "error": "..."}],
  "retries": N,
  "key_decisions": ["aggregated from skill outputs"],
  "issues_encountered": ["from skill outputs"],
  "patterns_discovered": ["success patterns worth preserving"]
}
```

If task completed cleanly with no failures/retries/notable patterns, `/learn` logs the event only (no rule created).

#### 7c. Reindex

```bash
qmd update 2>/dev/null || true
```

#### 7d. Report Completion

```
Task Complete: {task.id} - {task.title}

Phases: {N} completed
Skills: {list}
Files touched: {count}

Key decisions:
- {decision 1}
- {decision 2}

PRD updated: passes: true
```

#### 7e. Structured Output for Orchestrator

When invoked as a sub-agent by `/run-project`, end with this JSON so the orchestrator can parse results:

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
  }
}
```

### 8. Handle Failures

If any phase fails after retry:

**8.0 Release file locks** -- same as step 7.0. Never orphan locks on failure.

**8.1 Auto-capture failure as learning:**

Run `/learn` with:
```json
{
  "source": "back-pressure-failure",
  "severity": "high",
  "scope": "skill:{failed-skill-id}",
  "back_pressure_failures": [{"skill": "...", "check": "...", "error": "..."}],
  "task_id": "{task.id}",
  "project": "{project}"
}
```

**8.2 Update execution state:** `status: "paused"`

**8.3 Present options:**

```
Phase {N} ({skill}) failed: {error}

Options:
1. Fix manually and resume: /execute-task {project}/{task-id} --resume
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
- **prd.json is required** -- never read or fall back to README.md
- **Validate prd.json on load** -- fail loudly on missing/malformed fields
- **Orchestrator-compatible output** -- always end with structured JSON block (step 7e)
- **Sub-agents MUST commit** -- each sub-agent commits its own work before completing
- **Never rewrite the PRD** -- sub-agents may only update the current story's `passes`, `notes`, and fields. Never restructure, rename, add, or remove stories
- **Do NOT use EnterPlanMode or TodoWrite** -- the PRD, task classification, and skill sequencing replace ad-hoc planning. Follow the steps in order
- **Always reindex after task completion** -- `qmd update` after every completed task (step 7c)
- **Skill chains replace workers** -- resolve depends_on from skill.yaml, not worker.yaml
