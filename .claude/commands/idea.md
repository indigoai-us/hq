---
description: Capture a project idea on the company board without full task planning
allowed-tools: Read, Write, Bash, AskUserQuestion
argument-hint: [idea description] [--company <slug>]
visibility: public
---

# /idea - Capture Project Idea

Quickly add a project idea to the board. No tasks, no subtasks — just capture the thought.

**Input:** $ARGUMENTS

**Pipeline:** **`/idea`** → `/brainstorm` → `/create-task` → `/execute-task`

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

## Step 4: Initialize Board (if needed)

Check if `companies/{co}/board.json` exists.

**If not**, create it:
```json
{
  "company": "{slug}",
  "updated_at": "{ISO8601}",
  "projects": []
}
```

## Step 5: Write Board Entry

1. Read `companies/{co}/board.json`
2. **Generate ID:**
   - Collect all `id` values from `projects` array
   - Extract numeric suffixes from IDs matching `{prefix}-proj-{NNN}` pattern
   - If no existing entries, derive prefix from company slug (first 2-3 chars, lowercase)
   - Next ID = `{prefix}-proj-{max_N + 1}`, zero-padded to 3 digits
3. **Derive title:** If description is >50 chars, derive a concise 3-6 word title. If <=50 chars, use as-is for both title and description.
4. **Build entry:**
   ```json
   {
     "id": "{prefix}-proj-{NNN}",
     "title": "{concise title}",
     "description": "{user's full description}",
     "status": "idea",
     "brainstorm_path": null,
     "created_at": "{ISO8601}",
     "updated_at": "{ISO8601}"
   }
   ```
5. Append to `projects` array. Update root `updated_at`. Write board.json.

## Step 6: Confirm & Reindex

Print:
```
Idea captured: **{title}** ({id})
Board: companies/{co}/board.json
Status: idea

Next steps:
  /brainstorm {co} {id}    → explore approaches
  /idea                     → add another idea
  /idea -c {co}             → add idea to same board
```

Reindex: `qmd update 2>/dev/null || true`

## Rules

- **No task creation** — this command ONLY writes to board.json
- **No execution** — ideas are pre-planning; `/create-task` handles actionable work
- **1 AskUserQuestion max** — batch everything into one call
- **board.json is the only file written**
- **Follow existing ID conventions** — lowercase prefix, zero-padded 3-digit numbers
- **Inline mode**: if all info is provided via args/flags, write the entry with zero questions
- **Do NOT use TodoWrite or EnterPlanMode** — this command IS the quick capture
