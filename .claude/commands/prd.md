---
description: Plan a project and generate PRD for execution
allowed-tools: Task, Read, Glob, Grep, Write, Bash, Edit
argument-hint: [project/feature description]
visibility: public
---

# /prd - Project Planning & PRD Generation

Create execution-ready PRDs with full GHQ context awareness.

**User's input:** $ARGUMENTS

**Important:** Do NOT implement. Just create the PRD.

## Step 1: Get Project Description

If $ARGUMENTS provided, use as starting point.
If empty, ask: "Describe what you want to build or accomplish."

## Step 2: Scan GHQ Context

Before asking questions, explore GHQ:

**Skills:**
- Read `.claude/skills/registry.yaml`

**Companies & Context:**
- Read `companies/manifest.yaml` (which companies exist, their repos/knowledge)

**Existing Projects:**
- Glob `projects/*/prd.json` + `companies/*/projects/*/prd.json` (check overlap)

**Archive Check:**
- Glob `projects/archive/*/prd.json` (check if project name was previously archived)

**Knowledge (use qmd, not Grep):**
- `qmd vsearch "<description keywords>" --json -n 10` -- semantic search for related knowledge, prior work, skills

**Target Repo (if repo specified or discovered):**
- If target repo has a qmd collection: `qmd vsearch "<description keywords>" -c {collection} --json -n 10`
- Present: "Found related code: {list of relevant files}"

Present:
```
Scanned GHQ:
- Skills: {relevant list from registry}
- Existing projects: {list or "none matching"}
- Archived projects: {list or "none matching"}
- Relevant knowledge: {if any}
- Category: [company-specific | personal | GHQ infrastructure]
```

## Step 3: Get + Validate Project Name

Ask for project slug (or infer from description). Then:
1. Determine company from context (infer from description, repo, or ask)
2. Check if `projects/{name}/` exists (for personal/GHQ projects) or `companies/{co}/projects/{name}/` (for company projects)
   - If exists: "Project exists. Continue editing or choose different name?"
3. Check if `projects/archive/{name}/` exists
   - If exists: "Project '{name}' was previously archived. Use a different name or reuse?"
4. Validate slug format (lowercase, hyphens only)

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
   A. `bun run typecheck && bun run lint`
   B. `npm run typecheck && npm run lint`
   C. None (no automated checks)
   D. Other: [specify]
8. Based on scan: "Should this use skills: {relevant skills from registry}?"
9. Repo path? (e.g. path to repo, or "none" if non-code)
10. Work mode? GHQ never uses feature branches.
    A. Work on `main` (simple, direct)
    B. Use a git worktree (isolated, parallel-safe)

**Batch 4: E2E Testing (recommended for deployable projects)**
For each user story targeting a deployable repo, specify E2E tests:

11. What E2E tests should verify this story works?
    - For UI: "Page loads", "User can complete [action]", "Form shows validation errors"
    - For API: "Endpoint returns expected response", "Error cases handled"
    - For CLI: "Command runs successfully", "Opens correct URL"
    - For integration: "Full flow from [A] to [B] works"
    - Leave empty for non-deployable projects (knowledge, content, data)

## Step 5: Generate PRD

Create project folder with two files.

**Path rules:**
- Personal/GHQ projects: `projects/{name}/`
- Company projects: `companies/{co}/projects/{name}/`

### Primary: {path}/prd.json

This is the **source of truth**. `/run-project` and `/execute-task` consume this file.

```json
{
  "name": "{project-slug}",
  "description": "{1-sentence goal}",
  "branchName": "main",
  "worktree": false,
  "userStories": [
    {
      "id": "US-001",
      "title": "{Story title}",
      "description": "{As a [user], I want [feature] so that [benefit]}",
      "acceptanceCriteria": ["{Specific verifiable criterion}"],
      "e2eTests": ["{At least one E2E test}"],
      "priority": 1,
      "passes": false,
      "archive": false,
      "labels": [],
      "dependsOn": [],
      "notes": ""
    }
  ],
  "metadata": {
    "createdAt": "{ISO8601}",
    "baseBranch": "main",
    "goal": "{Overall project goal}",
    "successCriteria": "{Measurable outcome}",
    "qualityGates": ["{commands from Batch 3}"],
    "repoPath": "{path to repo or empty}",
    "relatedSkills": ["{skill-ids from registry}"],
    "knowledge": ["{relevant knowledge paths}"],
    "relatedProjects": []
  }
}
```

**Field notes:**
- `branchName`: always `"main"` -- GHQ never uses feature branches
- `worktree`: set to `true` if user chose worktree in Step 4 Q10, else `false`
- `relatedSkills`: reference skill IDs from `.claude/skills/registry.yaml` (NOT worker names)
- `e2eTests`: every non-archived story MUST have at least one E2E test (per PRD schema v2)

### Derived: {path}/README.md

Generate FROM the prd.json data. Human-friendly view.

```markdown
# {name from prd.json}

**Goal:** {metadata.goal}
**Success:** {metadata.successCriteria}
**Repo:** {metadata.repoPath}
**Worktree:** {worktree ? "Yes (isolated)" : "No (work on main)"}

## Overview
{description}

## Skills
{metadata.relatedSkills joined}

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
  "prdPath": "{path}/prd.json",
  "updatedAt": "{ISO8601}",
  "storiesComplete": 0,
  "storiesTotal": "{N}",
  "checkedOutFiles": []
}
```

If project already exists in state.json, update it instead of duplicating.

## Step 7: Reindex

```bash
qmd update 2>/dev/null || true
```

## Step 8: Confirm & STOP

Tell user:
```
Project **{name}** created with {N} user stories.

Files:
  {path}/prd.json   (source of truth -- tracks all work)
  {path}/README.md  (human-readable view)

Registered in: workspace/orchestrator/state.json

To execute, start a new session and run:
  /run-project {name}        (multi-story orchestrator)
  /execute-task {name}/US-001 (single story)
```

**Then STOP.** Do NOT proceed to execution.

## Story Guidelines

- Each story completable in one AI session
- Acceptance criteria must be verifiable (not "works correctly")
- Order: schema -> backend -> UI -> integration
- Keep stories atomic (one deliverable each)
- Every story starts with `passes: false`
- `e2eTests` (REQUIRED): every non-archived story must have at least one. See PRD schema for format
- `archive` (optional): set to `true` to exclude from execution but preserve for history
- For deployable projects, include at least one story dedicated to E2E test infrastructure (Phase 0 pattern)

## Rules

- Scan GHQ first, ask questions second
- Batch questions (don't overwhelm)
- **prd.json is the source of truth** -- README.md is derived from it, never the reverse
- **All stories start with `passes: false`** -- `/run-project` marks them true
- **Do NOT use EnterPlanMode** -- this skill IS planning
- **Do NOT use TodoWrite** -- PRD stories track tasks
- **Skills, not workers** -- reference skill IDs from registry.yaml, not worker names
- **Work mode: main or worktree only** -- GHQ never uses feature branches. `branchName` is always `"main"`. Ask user to choose main or worktree in interview
- **Archive awareness** -- always check `projects/archive/` for name conflicts before creating
- **Company paths** -- company projects go under `companies/{co}/projects/`, personal/GHQ under `projects/`
- **HARD BLOCK: Do NOT implement** -- ONLY create PRD files. NEVER edit target repo files during a /prd session. Plan mode approval = "approved to generate PRD files", NOT "approved to implement"
- **STOP after PRD creation** -- After Step 8 confirmation, end session. NEVER start executing stories in the same session
- **MANDATORY: Always create project files** -- Every /prd invocation MUST produce prd.json and README.md. Never output a PRD to chat only
