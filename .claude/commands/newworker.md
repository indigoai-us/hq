---
description: Scaffold a new worker with skills, tools, and knowledge
allowed-tools: Read, Write, Edit, AskUserQuestion
---

# New Worker Builder

Create a new worker with proper structure, skills, and verification.

## Context to Load First

1. `knowledge/workers/README.md` - Worker framework
2. `knowledge/workers/templates/` - Worker templates
3. `workers/registry.yaml` - Existing workers

## Interactive Setup

Ask these questions (can batch related ones):

### 1. Identity
- **What type of worker?** (CodeWorker, SocialWorker, ResearchWorker, OpsWorker, AssistantWorker)
- **What's its name/id?** (e.g., "competitive-researcher", "x-personal")
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

Create folder: `workers/{category}/{worker-id}/`

### worker.yaml

```yaml
worker:
  id: {worker-id}
  name: "{Human Name}"
  type: {WorkerType}
  version: "1.0"

identity:
  voice_guide: knowledge/{your-name}/voice-style.md

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
  source: workers/{category}/{worker-id}/queue.json
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
    path: workers/{category}/{worker-id}/
    type: {WorkerType}
    status: active
    description: "{1-sentence description}"
```

### Create Task Source

If needed, create `queue.json` or `prd.json`:

```json
{
  "worker": "{worker-id}",
  "tasks": []
}
```

## Rules

- Follow existing worker patterns
- One task at a time (Ralph principle)
- Always include verification
- Default to `approval_required: true` for external actions

## After Creation

Provide next steps:
1. "Worker created at `workers/{category}/{worker-id}/`"
2. "Test with on-demand execution first"
3. "Add tasks to queue.json to get started"
