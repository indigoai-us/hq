---
description: Scaffold a new worker with skills, tools, and knowledge
allowed-tools: Read, Write, Edit, AskUserQuestion
visibility: public
---

# New Worker Builder

Create a new worker with proper structure, skills, and verification.

**Technology:** All HQ workers use TypeScript + Node.js (ESM). No Python for new workers.

**PRDs live in `projects/`** - Workers reference them, don't create their own. If the worker needs a PRD:
1. Run `/prd {worker-name}` first to create the PRD
2. Then return to `/newworker` to create the worker that references it

## Context to Load First

1. `knowledge/public/workers/README.md` - Worker framework
2. `knowledge/public/workers/templates/` - Worker templates
3. `workers/registry.yaml` - Existing workers

## Interactive Setup

Ask these questions (can batch related ones):

### 1. Identity
- **What type of worker?** (CodeWorker, SocialWorker, ResearchWorker, OpsWorker)
- **What's its name/id?** (e.g., "competitive-researcher", "x-corey")
- **What does it do?** (1-sentence purpose)

### 2. Skills
- **What skills does it have?** (list specific capabilities)
- **What inputs does it need?** (context, triggers, data)
- **What outputs does it produce?** (reports, code, posts, etc.)

### 3. Execution
- **When does it run?** (on-demand, scheduled, event-triggered)
- **Schedule if applicable** (cron format: "0 9,14,19 * * *" = 9am, 2pm, 7pm)

### 4. Context
- **What files should always be loaded?** (base context)
- **What files should be loaded per-task?** (dynamic context)
- **What should be excluded?** (noise reduction)

### 5. Verification
- **What checks ensure quality?** (type checks, character limits, voice consistency)
- **Does it need human approval?** (before external actions)

## Generate Worker

Create folder: `workers/{worker-id}/` (flat structure, no categories)

### worker.yaml

```yaml
worker:
  id: {worker-id}
  name: "{Human Name}"
  type: {WorkerType}
  version: "1.0"

identity:
  persona: corey-epstein  # or company_context, voice_guide

execution:
  mode: {on-demand|scheduled|event-triggered}
  schedule: "{cron if scheduled}"
  max_runtime: 10m
  retry_attempts: 2

context:
  base:
    - {always-loaded-files}
  dynamic:
    - {per-task-files}
  exclude:
    - "*.log"
    - "node_modules/"

verification:
  post_execute:
    - {checks}
  approval_required: {true|false}

tasks:
  source: projects/{associated-project}/prd.json  # Or queue.json for simple task queues
  one_at_a_time: true

output:
  destination: workspace/{output-folder}/
  format: {markdown|json}

instructions: |
  {Worker-specific instructions and constraints}
```

### Update Registry

Add to `workers/registry.yaml`:

```yaml
  - id: {worker-id}
    path: workers/{worker-id}/
    type: {WorkerType}
    status: active
    description: "{1-sentence description}"
```

### Task Source Options

Workers can get tasks from:

1. **Project PRD** (recommended): `projects/{project-name}/prd.json`
   - For workers that implement features
   - Reference existing project or create one with `/prd`

2. **Queue file**: `workers/{worker-id}/queue.json`
   - For workers with simple, repeating tasks (posting, monitoring)
   - Create with:
     ```json
     {
       "worker": "{worker-id}",
       "tasks": []
     }
     ```

**Do NOT create prd.json inside worker directories.** PRDs belong in `projects/`.

## Rules

- Follow existing worker patterns
- One task at a time (Ralph principle)
- Always include verification
- Default to `approval_required: true` for external actions
- **Registration is mandatory** — never finish without updating registry.yaml + manifest.yaml
- **Always reindex** — run `qmd update` after creation

## After Creation

### Register Worker (Mandatory)

1. **registry.yaml**: Append entry to `workers/registry.yaml`:
   ```yaml
   - id: {worker-id}
     path: workers/{public|private}/{worker-id}/
     type: {WorkerType}
     visibility: {public|private}
     company: {company if private, omit if public}
     status: active
     description: "{1-sentence}"
   ```
   Validate: read back registry, confirm entry exists.

2. **manifest.yaml**: If worker has `company:`, append worker id to that company's `workers:` array in `companies/manifest.yaml`.

3. **modules.yaml**: If worker has a dedicated knowledge repo, add entry to `modules/modules.yaml`.

### Capture Learning (Auto-Learn)

Run `/learn` to register the new worker in the learning system:
```json
{
  "source": "build-activity",
  "severity": "medium",
  "scope": "global",
  "rule": "Worker {worker-id} exists at workers/{path}/ for {1-sentence purpose}",
  "context": "Created via /newworker"
}
```

### Reindex + Update INDEX

1. `qmd update 2>/dev/null || true`
2. Regenerate `workers/public/INDEX.md` or `workers/private/INDEX.md` per `knowledge/public/hq-core/index-md-spec.md`.

### Report to User

Provide next steps:
1. "Worker created at `workers/{worker-id}/`"
2. "Registered in registry.yaml + manifest.yaml"
3. "Test with on-demand execution first"
4. If using queue: "Add tasks to queue.json to get started"
5. If using PRD: "Run `/prd {project-name}` to create the PRD, then link it in worker.yaml"
