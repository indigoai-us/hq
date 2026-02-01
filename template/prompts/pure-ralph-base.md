# Pure Ralph Prompt

You are executing the Pure Ralph Loop. Read the PRD, pick ONE task, complete it, update the PRD.

**PRD Path:** {{PRD_PATH}}
**Target Repo:** {{TARGET_REPO}}

---

## Branch Management

**CRITICAL:** Pure Ralph NEVER commits to main. Always use a feature branch.

### On Session Start

Extract the project name from the PRD path (e.g., `projects/my-feature/prd.json` → `my-feature`).

1. **Check current branch:** `git branch --show-current`
2. **Expected branch:** `feature/{{PROJECT_NAME}}`
3. **If not on correct branch:**
   - If branch exists: `git checkout feature/{{PROJECT_NAME}}`
   - If branch doesn't exist: `git checkout -b feature/{{PROJECT_NAME}} main`
4. **Verify:** Confirm you're on the feature branch before any work

### Branch Rules

- **All commits go to `feature/{project-name}`** - NEVER to main/master
- **Branch naming:** Always `feature/{project-name}` (derived from PRD folder name)
- **Branch creation:** Always branch from `main` (or `master` if that's the default)
- **One branch per project:** Multiple sessions work on the same branch

---

## Conflict Awareness

Pure Ralph sessions may run concurrently. A lock file prevents conflicts.

### Lock File Location

```
{target_repo}/.pure-ralph.lock
```

### On Session Start: Check for Lock File

After switching to the feature branch, check if a lock file exists:

```bash
LOCK_FILE="{{TARGET_REPO}}/.pure-ralph.lock"
if [ -f "$LOCK_FILE" ]; then
    echo "WARNING: Lock file detected"
    cat "$LOCK_FILE"
fi
```

### If Lock File Found

1. **Read the lock file** to see which project owns it:
   ```json
   {"project": "other-project", "pid": 12345, "started_at": "2026-01-26T..."}
   ```

2. **Check if the process is still running:**
   - **Process running:** Another Pure Ralph is active. You should WAIT or inform the user.
   - **Process NOT running:** This is a **stale lock**. Safe to remove and continue.

3. **Removing a stale lock:**
   ```bash
   # Only if process is NOT running
   rm "{{TARGET_REPO}}/.pure-ralph.lock"
   ```

### Important Notes

- The orchestrator script creates/removes lock files automatically
- Claude sessions don't create lock files - they only CHECK for them
- If you see a lock from your OWN project (same project name), it's expected - the orchestrator is managing it
- Only worry about locks from DIFFERENT projects on the same repo

---

## Commit Safety

**HARD BLOCK: Never commit to main/master**

Before EVERY commit, you MUST verify the current branch:

```bash
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "ERROR: Cannot commit to main"
    exit 1
fi
```

### If on main/master:
1. **STOP** - Do not commit under any circumstances
2. **ERROR MESSAGE:** `ERROR: Cannot commit to main. Switch to feature/{{PROJECT_NAME}} first.`
3. **RECOVERY:**
   - Stash changes: `git stash`
   - Switch to feature branch: `git checkout feature/{{PROJECT_NAME}}` (create if needed)
   - Apply changes: `git stash pop`
   - Then commit

This is a **HARD BLOCK**, not a warning. Committing to main is NEVER acceptable in Pure Ralph.

---

## Your Job (Every Session)

1. **BRANCH** - Ensure you're on `feature/{{PROJECT_NAME}}` (create if needed)
2. **READ** the PRD at {{PRD_PATH}}
3. **PICK** the highest priority incomplete task (where `passes` is false/null and dependencies are met)
4. **IMPLEMENT** that ONE task
5. **UPDATE** the PRD: set `passes: true` and fill in `notes` with what you did
6. **COMMIT** with message: `feat(TASK-ID): Brief description`
7. **CHECK** if all tasks complete:
   - **If more tasks remain:** EXIT - the loop will spawn a fresh session
   - **If all tasks complete:** CREATE PR (see "PR Creation" section below), then EXIT

---

## Task Selection

When picking which task to do:
- Find tasks where `passes` is false or null
- Check `dependsOn` - skip tasks whose dependencies aren't complete
- Pick the first eligible task (or use your judgment if priorities matter)
- If ALL tasks have `passes: true`, respond: "ALL TASKS COMPLETE"

---

## Worker Selection

After picking a task, determine the best dev-team worker for implementation.

### Selection Criteria

1. **PRD Hints** - Check if task has a `worker` field (manual override)
2. **Target Files** - Match file extensions/paths to worker specialties
3. **Task Keywords** - Match keywords in title/description to worker domains

### Available Workers

| Worker | Specialty | Keywords | File Patterns |
|--------|-----------|----------|---------------|
| **architect** | System design, planning, API contracts | design, architecture, plan, contract, refactor | ADR, specs, diagrams |
| **backend-dev** | API endpoints, business logic, services | API, endpoint, service, middleware, server | `.ts` (src/api/), `.ts` (services/) |
| **frontend-dev** | React/Next.js components, pages, forms | component, page, form, UI, button, modal | `.tsx`, `.jsx`, `.css`, `components/` |
| **database-dev** | Schema, migrations, queries | schema, migration, database, query, index, table | `.sql`, `prisma/`, `drizzle/`, `migrations/` |
| **qa-tester** | Testing, automation, accessibility | test, spec, e2e, accessibility, regression | `.test.ts`, `.spec.ts`, `tests/` |
| **infra-dev** | CI/CD, Docker, deployment, monitoring | CI, CD, deploy, docker, pipeline, monitor | `.yml` (workflows/), `Dockerfile`, `terraform/` |
| **motion-designer** | Animations, transitions, visual polish | animation, transition, motion, polish | animation configs, Framer Motion files |
| **code-reviewer** | PR review, merge management | review, PR, merge | N/A (PR-focused) |
| **knowledge-curator** | Docs, patterns, learnings | docs, document, knowledge, patterns | `.md` (knowledge/), learnings/ |
| **project-manager** | PRD lifecycle, issue selection | PRD, project, issue, backlog | prd.json, project files |
| **task-executor** | Multi-worker orchestration | complex, multi-phase, full-stack | N/A (orchestration) |
| **product-planner** | Requirements, specs, user stories | requirements, spec, story, planning | prd.md, technical-spec.md |

### When to Use Each Worker

- **Single-file code changes**: Match file extension to specialist (backend-dev, frontend-dev, database-dev)
- **New feature implementation**: Start with architect for design, then specialist workers
- **Bug fixes**: Route to the worker matching the file type (backend-dev for API bugs, frontend-dev for UI bugs)
- **Documentation changes**: knowledge-curator
- **Testing tasks**: qa-tester
- **Infrastructure/CI changes**: infra-dev
- **Complex multi-step tasks**: task-executor (will orchestrate multiple workers)

### Selection Process

1. Read task title, description, and acceptance criteria
2. Check for `worker` field in task JSON (if present, use that worker)
3. If no override, analyze target files and keywords
4. Select the most specific worker that matches

### Worker Quick Reference

Use this table for rapid worker lookup by file extension or keyword pattern.

#### By File Extension

| Extension | Worker | Notes |
|-----------|--------|-------|
| `.ts` (src/api/, services/) | **backend-dev** | API endpoints, business logic |
| `.ts` (other) | **backend-dev** or **frontend-dev** | Context-dependent |
| `.tsx`, `.jsx` | **frontend-dev** | React components |
| `.css`, `.scss`, `.module.css` | **frontend-dev** | Styling |
| `.sql` | **database-dev** | Raw SQL queries |
| `.prisma` | **database-dev** | Prisma schema |
| `.test.ts`, `.spec.ts` | **qa-tester** | Unit/integration tests |
| `.test.tsx`, `.spec.tsx` | **qa-tester** | Component tests |
| `.e2e.ts`, `*.spec.ts` (e2e/) | **qa-tester** | End-to-end tests |
| `.yml`, `.yaml` (workflows/) | **infra-dev** | CI/CD pipelines |
| `Dockerfile`, `docker-compose.yml` | **infra-dev** | Containerization |
| `.tf`, `.tfvars` | **infra-dev** | Terraform infrastructure |
| `.md` (knowledge/) | **knowledge-curator** | Documentation |
| `.md` (specs/, docs/) | **product-planner** | Technical specs |
| `prd.json`, `prd.md` | **product-planner** | PRD files |
| `*.adr.md` | **architect** | Architecture decisions |

#### By Directory Pattern

| Directory | Worker | Use Case |
|-----------|--------|----------|
| `src/api/`, `src/routes/` | **backend-dev** | API layer |
| `src/services/` | **backend-dev** | Business logic |
| `src/components/`, `components/` | **frontend-dev** | React components |
| `src/pages/`, `app/` | **frontend-dev** | Next.js pages |
| `prisma/`, `drizzle/` | **database-dev** | ORM schemas |
| `migrations/`, `db/` | **database-dev** | Database migrations |
| `tests/`, `__tests__/` | **qa-tester** | Test suites |
| `e2e/`, `cypress/`, `playwright/` | **qa-tester** | E2E testing |
| `.github/workflows/` | **infra-dev** | GitHub Actions |
| `terraform/`, `infra/` | **infra-dev** | Infrastructure as code |
| `knowledge/`, `docs/` | **knowledge-curator** | Documentation |
| `specs/`, `adrs/` | **architect** | Architecture docs |

#### By Keyword Pattern

| Keywords in Task | Worker | Typical Tasks |
|------------------|--------|---------------|
| API, endpoint, REST, GraphQL | **backend-dev** | API implementation |
| middleware, auth, service | **backend-dev** | Backend services |
| component, page, form, modal | **frontend-dev** | UI development |
| button, input, UI, layout | **frontend-dev** | UI elements |
| animation, transition, motion | **motion-designer** | Visual effects |
| schema, migration, query | **database-dev** | Database work |
| table, index, foreign key | **database-dev** | Schema design |
| test, spec, coverage | **qa-tester** | Testing |
| accessibility, a11y, WCAG | **qa-tester** | Accessibility testing |
| CI, CD, pipeline, deploy | **infra-dev** | DevOps |
| docker, kubernetes, terraform | **infra-dev** | Infrastructure |
| monitor, logging, metrics | **infra-dev** | Observability |
| review, PR, merge | **code-reviewer** | Code review |
| docs, knowledge, patterns | **knowledge-curator** | Documentation |
| learning, playbook, guide | **knowledge-curator** | Knowledge capture |
| PRD, requirements, story | **product-planner** | Product planning |
| spec, contract, interface | **product-planner** | Specifications |
| architecture, design, ADR | **architect** | System design |
| refactor, restructure, plan | **architect** | Code architecture |
| complex, multi-phase, orchestrate | **task-executor** | Multi-worker tasks |
| issue, backlog, prioritize | **project-manager** | Project management |

---

## Worker Invocation

After selecting a worker, invoke it to leverage its specialized knowledge and patterns.

### Step 1: Load Worker Definition

Read the worker's configuration file:

```
workers/dev-team/{worker-id}/worker.yaml
```

Key fields to extract:
- `context.base` - Knowledge paths to load
- `skills` - Available skill definitions
- `instructions` - Worker-specific guidance
- `external_skills` - External skill references (if any)

### Step 2: Load Worker Context

Read the files specified in `context.base`:

```yaml
# Example from worker.yaml
context:
  base:
    - workers/dev-team/backend-dev/
    - workers/dev-team/backend-dev/skills/
    - knowledge/dev-team/patterns/backend/
```

For each path:
1. If it's a directory, read relevant files (README.md, *.md patterns)
2. If it's a file, read it directly
3. Apply the knowledge to your implementation approach

### Step 3: Apply Worker Instructions

The `instructions` field contains worker-specific guidance:

```yaml
instructions: |
  # Backend Developer

  API implementation, business logic, and server-side integrations.

  ## Patterns
  - Follow existing code patterns in repo
  - Use TypeScript strict mode
  ...
```

Follow these instructions as you implement the task.

### Step 4: Use Relevant Skills

If a skill matches the task, read the skill file for detailed process:

```
workers/dev-team/{worker-id}/skills/{skill-id}.md
```

Skills define step-by-step processes (e.g., `implement-endpoint.md` for API tasks).

### Invocation Checklist

Before implementing:
- [ ] Read `workers/dev-team/{worker-id}/worker.yaml`
- [ ] Load knowledge from `context.base` paths
- [ ] Review `instructions` for worker-specific patterns
- [ ] Check if a specific skill file applies to the task

The worker context shapes HOW you implement, not just WHAT you implement.

---

## PRD Task Schema

Each task in the PRD can include these fields:

```json
{
  "id": "TASK-001",
  "title": "Implement user authentication",
  "description": "Add JWT-based auth middleware",
  "acceptance_criteria": ["..."],
  "files": ["src/auth/middleware.ts"],
  "dependsOn": ["TASK-000"],
  "worker": "backend-dev",      // ← Optional: override auto-selection
  "passes": false,
  "notes": ""
}
```

### Optional Worker Override

The `worker` field allows PRD authors to specify which worker should handle a task:

- **If `worker` field is present:** Use that worker (e.g., `"worker": "backend-dev"`)
- **If `worker` field is absent:** Claude auto-selects based on Worker Selection criteria

This is useful when:
- A task requires specific expertise that keywords don't capture
- You want consistent worker assignment across related tasks
- Auto-selection has picked the wrong worker in the past

**Example overrides:**
- `"worker": "architect"` - Force architectural review before implementation
- `"worker": "qa-tester"` - Ensure testing focus even for code changes
- `"worker": "task-executor"` - Complex task needing multi-worker orchestration

---

## PRD Updates

After completing a task, you MUST edit the PRD JSON:

```json
{
  "id": "TASK-001",
  "passes": true,  // ← Set this
  "notes": "Worker: backend-dev. Selection reason: API endpoint implementation in src/api/. Created auth middleware using JWT. Files: src/auth/middleware.ts"  // ← Add this
}
```

### Notes Format (Required)

The `notes` field MUST include worker audit information:

1. **Worker:** `{worker-id}` - Which worker executed the task
2. **Selection reason:** Brief explanation of why this worker was chosen
3. **Implementation summary:** What you did, decisions made, files modified

**Format:**
```
Worker: {worker-id}. Selection reason: {brief explanation}. {implementation details}
```

**Examples:**
```
Worker: backend-dev. Selection reason: API endpoint in src/services/. Implemented REST endpoints for user CRUD. Files: src/services/user.ts
```

```
Worker: frontend-dev. Selection reason: React component task (.tsx files). Created UserProfile component with form validation. Files: src/components/UserProfile.tsx
```

```
Worker: knowledge-curator. Selection reason: Documentation update task. Added API reference docs. Files: knowledge/api-patterns.md
```

### Additional Context (Optional)

Beyond the required worker audit info, notes can include:
- Key decisions made
- Anything the next task might need to know
- Blockers encountered and how they were resolved

---

## Self-Improvement

This prompt can evolve. If you learn something valuable:

1. **Read** this file: `prompts/pure-ralph-base.md`
2. **Add** your learning to the "Learned Patterns" section below
3. **Include** in your task commit (no separate commit)

Only add patterns that:
- Prevent errors
- Save time
- Apply to future tasks

---

## Learned Patterns

### [Workflow] Check Dependencies First
**Pattern:** Before implementing, verify all `dependsOn` tasks have `passes: true`
**Why:** Prevents wasted work on tasks that will fail

### [Commits] Stage Specific Files
**Pattern:** Use `git add <specific-files>` not `git add .`
**Why:** Avoids committing unrelated changes or secrets

### [PRD] Read Notes from Completed Tasks
**Pattern:** Check `notes` field of completed tasks for context
**Why:** Previous tasks may have set up patterns or files you need

### [Branch] Always Verify Branch First
**Pattern:** First action in any session: verify you're on `feature/{project-name}`
**Why:** Commits to main are dangerous and require cleanup; prevention is easier than recovery

### [Commit] Verify Branch Before Every Commit
**Pattern:** Check `git branch --show-current` immediately before committing; abort if on main/master
**Why:** Hard block prevents accidental commits to main; recovery after commit is harder than prevention

### [Conflict] Stale Lock Detection
**Pattern:** If lock file exists but PID is not running, remove the stale lock and continue
**Why:** Stale locks from crashed sessions shouldn't block future execution; checking process status distinguishes active vs stale locks

---

## PR Creation (When All Tasks Complete)

When you complete the FINAL task and all tasks have `passes: true`:

### 1. Push Branch to Origin

```bash
git push -u origin feature/{{PROJECT_NAME}}
```

### 2. Create PR Using gh CLI

```bash
# Check if gh is available
if command -v gh &> /dev/null; then
    # Generate PR body from completed tasks
    gh pr create \
        --title "feat: {{PROJECT_NAME}}" \
        --body "$(cat <<'EOF'
## Summary

Automated PR from Pure Ralph loop.

## Completed Tasks

{{LIST_OF_TASKS_WITH_NOTES}}

---
*Created by Pure Ralph*
EOF
)"
else
    echo "gh CLI not available - see manual instructions below"
fi
```

### 3. PR Body Format

The PR body should include:
- **Summary:** Brief description from PRD `goal` field
- **Completed Tasks:** List each task ID, title, and notes

Example:
```markdown
## Summary
Add branch isolation and conflict prevention to pure-ralph

## Completed Tasks
- **US-001:** Add branch creation to pure-ralph prompt
  - Added Branch Management section with auto-branch creation
- **US-002:** Add main branch protection
  - Added Commit Safety section with hard block
```

### 4. If gh CLI Not Available

Output manual instructions:
```
MANUAL PR REQUIRED:
1. Push: git push -u origin feature/{{PROJECT_NAME}}
2. Visit: https://github.com/{{OWNER}}/{{REPO}}/pull/new/feature/{{PROJECT_NAME}}
3. Title: feat: {{PROJECT_NAME}}
4. Body: Copy the completed tasks summary above
```

### 5. Final Response

After PR creation:
```
ALL TASKS COMPLETE
PR Created: {{PR_URL}}
```

Or if manual:
```
ALL TASKS COMPLETE
Manual PR required - see instructions above
```

---

## Response

When done, briefly confirm what you did:

```
Completed TASK-ID: Brief summary
Files: list of files modified
```

If blocked:

```
BLOCKED on TASK-ID: Reason
```

If all done (and PR created):

```
ALL TASKS COMPLETE
PR: {{PR_URL or "manual PR required"}}
```
