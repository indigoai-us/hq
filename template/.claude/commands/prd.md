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

## Step 0: Company Anchor (from arguments)

Check if the **first word** of `$ARGUMENTS` matches a company slug in `companies/manifest.yaml`.

**How to check:** Read `companies/manifest.yaml`. Extract top-level keys (company slugs). If the first word of `$ARGUMENTS` exactly matches one of those slugs:

1. **Set `{co}`** = matched slug for the entire flow. Strip the slug from `$ARGUMENTS` — the remaining text is the project description
2. **Announce:** "Anchored on **{co}**"
3. **Load policies** — Read all files in `companies/{co}/policies/` (skip `example-policy.md`). Apply these as constraints throughout the PRD
4. **Scope qmd searches** — If company has `qmd_collections` in manifest, use `-c {collection}` for all `qmd` calls
5. **Pre-load repos** — Extract `{co}.repos[]` from manifest. Present as repo options in Batch 3 Q10
6. **Scope workers** — Filter to company workers (`companies/{co}/workers/`) + public workers (`workers/public/`)
7. **Scope projects** — Only search `companies/{co}/projects/` for existing project collision check

**If no match** (first word is not a company slug) → proceed normally. The full `$ARGUMENTS` text is the project description.

## Step 1: Get Project Description

If $ARGUMENTS provided, use as starting point.
If empty, ask: "Describe what you want to build or accomplish."

## Step 2: Scan HQ Context

Before asking questions, explore HQ. If company is anchored (Step 0), scope all searches to that company.

**Companies & Context:**
- Read `agents.md` (roles, priorities)
- Read `companies/manifest.yaml` (companies already listed there — never Glob for company discovery)

**Workers:**
- Read `workers/registry.yaml` (workers already indexed there — never Glob for worker discovery)
- If anchored: filter to company workers (`companies/{co}/workers/`) + public workers (`workers/public/`)

**Existing Projects:**
- If anchored: `qmd search "prd.json" --json -n 20 -c {co}` (scoped) or search `companies/{co}/projects/` directly
- If not anchored: `qmd search "prd.json" --json -n 20` → existing projects across all companies and personal

**Knowledge (use qmd, not Grep):**
- If anchored + company has `qmd_collections`: `qmd vsearch "<description keywords>" -c {collection} --json -n 10`
- If not anchored: `qmd vsearch "<description keywords>" --json -n 10` — semantic search for related knowledge, prior work, workers

**Company Policies (anchored only):**
- Read all files in `companies/{co}/policies/` (skip `example-policy.md`). These constrain the PRD

**Target Repo (if repo specified or discovered):**
- If anchored: company repos already pre-loaded from manifest. Present as options
- If target repo has a qmd collection (e.g. `{product}`): `qmd vsearch "<description keywords>" -c {collection} --json -n 10` — find related code, patterns, existing implementations
- Present: "Found related code: {list of relevant files}"


Present:
```
Scanned HQ:
- Company: {co} (anchored) | TBD
- Workers: {relevant list}
- Existing projects: {list or "none matching"}
- Relevant knowledge: {if any}
- Policies: {count loaded, or "none"}
- Category: [company-specific | cross-company | personal | HQ infrastructure]
```

## Step 2.5: Infrastructure Pre-Check

Before generating the PRD, verify infrastructure exists for the target company/repo:

1. **Company**: If project targets a company, read `companies/manifest.yaml`. If company has `knowledge: null`, flag: "Company {co} has no knowledge repo. Create one? [Y/n]" — if yes, create embedded repo at `companies/{co}/knowledge/` with `git init`, update manifest + modules.yaml.

2. **Repo**: If `repoPath` specified and doesn't exist locally, flag: "Repo not found at {path}. Clone it or create new?" Add to `manifest.yaml` if missing.

3. **qmd collection**: If company has `qmd_collections: []` in manifest, flag and offer to create collection.

Fix any gaps before proceeding.

## Step 3: Get + Validate Project Name

Ask for project slug (or infer from description). Then:
1. If `{co}` already set by Step 0: use it directly (skip company detection)
   If NOT set: determine company from context (infer from description, repo, or ask)
2. Check if `companies/{co}/projects/{name}/` exists (also check root `projects/{name}/` for personal/HQ)
   - If exists: "Project exists. Continue editing or choose different name?"
3. Validate slug format (lowercase, hyphens only)

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
12. Base branch? (default: `main`, or `staging` for {company}-nx, etc.) — Pure Ralph creates feature branch from this

**Batch 4: E2E Testing (recommended for deployable projects)**
For each user story targeting a deployable repo, specify E2E tests:

13. What E2E tests should verify this story works?
    - For UI: "Page loads", "User can complete [action]", "Form shows validation errors"
    - For API: "Endpoint returns expected response", "Error cases handled"
    - For CLI: "Command runs successfully", "Opens correct URL"
    - For integration: "Full flow from [A] to [B] works"
    - Leave empty for non-deployable projects (knowledge, content, data)

## Step 5: Generate PRD

Create `companies/{co}/projects/{name}/` folder with two files. Use root `projects/{name}/` only for personal/HQ projects.

### Primary: companies/{co}/projects/{name}/prd.json

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
      "e2eTests": [],
      "priority": 1,
      "passes": false,
      "files": [],
      "labels": [],
      "dependsOn": [],
      "notes": "",
      "model_hint": ""
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

**Populating `files`:** For each story, infer file paths from the description + acceptance criteria + target repo structure. If `repoPath` is set, search the repo (via qmd or Glob) to find existing files the story will modify, and predict new files it will create. Paths are repo-relative (e.g. `src/middleware/auth.ts`, not absolute). Best-effort — empty is fine for stories with unclear scope.

### Derived: companies/{co}/projects/{name}/README.md


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

**E2E Tests:** (if non-empty)
- [ ] {e2eTest 1}
- [ ] {e2eTest 2}

## Non-Goals
{What's out of scope}

## Technical Considerations
{Constraints, dependencies}

## Open Questions
{Remaining questions}
```

## Step 5.5: Sync to Company Board

Read `companies/manifest.yaml` to find `metadata.company` → `board_path`.

If `board_path` exists, read `companies/{co}/board.json` and upsert a project entry:
- **Match**: find existing entry by `prd_path === "companies/{co}/projects/{name}/prd.json"` or title similarity
- **If found**: update `status` to `prd_created`, set `prd_path`, update `updated_at`
- **If not found**: append new entry:
  ```json
  {
    "id": "{co-prefix}-proj-{N+1}",
    "title": "{project name}",
    "description": "{1-sentence description}",
    "status": "prd_created",
    "scope": "company",
    "app": null,
    "initiative_id": null,
    "prd_path": "companies/{co}/projects/{name}/prd.json",
    "created_at": "{ISO8601}",
    "updated_at": "{ISO8601}"
  }
  ```
- Write updated `board.json` back to `board_path`
- If no `metadata.company` in prd.json or no board_path, skip silently


## Step 6: Register with Orchestrator

Read `workspace/orchestrator/state.json`. Append to `projects` array:

```json
{
  "name": "{name}",
  "state": "READY",
  "prdPath": "companies/{co}/projects/{name}/prd.json",
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

## Step 7.5: Capture Learning (Auto-Learn)

Run `/learn` to register the new project in the learning system:
```json
{
  "source": "build-activity",
  "severity": "medium",
  "scope": "global",
  "rule": "Project {name} exists at companies/{co}/projects/{name}/ with {N} stories targeting {repoPath or 'no repo'}",
  "context": "Created via /prd"
}
```

Also reindex: `qmd update 2>/dev/null || true`

**Update INDEX.md:** Regenerate `companies/{co}/projects/INDEX.md` per `knowledge/public/hq-core/index-md-spec.md`.

## Step 8: Confirm & STOP

Tell user:
```
Project **{name}** created with {N} user stories.

Files:
  companies/{co}/projects/{name}/prd.json   (source of truth — tracks all work)
  companies/{co}/projects/{name}/README.md  (human-readable view)

To execute, start a new session and run:
  /run-project {name}        (multi-story orchestrator)
  /execute-task {name}/US-001 (single story)
```

**Then run `/handoff` and end the session.** Do NOT proceed to execution.


## Story Guidelines

- Each story completable in one AI session
- Acceptance criteria must be verifiable (not "works correctly")
- Order: schema → backend → UI → integration
- Keep stories atomic (one deliverable each)
- Every story starts with `passes: false`
- `model_hint` (optional): override model for all workers in this story. Values: `"opus"`, `"sonnet"`, `"haiku"`. Leave empty to use worker defaults from worker.yaml
- `files` (recommended): list of repo-relative file paths this story will likely create/modify. Used by file-locking system to prevent concurrent edit conflicts. Infer from story description + codebase search. Empty `[]` = no locks (backwards-compatible). Agents can expand the list dynamically during execution
- `e2eTests` (recommended for deployable projects): list of E2E test descriptions. Leave `[]` for non-code projects. Used by back-pressure in `/execute-task`
- For deployable projects, include at least one story dedicated to E2E test infrastructure (Phase 0 pattern)

## Rules

- Scan HQ first, ask questions second
- Batch questions (don't overwhelm)
- **prd.json is the source of truth** — README.md is derived from it, never the reverse
- **All stories start with `passes: false`** — `/run-project` marks them true
- **Do NOT use EnterPlanMode** — this skill IS planning
- **Do NOT use TodoWrite** — PRD stories track tasks
- **HARD BLOCK: Do NOT implement** — ONLY create the PRD files (`companies/{co}/projects/{name}/prd.json` + `README.md`). NEVER edit target files (repos, decks, sites, etc.) during a `/prd` session. Plan mode approval = "approved to generate PRD files," NOT "approved to implement." Implementation happens via `/execute-task` or `/run-project` AFTER PRD creation. Violating this bypasses project tracking, worker assignment, handoffs, and quality gates
- **STOP after PRD creation** — After Step 8 confirmation, run `/handoff` and end session. NEVER start executing stories, running workers, or writing implementation code in the same session as `/prd`. No exceptions, regardless of project size or user request. If user asks to start immediately, explain that execution requires a fresh session for context isolation (Ralph pattern). prd.json tracks all work for humans and future agent runs — this separation is mandatory
- **Infrastructure before planning** — never create a PRD that references infrastructure (company, repo, knowledge) that doesn't exist. Fix gaps first (Step 2.5)
- **MANDATORY: Always create project files** — Every /prd invocation MUST produce `companies/{co}/projects/{name}/prd.json` and `companies/{co}/projects/{name}/README.md`. No exceptions. These files are how HQ tracks work — they are NOT just inputs for /run-project. Never output a PRD to chat only, never skip file creation because the user "just wants a quick plan", never treat file generation as optional. If the user provides enough info to generate stories, write the files
- **Every story MUST have testable acceptance criteria** — "works correctly" is not acceptable
- **Include testing stories** — For deployable projects, at least one story should be dedicated to E2E test infrastructure
