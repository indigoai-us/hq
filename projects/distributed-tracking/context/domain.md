---
last_updated: 2026-01-27
last_verified: 2026-01-27
verified_by: context-manager
---

# Distributed Tracking Domain

## Glossary

| Term | Definition |
|------|------------|
| HQ | Personal OS for orchestrating AI workers (my-hq repository) |
| PRD | Product Requirements Document defining project features and tasks |
| Target Repo | The repository a PRD describes work for (may be external or my-hq itself) |
| Claim | Declaration of intent to work on a task, preventing duplicate effort |
| Sync | Bidirectional transfer of PRD/status between HQ and target repo |
| `.hq/` | Hidden directory in target repos storing synced tracking data |

## Concepts

### Concept 1: Sync State

**Definition:** The relationship between local PRD (in `projects/{name}/prd.json`) and repo PRD (in `{target}/.hq/prd.json`).

**Properties:**
- `synced`: Local and repo match
- `local_ahead`: Local has changes not in repo
- `repo_ahead`: Repo has changes not in local
- `diverged`: Both have different changes (conflict)

**Relationships:**
- Determined by comparing `synced_at` timestamps
- Resolved via merge operation

### Concept 2: Claim

**Definition:** A record indicating a contributor intends to work on a specific task.

**Properties:**
- `task_id`: Which task is claimed
- `claimed_by`: HQ identifier of claimer
- `claimed_at`: When claim was made
- `expires_at`: When claim automatically releases

**Relationships:**
- One claim per task at a time
- Claims released on task completion
- Expired claims can be overwritten

### Concept 3: Sync Log

**Definition:** History of sync operations for debugging and audit.

**Properties:**
- `timestamp`: When sync occurred
- `direction`: push or pull
- `hq_identifier`: Who synced
- `changes`: What was synced

## Rules

### Rule 1: Single Active Claim

**Statement:** A task can only have one active (non-expired) claim at a time.

**Rationale:** Prevents multiple people from unknowingly working on the same task.

**Enforcement:** `claims.json` checked before creating new claim; existing non-expired claim blocks new claims.

### Rule 2: Claim Expiration

**Statement:** Claims expire after a configurable duration (default 24 hours).

**Rationale:** Prevents abandoned claims from blocking tasks forever.

**Enforcement:** Expiration checked on claim read; expired claims treated as non-existent.

### Rule 3: Timestamp Wins

**Statement:** When merging conflicting task updates, the newer `updated_at` timestamp wins.

**Rationale:** Simple, deterministic merge without complex UI.

**Enforcement:** Per-task comparison during merge operation.

### Rule 4: No Auto-Overwrite

**Statement:** Pull operations report differences but never automatically overwrite local PRD.

**Rationale:** Prevents accidental loss of local work.

**Enforcement:** Pull returns diff; user must explicitly merge or accept changes.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Claim expires while working | Task completion releases claim anyway; expiration is advisory |
| Simultaneous claims | First push wins; second push sees existing claim and warns |
| Offline work | Work proceeds; sync on reconnect may show conflicts |
| Target repo not a git repo | Error with clear message; sync not possible |
| `.hq/` in .gitignore | Warning; sync won't work if ignored |
