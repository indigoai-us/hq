# Purist Ralph Loop

**Goal:** Create an external terminal orchestrator that runs a canonical Ralph loop with fresh context per task and self-improving prompts.

**Success:** `/pure-ralph my-project` opens terminal, executes PRD tasks autonomously, completes with zero intervention, and evolves its base prompt with learnings.

## Overview

The current `/run-project` command runs the orchestrator inside Claude's session, causing context accumulation and eventual compression. This project creates a true external orchestrator:

1. **External loop** - Bash/PowerShell `while` loop runs outside Claude
2. **Fresh context per task** - Each `claude -p` invocation starts clean
3. **Self-modifying** - Loop can update its own prompts and CLAUDE.md
4. **PRD as source of truth** - `passes` field = state, `notes` field = context
5. **Cross-platform** - Works on Windows, Mac, Linux with remembered terminal preference

## Quality Gates

- None for MVP (shell scripts + markdown)
- Task verification: `passes: true` + `notes` populated + git commit exists

## User Stories

### US-001: Create base prompt file
**Description:** As a user, I want a low-fi base prompt that instructs Claude on Ralph principles so each spawned session knows the methodology.

**Acceptance Criteria:**
- [ ] `prompts/pure-ralph-base.md` exists in my-hq
- [ ] Contains Ralph principles: one task, fresh context, update PRD, commit
- [ ] Includes instructions for self-modification (how to update this file)
- [ ] Under 500 lines (minimal, focused)

**Files:** `prompts/pure-ralph-base.md`

---

### US-002: Create terminal settings mechanism
**Description:** As a user, I want to set my preferred terminal once and have it remembered for subsequent runs.

**Acceptance Criteria:**
- [ ] `settings/pure-ralph.json` stores terminal preference
- [ ] First run prompts user to choose terminal type
- [ ] Supports: PowerShell (Windows), Windows Terminal, bash (Mac/Linux), iTerm (Mac)
- [ ] Setting persists across sessions

**Files:** `settings/pure-ralph.json`

---

### US-003: Create PowerShell loop script
**Description:** As a Windows user, I want a PowerShell script that runs the canonical Ralph loop.

**Acceptance Criteria:**
- [ ] `.claude/scripts/pure-ralph-loop.ps1` exists
- [ ] Reads PRD path and target repo as arguments
- [ ] Spawns fresh `claude -p` per task with base prompt
- [ ] Updates PRD `passes` and `notes` fields
- [ ] Creates git commit per completed task
- [ ] Logs to `workspace/orchestrator/{project}/pure-ralph.log`

**Files:** `.claude/scripts/pure-ralph-loop.ps1`

---

### US-004: Create bash loop script
**Description:** As a Mac/Linux user, I want a bash script that runs the canonical Ralph loop.

**Acceptance Criteria:**
- [ ] `.claude/scripts/pure-ralph-loop.sh` exists
- [ ] Same functionality as PowerShell version
- [ ] Works on macOS and Linux
- [ ] Executable permissions set

**Files:** `.claude/scripts/pure-ralph-loop.sh`

---

### US-005: Create /pure-ralph slash command
**Description:** As a user, I want to run `/pure-ralph my-project` to launch the external orchestrator.

**Acceptance Criteria:**
- [ ] `.claude/commands/pure-ralph.md` exists
- [ ] Accepts project name as argument
- [ ] Prompts for target repo if not in PRD metadata
- [ ] Checks terminal preference, prompts if not set
- [ ] Spawns appropriate terminal with loop script
- [ ] Provides feedback on how to monitor progress

**Files:** `.claude/commands/pure-ralph.md`

---

### US-006: Add self-modification capability
**Description:** As a user, I want the loop to improve its own prompts based on learnings so it gets better over time.

**Acceptance Criteria:**
- [ ] Base prompt includes section for "Learned Patterns"
- [ ] Each task completion can append to learned patterns
- [ ] CLAUDE.md gets updated with cross-project learnings
- [ ] Changes are committed with clear messages

**Files:** `prompts/pure-ralph-base.md`, `.claude/CLAUDE.md`

---

### US-007: Add learnings aggregation
**Description:** As a user, I want learnings from completed projects aggregated into the knowledge base.

**Acceptance Criteria:**
- [ ] On project completion, learnings extracted from all task notes
- [ ] Written to `knowledge/pure-ralph/learnings.md`
- [ ] Patterns categorized (workflow, technical, gotchas)
- [ ] Base prompt updated with high-value patterns

**Files:** `knowledge/pure-ralph/learnings.md`, `prompts/pure-ralph-base.md`

---

### US-008: Add beads integration
**Description:** As a user, I want the loop to sync with beads for task tracking visibility.

**Acceptance Criteria:**
- [ ] Loop checks if `bd` CLI is available
- [ ] If available, syncs PRD tasks to beads on start
- [ ] Updates bead status as tasks complete
- [ ] Graceful fallback if beads not installed

**Files:** `.claude/scripts/pure-ralph-loop.ps1`, `.claude/scripts/pure-ralph-loop.sh`

## Non-Goals

- GUI interface (this is CLI-focused)
- Parallel task execution (sequential is intentional for Ralph purity)
- Support for non-Claude AI providers
- Real-time streaming output (batch per task is fine)

## Technical Considerations

- Cross-platform terminal detection is tricky - use environment variables and fallbacks
- Self-modification requires careful prompting to avoid runaway changes
- Git commits should be atomic per task, not batched
- Base prompt should stay small to leave room for task context

## Open Questions

- Should there be a `--dry-run` flag to preview without executing?
- Max iterations safety limit?
- How to handle task failures - retry, skip, or pause?
