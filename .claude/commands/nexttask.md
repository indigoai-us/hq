---
description: Scan HQ and suggest next tasks or projects to work on
allowed-tools: Read, Glob, Grep, AskUserQuestion
---

# Next Task Finder

Scan HQ to surface actionable work. Prioritize by urgency, impact, and readiness.

## Scan These Sources

### 1. In-Progress Checkpoints
```
workspace/checkpoints/*.json
```
Look for `"status": "in_progress"` or `"status": "partially_complete"`.
These are **hot** - work was started but not finished.

### 2. Project READMEs
```
projects/*/README.md
```
Scan for:
- `[ ]` unchecked tasks
- `Status:` lines showing incomplete work
- `Next Steps:` sections
- `Pending` items

### 3. Worker Registry
```
workers/registry.yaml
```
Look for `status: planned` workers that could be built.

### 4. HQ Journal (Recent)
```
data/journal/hq-journal.jsonl
```
Check last 5-10 entries for `"outcome": "in_progress"` or `"outcome": "blocked"`.

### 5. Content Queues
```
workers/social/*/queue.json
workspace/content-ideas/
workspace/social-drafts/
```
Pending posts or content that needs work.

## Output Format

Present findings as a prioritized list:

```
## 🔥 Hot (In-Progress Work)
1. [CHECKPOINT] {task} - {one-line summary}
   Source: workspace/checkpoints/{file}

## 📋 Ready to Execute
2. [PROJECT] {project name} - {specific next step}
   Source: projects/{name}/README.md

## 🏗️ Infrastructure (Build Mode)
3. [WORKER] {worker name} - status: planned
   Source: workers/registry.yaml
```

## Priority Rules

1. **In-progress checkpoints** > everything else (finish what's started)
2. **Blocked work** that can now be unblocked
3. **Projects with clear next steps** > vague projects
4. **Revenue-generating work** > infrastructure
5. **Quick wins** > large efforts (unless user has blocked time)

## After Presenting

Ask user:
- Which task to work on?
- Any context changes that affect priority?
- Time available for this session?

Then offer to run `/work` or `/build` as appropriate.
