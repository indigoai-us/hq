---
description: Plan a project and generate PRD for execution
allowed-tools: Task, Read, Glob, Grep, Write, Bash, AskUserQuestion
argument-hint: [project/feature description]
visibility: public
---

# /prd - Project Planning & PRD Generation

Create execution-ready PRDs with full HQ context awareness.

**User's input:** $ARGUMENTS

**Important:** Do NOT implement. Just create the PRD.

## Step 1: Get Project Description

If $ARGUMENTS provided, use as starting point.
If empty, ask: "Describe what you want to build or accomplish."

## Step 2: Scan HQ Context

Before asking questions, explore HQ:

**Companies & Context:**
- Read `agents.md` (roles, priorities)
- Glob `companies/*/knowledge/` (which companies exist)

**Workers:**
- Read `workers/registry.yaml`
- Glob `workers/*/worker.yaml`, `workers/public/dev-team/*/worker.yaml`

**Existing Projects:**
- `ls projects/`
- Glob `projects/*/prd.json` (check overlap)

**Knowledge (use qmd, not Grep):**
- `qmd vsearch "<description keywords>" --json -n 10` — semantic search for related knowledge, prior work, workers

Present:
```
Scanned HQ:
- Workers: {relevant list}
- Existing projects: {list or "none matching"}
- Relevant knowledge: {if any}
- Category: [company-specific | cross-company | personal | HQ infrastructure]
```

## Step 3: Get + Validate Project Name

Ask for project slug (or infer from description). Then:
1. Check if `projects/{name}/` exists
   - If exists: "Project exists. Continue editing or choose different name?"
2. Validate slug format (lowercase, hyphens only)

## Step 4: Discovery Interview

Ask questions in batches. Users respond: "1A, 2C"

**Batch 1: Problem & Success**
1. Core problem or goal?
2. What does success look like? (measurable)
3. Who benefits?

**Batch 2: Scope & Constraints**
4. What's in scope for MVP?
5. Hard constraints (time, tech, budget)?
6. Dependencies on other projects?

**Batch 3: Integration & Quality**
7. Quality gates? (detect repo from scan, suggest commands)
   A. `pnpm typecheck && pnpm lint`
   B. `npm run typecheck && npm run lint`
   C. None (no automated checks)
   D. Other: [specify]
8. Based on scan: "Should this use {relevant workers}?"
9. Does this need a new worker or skill?
10. Repo path? (e.g. `repos/private/{name}`, or "none" if non-code)
11. Branch name? (default: `feature/{project-name}`)
12. Base branch? (default: `main`, or `staging` for indigo-nx, etc.) — Pure Ralph creates feature branch from this

**Batch 4: E2E Testing (REQUIRED)**
For each user story, you MUST specify E2E tests. Prompt for these as you create each story:

13. What E2E tests should verify this story works? (minimum 1 per story)
    - For UI: "Page loads", "User can complete [action]", "Form shows validation errors"
    - For API: "Endpoint returns expected response", "Error cases handled"
    - For CLI: "Command runs successfully", "Opens correct URL"
    - For integration: "Full flow from [A] to [B] works"

Examples of good E2E tests:
- "Registration page loads and displays form"
- "Submitting valid form creates user and shows success"
- "Invalid email input shows validation error"
- "GET /api/users returns 200 with user list"

Do NOT accept empty e2eTests arrays. Every story must have at least one testable E2E criterion.

## Step 5: Generate PRD

Create `projects/{name}/` folder with two files.

### Primary: projects/{name}/prd.json

This is the **source of truth**. `/run-project` and `/execute-task` consume this file.

**Schema Reference:** [knowledge/hq-core/prd-schema.md](../knowledge/hq-core/prd-schema.md)

```json
{
  "name": "{project-slug}",
  "description": "{1-sentence goal}",
  "branchName": "feature/{name}",
  "userStories": [
    {
      "id": "US-001",
      "title": "{Story title}",
      "description": "{As a [user], I want [feature] so that [benefit]}",
      "acceptanceCriteria": ["{Specific verifiable criterion}"],
      "e2eTests": ["{E2E test description}"],
      "priority": 1,
      "passes": false,
      "labels": [],
      "dependsOn": [],
      "notes": ""
    }
  ],
  "metadata": {
    "createdAt": "{ISO8601}",
    "goal": "{Overall project goal}",
    "successCriteria": "{Measurable outcome}",
    "qualityGates": ["{commands from Batch 3}"],
    "repoPath": "{repos/private/repo-name or empty}",
    "baseBranch": "{main or staging or master}",
    "relatedWorkers": ["{worker-ids from scan}"],
    "knowledge": ["{relevant knowledge paths}"]
  }
}
```

### Derived: projects/{name}/README.md

Generate FROM the prd.json data. Human-friendly view.

```markdown
# {name from prd.json}

**Goal:** {metadata.goal}
**Success:** {metadata.successCriteria}
**Repo:** {metadata.repoPath}
**Branch:** {branchName}

## Overview
{description}

## Quality Gates
- `{metadata.qualityGates[0]}`

## User Stories

### US-001: {title}
**Description:** {description}
**Priority:** {priority}
**Depends on:** {dependsOn or "None"}

**Acceptance Criteria:**
- [ ] {criterion 1}
- [ ] {criterion 2}

**E2E Tests:**
- [ ] {e2eTest 1}
- [ ] {e2eTest 2}

## Non-Goals
{What's out of scope}

## Technical Considerations
{Constraints, dependencies}

## Open Questions
{Remaining questions}
```

## Step 6: Register with Orchestrator

Read `workspace/orchestrator/state.json`. Append to `projects` array:

```json
{
  "name": "{name}",
  "state": "READY",
  "prdPath": "projects/{name}/prd.json",
  "updatedAt": "{ISO8601}",
  "storiesComplete": 0,
  "storiesTotal": "{N}",
  "checkedOutFiles": []
}
```

If project already exists in state.json, update it instead of duplicating.

## Step 7: Sync to Beads

```bash
npx tsx scripts/prd-to-beads.ts --project={name}
```

Silent — just log success/failure.

## Step 8: Execution Choice

Based on complexity, recommend execution path:

**>3 stories OR dependencies OR multi-file:** recommend `/run-project`
**1-3 simple stories:** recommend in-process or `/execute-task`

Tell user:
```
Project **{name}** created with {N} user stories.

Files:
  projects/{name}/prd.json   (source of truth)
  projects/{name}/README.md  (human-readable)

Recommended execution:
1. /run-project {name}  (orchestrator loop, crash recovery)
2. /execute-task {name}/US-001  (run stories one at a time)
3. Execute now (in this session, simple projects only)
```

## Story Guidelines

- Each story completable in one AI session
- Acceptance criteria must be verifiable (not "works correctly")
- Order: schema → backend → UI → integration
- Keep stories atomic (one deliverable each)
- Every story starts with `passes: false`

## Testing Requirements (MANDATORY)

**Every user story MUST include testing acceptance criteria.**

### For Web/UI Stories

Include criteria like:
- "E2E test exists that opens the page and verifies content renders"
- "Playwright test clicks through the user flow successfully"
- "Page does not show blank/error state when loaded"

### For API Stories

Include criteria like:
- "Integration test verifies endpoint returns expected response"
- "Test covers error cases (401, 404, 500)"

### For CLI Stories

Include criteria like:
- "E2E test runs the CLI binary and captures output"
- "Test opens any URLs the CLI generates in Playwright and verifies they work"
- "Full flow test: CLI → browser → callback → CLI success"

### For Integration Stories

Include criteria like:
- "E2E test covers the complete user flow end-to-end"
- "Test verifies all components work together (not just in isolation)"

### Acceptance Criteria Format

Good (testable):
```
- [ ] GET /api/users returns 200 with user list
- [ ] E2E test: page loads and shows "Welcome" heading
- [ ] CLI outputs "Success" when operation completes
- [ ] Playwright test clicks login button and verifies redirect
```

Bad (not testable):
```
- [ ] Works correctly
- [ ] User can log in
- [ ] Page looks good
- [ ] API is fast
```

## Rules

- Scan HQ first, ask questions second
- Batch questions (don't overwhelm)
- **prd.json is the source of truth** — README.md is derived from it, never the reverse
- **All stories start with `passes: false`** — `/run-project` marks them true
- **Do NOT use EnterPlanMode** — this skill IS planning
- **Do NOT use TodoWrite** — PRD stories track tasks
- **Do NOT implement** — just create the PRD
- **Every story MUST have testable acceptance criteria** — "works correctly" is not acceptable
- **Include testing stories** — At least one story should be dedicated to E2E test infrastructure
