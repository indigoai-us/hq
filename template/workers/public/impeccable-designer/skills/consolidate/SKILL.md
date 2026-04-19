---
name: consolidate
version: 1.0.0
description: |
  Consolidate a company's scattered projects into a single product PRD.
  Discovers all projects, triages completed vs active, generates roadmap
  from codebase analysis, archives old projects, produces one living PRD.
  Use when: "consolidate projects", "merge PRDs", "clean up projects",
  "single PRD", "project inventory", "consolidate".
  Proactively suggest when a company has 3+ projects and the user is
  doing a strategic review or cleanup session.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
---

# /consolidate — Project Consolidation

Merge a company's scattered PRDs into one living product PRD. Interactive 5-phase workflow.

## Arguments

- `{company}` — company slug (optional, inferred from cwd or asked)

## Phase 1 — Discovery

1. Resolve company slug from argument, cwd context, or ask user
2. Read `companies/manifest.yaml` → extract company repos, workers, knowledge
3. Scan `companies/{co}/projects/` for all project dirs (skip `_archive/`, `_template/`)
4. For each project dir with a `prd.json`:
   - Read prd.json
   - Extract: name, description, story count, completed count (where `passes === true`), repo path
   - Classify: DONE (all pass), ACTIVE (some pass), EMPTY (no stories)
5. Present inventory table:

```
Project Inventory: {company}
─────────────────────────────
  {name} — {done}/{total} stories [{DONE|ACTIVE|EMPTY}]  repo: {repoPath}
  ...

Total: {N} projects, {X} stories ({Y} done, {Z} remaining)
```

6. If only 1 project exists with all stories done, inform user there's nothing to consolidate and exit
7. If 0 projects found, exit with message

## Phase 2 — Triage (interactive)

Use AskUserQuestion (multi-select):

**Question:** "Which projects should be included in the consolidated PRD?"

**Options:**
- Each project listed with `{name} — {done}/{total} [{status}]`
- Pre-select all by default

**After selection:**
- Projects NOT selected will be left in place (not archived)
- Selected DONE projects → stories archived as completed
- Selected ACTIVE/EMPTY projects → active stories carried forward

## Phase 3 — Roadmap (interactive)

1. For each repo in the company manifest:
   - If repo exists locally, use an Explore agent to scan for:
     - TODO/FIXME/HACK comments
     - File-based stores that should be DB (*.json in src/data/)
     - In-memory state (Map, global vars for sessions/cache)
     - Missing tests, stale snapshots
     - Dead code, unused dependencies
   - Collect gaps as potential roadmap items

2. Present gap analysis summary to user

3. Use AskUserQuestion:

**Question:** "Add roadmap stories to the consolidated PRD?"

**Options:**
- "Auto-generate from gaps" — create stories from the analysis above
- "I'll specify" — user provides roadmap items in next message
- "Skip roadmap" — no new stories, just consolidate existing

## Phase 4 — Generate

1. Ask consolidated PRD name via AskUserQuestion:
   - Suggest `{company}-platform` as default
   - Options: suggested name, "I'll name it" (Other)

2. Create `companies/{co}/projects/{name}/prd.json`:
   - **Completed stories**: Re-prefix IDs from source PRD name:
     - Derive prefix from source project name (e.g. `domain-management` → `SITE`, `dominion-cli` → `CLI`)
     - If ambiguous, use first word of project name uppercased
     - Map `US-001` → `{PREFIX}-001`, etc.
     - Set `passes: true`, add `source: "{original-project}/{original-id}"` field
   - **Active stories**: Same re-prefix, keep `passes: false`, carry forward all fields
   - **Roadmap stories**: Use `ROAD-` prefix, `passes: false`, full acceptance criteria
   - **metadata**: consolidatedFrom array, both repos, company, storySummary counts

3. Archive selected projects:
   - `mkdir -p companies/{co}/projects/_archive/`
   - `mv` each selected project dir to `_archive/`
   - Projects keep their prd.json intact for historical reference

4. Update `companies/{co}/projects/INDEX.md`:
   - Active section: new consolidated PRD
   - Archive section: list archived projects with consolidation mapping

## Phase 5 — Verify

1. Read the new prd.json and display summary:

```
Consolidated PRD: {name}
─────────────────────────
Completed: {N} stories (from {X} archived projects)
Active:    {M} stories
Roadmap:   {K} stories
Total:     {N+M+K} stories

Archived: {list of archived project names}
```

2. Run `qmd update 2>/dev/null || true` to reindex

3. Offer next steps via AskUserQuestion:
   - "Run /review-plan on the new PRD" (Recommended)
   - "Start executing active stories"
   - "Done for now"

## ID Prefix Convention

When re-prefixing story IDs, use these rules:
- If project name contains "cli" → `CLI`
- If project name contains "docs" → `DOCS`
- If project name contains "portal" → `PORTAL`
- If project name contains "site" or "domain-management" → `SITE`
- If project name contains "security" or "pricing" or "fix" → `SEC`
- Otherwise → first meaningful word of project name, uppercased, max 6 chars

## Rules

- NEVER delete prd.json files — always archive (move to `_archive/`)
- NEVER modify stories from completed PRDs — carry forward as-is, just re-prefix ID
- ALWAYS add `source` field to every consolidated story pointing to original project/ID
- ALWAYS preserve `dependsOn` references — update them to use new prefixed IDs
- If a story's `dependsOn` references a story from a different source PRD, map it correctly
- If repos span both `companies/{co}/repos/` and `repos/private/`, include both in metadata
- Skip `_archive/` and `_template/` dirs when scanning for projects
- Interactive questions use AskUserQuestion, never assume user intent
- If user says "just do it" or "auto", use defaults for all questions
