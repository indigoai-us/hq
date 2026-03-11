---
description: Capture a project idea as a bd task without subtask planning
allowed-tools: Read, Bash, AskUserQuestion
argument-hint: [idea description] [--company <slug>]
visibility: public
---

# /idea - Capture Project Idea

Quickly capture an idea as a beads task. No subtasks, no planning — just capture the thought.

**Input:** $ARGUMENTS

**Pipeline:** **`/idea`** → `/brainstorm` → `/plan` → `/run-loop`

## Step 1: Parse Input

Extract from `$ARGUMENTS`:
- `--company <slug>` or `-c <slug>` — explicit company override
- Everything else → idea description text

If `$ARGUMENTS` is empty and no flags, go to Step 2 (interview).
If description text is present (>5 words after flag extraction), skip the description question in Step 3.

## Step 2: Resolve Company

**Priority order:**
1. `--company` / `-c` flag → use exact slug
2. cwd inside `companies/{slug}/` → infer from path
3. If still ambiguous → ask in Step 3

Read `companies/manifest.yaml`. Validate company slug exists.

## Step 3: Interview (1 AskUserQuestion call max)

Batch all missing info into **one** AskUserQuestion call. Skip any field already resolved.

**Questions (include only what's missing):**

1. **What's the idea?** (1-2 sentences)
   *Skip if description already extracted from args.*

2. **Which company?** List all companies from manifest.
   *Skip if company already resolved.*

If all info is provided via args, skip straight to Step 4 — no interview needed.

## Step 4: Find Project Epic

`cd companies/{co}` then run:

```bash
bd list --type epic --json
```

Find the project epic for this company. If multiple project epics exist, ask the user which one. If none exist, create one using `/new-project`.

## Step 5: Create bd Task

**Derive title:** If description is >50 chars, derive a concise 3-6 word title. If <=50 chars, use as-is.

```bash
cd companies/{co}
bd create "{title}" \
  --parent {project-epic-id} \
  --type task \
  --description "{user's full description}" \
  --labels "{company-label},idea" \
  --silent
```

Capture the returned task ID (e.g. `ghq-abc`).

## Step 6: Confirm & Reindex

Print:
```
Idea captured: **{title}** ({task-id})
Status: idea

Next steps:
  /brainstorm {co} {task-id}  → explore approaches
  /idea                        → add another idea
  /idea -c {co}                → add idea to same company
```

Reindex: `qmd update 2>/dev/null || true`

## Rules

- **No subtask creation** — this command creates a single bd task only
- **No execution** — ideas are pre-planning; `/plan` decomposes into subtasks
- **1 AskUserQuestion max** — batch everything into one call
- **bd task is the only artifact** — no files written to disk
- **Inline mode**: if all info is provided via args/flags, create the task with zero questions
- **Do NOT use TodoWrite or EnterPlanMode** — this command IS the quick capture
