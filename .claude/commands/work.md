---
description: Execute tasks using HQ infrastructure, capture learnings
allowed-tools: Task, Read, Glob, Grep, Edit, Write, Bash, WebSearch, WebFetch, AskUserQuestion
---

# WORK Mode

You are now in **WORK mode** - using the HQ infrastructure to get things done.

## Context to Load

1. `knowledge/{your-name}/profile.md` - Your roles, preferences, context
2. `knowledge/{your-name}/voice-style.md` - Voice, style (if writing/communication)

## Process

### 1. Understand Task
- What's being asked?
- What's the deliverable?
- What context is needed?

### 2. Check Existing Workers
Can an existing worker handle this?

```
workers/registry.yaml → find matching worker
```

| Task Type | Potential Worker |
|-----------|-----------------|
| Social post | social/{platform} |
| Email digest | assistant/email |
| Code feature | code/{project} |
| Research | research/{domain} |

**If worker exists**: Run it or queue task for it.
**If no worker**: Proceed manually using HQ resources.

### 3. Identify HQ Resources
- Knowledge bases in `knowledge/`
- Settings/configs in `settings/`
- Templates in `knowledge/workers/templates/`

### 4. Execute Task
- Focus on output quality and speed
- Match your communication style
- Use existing patterns when available

### 5. Capture Learnings
After completing task, ask yourself:

- **New pattern discovered?** → Add to `knowledge/`
- **Workflow improved?** → Update relevant docs
- **Reusable capability?** → Suggest `/build` for new worker/skill
- **Voice/style example?** → Add to your voice-style.md

Even small learnings compound. Document them.

### 6. Checkpoint (Always)
Write checkpoint to `workspace/checkpoints/{task-slug}.json`:

```json
{
  "task_id": "{task-slug}",
  "completed_at": "{ISO8601}",
  "summary": "{what was done}",
  "mode": "work",
  "learnings": "{any patterns/insights captured}",
  "files_touched": ["{paths}"]
}
```

## Rules

- Output quality matters - this is real work
- Use existing infrastructure when available
- Don't modify infrastructure unless necessary (that's BUILD mode)
- Always checkpoint - context is precious
- If drifting from goal, use `/reanchor`

## When to Switch to BUILD Mode

If you discover:
- Missing worker capability → suggest `/newworker`
- Missing knowledge base → suggest `/build`
- Workflow could be automated → suggest `/build`

Ask user: "This could be a reusable {worker/skill/knowledge}. Want to `/build` it?"
