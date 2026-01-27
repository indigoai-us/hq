---
description: Scaffold a new worker with skills, tools, and knowledge
allowed-tools: Read, Write, Edit, AskUserQuestion
---

# New Worker Builder

Create a new worker with proper structure, skills, and verification.

**Technology:** All HQ workers use TypeScript + Node.js (ESM). No Python for new workers.

**PRDs live in `projects/`** - Workers reference them, don't create their own. If the worker needs a PRD:
1. Run `/newproject {worker-name}` first to create the PRD
2. Then return to `/newworker` to create the worker that references it

## Context to Load First

1. `knowledge/workers/README.md` - Worker framework
2. `knowledge/workers/templates/` - Worker templates
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

### 5. Context Needs
- **What project context does this worker need?** (overview, architecture, domain, decisions, stakeholders, learnings)
- **Does it need more or less than its type's defaults?** (see `knowledge/context-needs/registry.yaml`)
- **Any external context required?** (brand guidelines, API specs, voice guides, etc.)

**Tip:** Reference `knowledge/context-needs/README.md` for context file descriptions. Most workers can use their type's defaults.

### 6. Verification
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
  persona: {your-name}  # or company_context, voice_guide

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

context_needs:
  # Reference knowledge/context-needs/registry.yaml for type defaults
  # Only include if overriding type defaults
  extends: {WorkerType}  # Inherit type defaults
  overrides:  # Optional: override specific needs
    required:
      - file: {context-file}
        reason: "{why this worker needs this}"

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

### Update Context Needs Registry (if overriding defaults)

If the worker has context needs different from its type's defaults, add to `knowledge/context-needs/registry.yaml`:

```yaml
workers:
  {worker-id}:
    extends: {WorkerType}
    overrides:
      required:
        - file: {context-file}
          reason: "{why this worker specifically needs this}"
    additional_external:
      - type: {external-context-type}
        path: {path-to-external-context}
        when: "{when this context is needed}"
```

**Skip this if:** The worker's needs match its type's defaults (most common case).

### Task Source Options

Workers can get tasks from:

1. **Project PRD** (recommended): `projects/{project-name}/prd.json`
   - For workers that implement features
   - Reference existing project or create one with `/newproject`

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

## After Creation

Provide next steps:
1. "Worker created at `workers/{worker-id}/`"
2. "Test with on-demand execution first"
3. If using queue: "Add tasks to queue.json to get started"
4. If using PRD: "Run `/newproject {project-name}` to create the PRD, then link it in worker.yaml"
