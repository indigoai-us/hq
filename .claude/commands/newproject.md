---
description: Ralph-style project planning through structured discovery
allowed-tools: Task, Read, Glob, Grep, AskUserQuestion, Write, Bash
argument-hint: [project description]
---

# /newproject - Ralph-Style Planning

Transform a project idea into an actionable PRD with full HQ context awareness.

**User's input:** $ARGUMENTS

## Process

### 1. Get Project Description

If no argument provided, ask:
> "Describe what you want to build or accomplish."

If argument provided, use that as the starting point.

### 2. Scan HQ Context (Ralph Mode)

Before asking questions, **explore HQ** to understand:

**Companies & Context:**
- Glob `knowledge/*/` - which companies/contexts exist
- Read `agents.md` - your roles and priorities

**Existing Infrastructure:**
- Glob `workers/*/worker.yaml` - available workers
- Read `workers/registry.yaml` - worker index
- Glob `apps/*/` - existing apps

**Related Work:**
- Glob `projects/*/prd.json` - existing projects (any overlap?)
- Grep for keywords from user's description across HQ

**Knowledge Bases:**
- Glob `knowledge/*/` - relevant knowledge that could inform the project

Present findings:
```
Scanned HQ. Relevant context found:

Workers: x-personal, cfo-example-company (could contribute)
Knowledge: knowledge/{your-name}/, knowledge/marketing-co-marketing/
Related projects: None found (or: "customer-cube" has similar scope)

This project appears to be: [company-specific | cross-company | personal | HQ infrastructure]
```

### 3. Validate Project Name

Ask for project name/slug. Then:
1. Check if `projects/{name}` exists
2. If exists: "Project exists. Continue editing or choose different name?"

### 4. Discovery Interview (Batched)

With HQ context loaded, ask questions in 2-3 batches:

**Batch 1: Problem & Success**
- What's the core problem or goal?
- What does success look like? (measurable)
- Who benefits?

**Batch 2: Scope & Constraints**
- What's in scope for MVP?
- Any hard constraints (time, tech, budget)?
- Dependencies on other projects/workers?

**Batch 3: HQ Integration** (informed by scan)
- Based on scan: "Should this use {relevant workers}?"
- Does this need a new worker or skill?
- Where should outputs live?

### 5. Draft Project Spec

Create `projects/{name}/` folder with:

**projects/{name}/README.md** (human-readable overview):
```markdown
# {Project Name}

**Goal:** {1-sentence goal}
**Success:** {measurable outcome}
**Scope:** {MVP boundaries}

## Context
- Company: {if applicable}
- Related workers: {list}
- Knowledge bases: {list}

## User Stories
1. {story} - {brief}
2. {story} - {brief}
...

## Notes
{any important context}
```

**projects/{name}/prd.json** (mr-burns format):
```json
{
  "name": "{project-name}",
  "description": "{1-sentence goal}",
  "branchName": "feature/{project-name}",
  "userStories": [
    {
      "id": "US-001",
      "title": "{story title}",
      "description": "{what and why}",
      "acceptanceCriteria": ["{criterion}"],
      "priority": 1,
      "passes": false,
      "labels": [],
      "dependsOn": [],
      "notes": ""
    }
  ],
  "metadata": {
    "createdAt": "{ISO8601}",
    "goal": "{goal}",
    "successCriteria": "{measurable outcome}",
    "relatedWorkers": ["{worker-ids}"],
    "knowledge": ["{paths}"]
  }
}
```

### 6. Register with Orchestrator

After PRD created, register the project with HQ orchestrator:

Write to `workspace/orchestrator/state.json`:
- Add project to `projects` array with state: `READY`
- Include: name, prdPath, storiesTotal, storiesComplete: 0

The orchestrator tracks all projects and manages parallel execution.

### 7. Sync to Beads

Run automatically after PRD created:
```bash
npx tsx scripts/prd-to-beads.ts --project={name}
```

### 8. Execution Choice

Based on complexity:

**Recommend mr-burns when:**
- >3 user stories
- Stories have dependencies
- Multi-file implementation
- Would exhaust session context

**Recommend in-process when:**
- 1-3 simple stories
- Single-file changes
- Quick work

Offer choice:
> "Project has {N} stories. [Recommend mr-burns / Can run in-process]
>
> 1. Spawn mr-burns (persistent, crash recovery)
> 2. Execute now (in this session)"

## Project Folder Contents

Every project gets:
```
projects/{name}/
├── README.md      # Human overview
├── prd.json       # mr-burns format PRD
└── (outputs/)     # Created during execution
```

mr-burns creates additional files during execution:
- `tasklist.json` - execution state
- `logs/` - execution logs

## Rules

- Scan HQ first, ask questions second
- Batch questions (don't overwhelm)
- Keep stories atomic (one deliverable each)
- Every story starts with `passes: false`
- **Do NOT use EnterPlanMode** - this skill IS planning
- **Do NOT use TodoWrite** - PRD stories track tasks
- Always sync to beads after PRD creation
