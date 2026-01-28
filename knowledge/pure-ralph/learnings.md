# Pure Ralph Learnings

Aggregated patterns and insights from Pure Ralph project executions.

This file is automatically updated when projects complete. Learnings are extracted from task notes and categorized for future reference.

---

## Categories

- **Workflow**: Process and methodology patterns
- **Technical**: Implementation and code patterns
- **Gotchas**: Common pitfalls and how to avoid them

---

## Workflow Patterns

### Keep Acceptance Criteria Verifiable
**Pattern:** Write acceptance criteria that can be checked programmatically or by reading specific files/outputs
**Impact:** Enables autonomous verification; vague criteria cause task failures or require human intervention

### Single-Task Focus Prevents Context Bloat
**Pattern:** Each Claude session handles exactly one task, reads only what's needed
**Impact:** Fresh context per task prevents accumulated confusion; easier to debug failures

### Check Dependencies Before Starting
**Pattern:** Always verify `dependsOn` tasks have `passes: true` before starting work
**Impact:** Prevents wasted effort on tasks that can't be completed yet

### Stage Specific Files When Committing
**Pattern:** Use `git add <specific-files>` not `git add .`
**Impact:** Avoids accidentally committing unrelated changes or secrets

---

## Technical Patterns

### Create Base Prompts with Placeholders
**Pattern:** Use `{{PLACEHOLDER}}` syntax in base prompts for runtime substitution
**Impact:** Single source of truth for prompts; easy to customize per task

### Use Temp Files for Multi-line Prompts
**Pattern:** Write prompts to temp files rather than passing directly on command line
**Impact:** Avoids shell escaping issues with complex prompts

### JSON PRD as Source of Truth
**Pattern:** Store project state in JSON format with passes/notes fields per task
**Impact:** Easy to parse, query with jq, and update programmatically

---

## Gotchas

### Don't Batch Completions
**Pattern:** Mark tasks complete immediately after finishing, not in batches
**Impact:** Prevents lost progress if session is interrupted

### Always Read Full Task Object
**Pattern:** Read complete task including dependsOn and notes, not just title/description
**Impact:** Dependencies might not be met; notes might have context from planning

### Platform Path Differences
**Pattern:** Support multiple HQ path formats (~/my-hq, /c/my-hq, C:/my-hq)
**Impact:** Scripts work across Windows (MSYS2/Git Bash), macOS, and Linux

---

## Aggregation Log

<!-- Automatically updated when projects complete -->

| Date | Project | Tasks | Learnings Added |
|------|---------|-------|-----------------|

