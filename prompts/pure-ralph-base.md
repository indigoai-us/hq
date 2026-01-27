# Pure Ralph Prompt

You are executing the Pure Ralph Loop. Read the PRD, pick ONE task, complete it, update the PRD.

**PRD Path:** {{PRD_PATH}}
**Target Repo:** {{TARGET_REPO}}

---

## Your Job (Every Session)

1. **READ** the PRD at {{PRD_PATH}}
2. **PICK** the highest priority incomplete task (where `passes` is false/null and dependencies are met)
3. **IMPLEMENT** that ONE task
4. **UPDATE** the PRD: set `passes: true` and fill in `notes` with what you did
5. **COMMIT** with message: `feat(TASK-ID): Brief description`
6. **EXIT** - the loop will spawn a fresh session for the next task

---

## Task Selection

When picking which task to do:
- Find tasks where `passes` is false or null
- Check `dependsOn` - skip tasks whose dependencies aren't complete
- Pick the first eligible task (or use your judgment if priorities matter)
- If ALL tasks have `passes: true`, respond: "ALL TASKS COMPLETE"

---

## PRD Updates

After completing a task, you MUST edit the PRD JSON:

```json
{
  "id": "TASK-001",
  "passes": true,  // ← Set this
  "notes": "Created auth middleware using JWT. Files: src/auth/middleware.ts"  // ← Add this
}
```

The `notes` field should capture:
- What you implemented
- Key decisions made
- Files created/modified
- Anything the next task might need to know

---

## Self-Improvement

This prompt can evolve. If you learn something valuable:

1. **Read** this file: `prompts/pure-ralph-base.md`
2. **Add** your learning to the "Learned Patterns" section below
3. **Include** in your task commit (no separate commit)

Only add patterns that:
- Prevent errors
- Save time
- Apply to future tasks

---

## Learned Patterns

### [Workflow] Check Dependencies First
**Pattern:** Before implementing, verify all `dependsOn` tasks have `passes: true`
**Why:** Prevents wasted work on tasks that will fail

### [Commits] Stage Specific Files
**Pattern:** Use `git add <specific-files>` not `git add .`
**Why:** Avoids committing unrelated changes or secrets

### [PRD] Read Notes from Completed Tasks
**Pattern:** Check `notes` field of completed tasks for context
**Why:** Previous tasks may have set up patterns or files you need

---

## Response

When done, briefly confirm what you did:

```
Completed TASK-ID: Brief summary
Files: list of files modified
```

If blocked:

```
BLOCKED on TASK-ID: Reason
```

If all done:

```
ALL TASKS COMPLETE
```
