# Garden Report: Full HQ Sweep
**Run:** garden-all-20260311 | **Date:** 2026-03-11

## Summary
- **Chunks processed:** personal, indigo, cortex, _orphans
- **Files scanned:** ~80 across all chunks
- **Findings:** 15 (0 high, 8 medium, 7 low)
- **Auto-approved & actioned:** 6 (medium severity + high confidence)
- **Skipped (log only):** 9 (low severity or ambiguous)
- **Escalations:** 0 PRDs created
- **Overall health:** Good

## Chunks

| Chunk | Findings | Actioned | Status |
|-------|----------|----------|--------|
| personal | 4 | 1 | ✓ clean |
| indigo | 4 | 1 | ✓ clean |
| cortex | 0 | 0 | ✓ clean |
| _orphans | 7 | 4 | ✓ clean |

## Actions Taken

| Finding | Action | Path | Notes |
|---------|--------|------|-------|
| F-personal-001 | archive | `companies/personal/knowledge/voice-style.md` | → `_archive/` — placeholder-only content |
| F-indigo-001 | archive | `companies/indigo/projects/e2e-perf/README.md` | → `_archive/` — duplicates prd.json |
| F-orphans-001 | update | `workspace/threads/INDEX.md` | Added missing cortex-prd thread entry |
| F-orphans-002 | update | `workspace/threads/recent.md` | Added missing cortex-prd thread entry |
| F-orphans-003 | update | `workspace/reports/INDEX.md` | Added garden-all-20260310-b.md, archived old report ref |
| F-orphans-004 | archive | `workspace/reports/garden/garden-all-20260310.md` | → `_archive/` — superseded by -b variant |

## Skipped Findings (Log Only)

| Finding | Type | Severity | Path | Reason Skipped |
|---------|------|----------|------|----------------|
| F-personal-002 | empty | low | `companies/personal/knowledge/profile.md` | Awaiting /personal-interview |
| F-personal-003 | orphan | low | `companies/personal/data/` | Normal empty scaffold dir |
| F-personal-004 | orphan | low | `companies/personal/settings/` | Normal empty scaffold dir |
| F-indigo-002 | orphan | low | `companies/indigo/policies/` | Normal empty scaffold dir |
| F-indigo-003 | orphan | low | `companies/indigo/settings/` | Normal empty scaffold dir |
| F-indigo-004 | empty | medium | `companies/indigo/data/user-stories-draft.md` | Recent working doc (2026-03-10), still relevant |
| F-orphans-005 | orphan | low | `workspace/orchestrator/garden-all-20260310/` | Keeping orchestrator history |
| F-orphans-006 | orphan | low | `workspace/orchestrator/garden-all-20260311/` | Current run — skip |
| F-orphans-007 | index_drift | low | `workspace/orchestrator/INDEX.md` | Will update via qmd reindex |

## Notes
- cortex chunk was fully clean — all files recent (March 2026)
- personal and indigo scaffold dirs (policies/, settings/, data/) are expected empty — skip rule should persist
- `indigo/data/user-stories-draft.md` is a recent working doc — reassess in next week's sweep if no progress on e2e-perf project
