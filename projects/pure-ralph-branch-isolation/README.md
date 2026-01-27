# Pure Ralph Branch Isolation

**Goal:** Ensure pure-ralph never commits to main, always uses feature branches, creates PRs on completion, and prevents concurrent execution conflicts.

**Success:** Safe parallel execution of multiple pure-ralph loops on different PRDs without conflicts, with clean PR workflow.

## Overview

Currently pure-ralph commits directly to whatever branch is checked out (usually main). This causes:
- Messy commit history on main
- No PR review workflow
- Conflicts when running multiple loops on same repo

This project adds:
1. **Automatic feature branch creation** - `feature/{project-name}`
2. **Main branch protection** - Never commit directly to main
3. **PR creation on completion** - Ready for review
4. **Lock file mechanism** - Prevent concurrent runs on same target repo
5. **Conflict detection** - Warn if another loop is already running

## Quality Gates

- None (documentation/config changes only)

## User Stories

### US-001: Add branch creation to pure-ralph prompt
**Description:** As a pure-ralph user, I want the loop to automatically create and use a feature branch so that main stays clean.

**Acceptance Criteria:**
- [ ] `prompts/pure-ralph-base.md` includes "Branch Management" section
- [ ] On session start: check if on feature branch for this project
- [ ] If not: create `feature/{project-name}` from main and switch to it
- [ ] If branch exists: switch to it
- [ ] All commits go to the feature branch, never main

### US-002: Add main branch protection to prompt
**Description:** As a pure-ralph user, I want the system to refuse to commit to main so that I don't accidentally pollute the main branch.

**Acceptance Criteria:**
- [ ] `prompts/pure-ralph-base.md` includes check before commit
- [ ] If current branch is main/master: ERROR, do not commit
- [ ] Provide clear error message: "Cannot commit to main. Create feature branch first."
- [ ] This is a hard block, not a warning

### US-003: Add PR creation on project completion
**Description:** As a pure-ralph user, I want a PR automatically created when all tasks complete so that changes can be reviewed.

**Acceptance Criteria:**
- [ ] `prompts/pure-ralph-base.md` includes PR creation step
- [ ] When all tasks pass: push branch to origin
- [ ] Create PR using `gh pr create` (if gh CLI available)
- [ ] PR title: `feat: {project-name} - {goal from PRD}`
- [ ] PR body: list of completed tasks with notes
- [ ] If gh not available: output push command and PR URL for manual creation

### US-004: Add lock file mechanism to orchestrator scripts
**Description:** As a pure-ralph user, I want the system to prevent concurrent runs on the same target repo so that conflicts are avoided.

**Acceptance Criteria:**
- [ ] `.claude/scripts/pure-ralph-loop.ps1` creates lock file on start
- [ ] Lock file location: `{target_repo}/.pure-ralph.lock`
- [ ] Lock file contains: project name, PID, start timestamp
- [ ] On exit (success or failure): remove lock file
- [ ] `.claude/scripts/pure-ralph-loop.sh` has same behavior

### US-005: Add conflict detection on loop start
**Description:** As a pure-ralph user, I want to be warned if another loop is already running on the same repo so that I don't cause conflicts.

**Acceptance Criteria:**
- [ ] On loop start: check for existing `.pure-ralph.lock` in target repo
- [ ] If lock exists: read contents, show warning with project name and duration
- [ ] Prompt user: "Another pure-ralph is running on this repo. Continue anyway? (y/N)"
- [ ] Default to N (abort)
- [ ] If user chooses to continue: proceed but log warning

### US-006: Update pure-ralph prompt with conflict awareness
**Description:** As a pure-ralph session, I need to be aware of potential conflicts so that I can handle them gracefully.

**Acceptance Criteria:**
- [ ] `prompts/pure-ralph-base.md` mentions checking for lock file
- [ ] If lock file found during session: warn and check if other process still running
- [ ] If lock is stale (process dead): safe to remove and continue
- [ ] Add learned pattern about conflict handling

### US-007: Document branch workflow in knowledge base
**Description:** As an HQ user, I want documentation on the branch workflow so that I understand how pure-ralph manages git.

**Acceptance Criteria:**
- [ ] `knowledge/pure-ralph/branch-workflow.md` created
- [ ] Documents: automatic branch creation
- [ ] Documents: PR creation process
- [ ] Documents: lock file mechanism
- [ ] Documents: handling concurrent execution attempts
- [ ] Documents: manual recovery if lock file becomes stale

## Non-Goals

- CI/CD integration (that's separate infrastructure)
- Automatic merge after PR approval
- Branch naming customization (use standard `feature/{project}` pattern)
- Multiple PRDs on same branch (one branch per project)

## Technical Considerations

- Requires `gh` CLI for automatic PR creation (graceful fallback if missing)
- Lock file must be cleaned up even on script crash (trap signals)
- Branch name derived from project name in PRD
- Must handle case where branch already exists from previous partial run

## Open Questions

- Should we support custom branch prefixes (e.g., `fix/` vs `feature/`)?
- Should lock file include expected completion time for better UX?
