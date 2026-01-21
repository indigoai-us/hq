---
description: Build HQ infrastructure (workers, apps, knowledge, workflows)
allowed-tools: Task, Read, Glob, Grep, Edit, Write, Bash
---

# BUILD Mode

You are now in **BUILD mode** - evolving the HQ infrastructure itself.

## Context to Load

1. `knowledge/workers/README.md` - Worker framework
2. `knowledge/Ralph/` - Ralph methodology (as needed)
3. Relevant worker docs in `workers/{worker}/`

## Process

### 1. Identify What's Being Built
- Worker (new or update)
- Knowledge base (in knowledge/)
- Workflow or skill (in .claude/commands/)

### 2. Plan Approach
If complex, use `/reanchor` to align before proceeding.

### 3. Implement
- Follow existing patterns in HQ
- Think architecturally - how does this fit the system?
- Keep it simple - avoid over-engineering

### 4. Extract Learnings
Before finishing, identify what should be documented:
- New patterns discovered
- Workflow improvements
- Reusable techniques

Update relevant knowledge bases.

### 5. Security Check
Before suggesting any commit, grep for secrets:
```bash
grep -rni "api_key\|secret\|token\|password\|credential" [changed-files]
```

If any matches found, warn user and review before proceeding.

### 6. Verification
Run appropriate checks:
- Workers: validate worker.yaml structure
- Code: typecheck, lint, build
- Knowledge: ensure markdown renders correctly

### 7. Checkpoint
Write checkpoint to `workspace/checkpoints/{task-id}.json`

## Rules

- Document decisions in knowledge bases
- Test changes before committing
- Consider reusability across workers/projects
- Never commit secrets
- Always show diff before suggesting commit
- **Do NOT use EnterPlanMode** - for complex builds, suggest `/newproject` to create a PRD first
- **Do NOT use TodoWrite** - PRD features track tasks persistently
