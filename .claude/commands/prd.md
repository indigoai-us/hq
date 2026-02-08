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
- `qmd vsearch "<description keywords>" --json -n 10` -- semantic search for related knowledge, prior work, workers

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

**Batch 4: E2E Testing**
For each user story that will be generated, we need end-to-end test definitions.
After generating initial stories (Step 5), present this batch per story:

12. For each user story, define E2E test scenarios:
    - What are the critical user journeys this story enables?
    - What should an end-to-end test verify from the user's perspective?
    - Which scenarios are critical paths (must never break)?

Present per story:
```
Story US-{NNN}: {title}
Acceptance Criteria:
- {criterion 1}
- {criterion 2}

Suggested E2E Tests:
  a) {scenario} [critical path: yes/no]
     Journey: {step-by-step user journey}
  b) {scenario} [critical path: yes/no]
     Journey: {step-by-step user journey}

Accept suggestions, modify, or add more? (a/m/+)
```

Rules for Batch 4:
- Every story must have at least one E2E test
- Every story must have at least one critical path test (`criticalPath: true`)
- Suggest tests based on acceptance criteria (auto-generate sensible defaults)
- If user accepts defaults, proceed; if they modify, capture changes
- Test scenarios should describe user-observable behavior, not implementation details
- User journeys should be step-by-step: "Navigate to X -> Click Y -> Verify Z"

## Step 5: Generate PRD

Create `projects/{name}/` folder with two files.

### Primary: projects/{name}/prd.json

This is the **source of truth**. `/run-project` and `/execute-task` consume this file.

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
      "e2eTests": [
        {
          "scenario": "{Test scenario name}",
          "userJourney": "{Navigate to X -> Do Y -> Verify Z}",
          "criticalPath": true
        }
      ],
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
| Scenario | User Journey | Critical Path |
|----------|-------------|---------------|
| {scenario} | {userJourney} | {criticalPath} |

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

Silent -- just log success/failure.

## Step 7.5: Capture Learning (Auto-Learn)

Run `/learn` to register the new project in the learning system:
```json
{
  "source": "build-activity",
  "severity": "medium",
  "scope": "global",
  "rule": "Project {name} exists at projects/{name}/ with {N} stories targeting {repoPath or 'no repo'}",
  "context": "Created via /prd"
}
```

Also reindex: `qmd update 2>/dev/null || true`

**Update INDEX.md:** Regenerate `projects/INDEX.md` per `knowledge/hq-core/index-md-spec.md`.

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
- Order: schema -> backend -> UI -> integration
- Keep stories atomic (one deliverable each)
- Every story starts with `passes: false`
- Every story must include at least one `e2eTests` entry
- Every story must have at least one `e2eTests` entry with `criticalPath: true`

## Rules

- Scan HQ first, ask questions second
- Batch questions (don't overwhelm)
- **prd.json is the source of truth** -- README.md is derived from it, never the reverse
- **All stories start with `passes: false`** -- `/run-project` marks them true
- **All stories must have `e2eTests`** -- validated by `.claude/scripts/validate-prd.ps1`
- **Do NOT use EnterPlanMode** -- this skill IS planning
- **Do NOT use TodoWrite** -- PRD stories track tasks
- **Do NOT implement** -- just create the PRD
