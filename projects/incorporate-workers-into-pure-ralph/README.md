# Incorporate Workers into Pure Ralph

**Goal:** Enhance pure-ralph to select and invoke the appropriate dev-team worker for each task.

**Success:** Each task executed by specialist worker with audit trail and optional PRD overrides.

## Overview

Integrate dev-team workers into the Pure Ralph loop so that each task is handled by the most appropriate specialist worker, with automatic selection based on keywords, files, and PRD hints.

## User Stories

### US-001: Add worker selection logic to pure-ralph-base.md
**Description:** Add instructions for selecting the appropriate dev-team worker for each task based on keywords, files, and PRD hints.

**Acceptance Criteria:**
- [x] prompts/pure-ralph-base.md includes Worker Selection section
- [x] Instructions specify: after picking task, determine best worker
- [x] Selection criteria documented: task keywords, target files, PRD hints
- [x] Lists available dev-team workers with their specialties

### US-002: Add PRD worker override support
**Description:** Document optional worker field in PRD task JSON for manual override of automatic selection.

**Acceptance Criteria:**
- [x] prompts/pure-ralph-base.md documents optional worker field in task JSON
- [x] If worker field present, use that worker instead of auto-selecting
- [x] If worker field absent, Claude selects based on criteria

### US-003: Add worker invocation instructions to prompt
**Description:** Document how to fully invoke a worker within the loop.

**Acceptance Criteria:**
- [x] prompts/pure-ralph-base.md includes Worker Invocation section
- [x] Instructions: read worker.yaml from workers/dev-team/{worker}/
- [x] Instructions: follow worker's skills and execution patterns
- [x] Worker context is used for implementation, not just reference

### US-004: Add worker selection reasoning to task notes
**Description:** Specify that task notes must include which worker was selected and why.

**Acceptance Criteria:**
- [x] prompts/pure-ralph-base.md specifies notes format includes worker info
- [x] Notes must include: Worker: {worker-id}
- [x] Notes must include: Selection reason: {brief explanation}

### US-005: Create worker selection reference table
**Description:** Add quick reference table mapping keywords and file patterns to recommended workers.

**Acceptance Criteria:**
- [x] prompts/pure-ralph-base.md includes worker reference table
- [x] Table maps: keywords/patterns to recommended worker
- [x] Covers all 12 dev-team workers
- [x] Includes file extension hints
