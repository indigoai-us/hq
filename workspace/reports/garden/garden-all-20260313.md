# Garden Report: all (full HQ sweep)
**Run:** garden-all-20260313 | **Date:** 2026-03-13

## Summary
- Chunks scanned: 4 (personal, indigo, cortex, _orphans)
- Findings: 27 (0 high, 2 medium, 25 low)
- False positives identified: 1 (F-O-005 registry drift — library workers lack worker.yaml by design)
- **Actions taken: 5** (4 garden run archives, 1 INDEX.md fix)
- Escalations: 0 PRDs created

## Actions Taken

| Finding | Action | Detail |
|---------|--------|--------|
| F-O-001 | Archived | `workspace/orchestrator/garden-all-20260310` → `_archive/` |
| F-O-002 | Archived | `workspace/orchestrator/garden-all-20260310-b` → `_archive/` |
| F-O-003 | Archived | `workspace/orchestrator/garden-all-20260311` → `_archive/` |
| F-O-004 | Archived | `workspace/orchestrator/garden-all-20260312` → `_archive/` |
| F-P-003 | Fixed INDEX | Removed stale `voice-style.md` entry from `companies/personal/knowledge/INDEX.md` |

## Logged Findings (No Action)

### Medium Severity
| ID | Path | Signal |
|----|------|--------|
| F-C-001 | `companies/cortex/projects/cortex-app` | `repos/private/cortex-app` not created yet. PRD ready (2026-03-10), awaiting `/execute-task cortex-app/US-001` |
| F-O-005 | `workers/registry.yaml` | FALSE POSITIVE — `codex-engine` and `content-shared` are library dirs without worker.yaml by design. `dev-qa-tester` correctly maps to `dev-team/qa-tester/`. No action needed. |

### Low Severity — Empty Dirs (Expected for new/early-stage companies)
| ID | Path |
|----|------|
| F-P-001 | `companies/personal/settings/` (empty — expected) |
| F-P-002 | `companies/personal/data/` (empty — expected) |
| F-I-001 | `companies/indigo/settings/` (empty — no creds needed yet) |
| F-I-002 | `companies/indigo/policies/` (empty — not yet defined) |
| F-C-002 | `companies/cortex/settings/` (empty — pre-execution) |
| F-C-003 | `companies/cortex/policies/` (empty — pre-execution) |
| F-C-004 | `companies/cortex/data/` (empty — pre-execution) |

### Low Severity — Drift / Orphan
| ID | Path | Signal |
|----|------|--------|
| F-P-004 | `companies/personal/knowledge/profile.md` | Goals section incomplete (placeholder text). Informational. |
| F-C-005 | `companies/cortex/README.md` | Doesn't mention cortex-app project. Low priority. |
| F-C-006 | `workspace/threads/T-20260310-220000-cortex-prd.json` | 3 days old — waiting for cortex-app execution. Not stale yet. |
| F-O-006 | `projects/_archive/distributed-tracking` | Archived project with no prd.json (pre-PRD system). Fine as-is. |
| F-O-007–014 | `projects/e2e-cloud-testing` etc. | 8 completed projects without prd.json — completed before PRD system. Fine as-is. |
| F-O-015 | `workspace/threads/handoff.json` | Stale handoff from cortex-app PRD session. Low priority. |

## Health Summary by Chunk

| Chunk | Findings | Actions | Status |
|-------|----------|---------|--------|
| personal | 4 | 1 (INDEX fix) | ✅ Clean |
| indigo | 2 | 0 | ✅ Clean (early-stage expected) |
| cortex | 6 | 0 | ⚠️ Pending repo creation |
| _orphans | 15 | 4 (archive old runs) | ✅ Clean |

## Next Actions Recommended
1. `repos/private/cortex-app` — create repo and run `/execute-task cortex-app/US-001` to start Tauri app scaffolding
2. `companies/personal/knowledge/profile.md` — complete Goals section via `/personal-interview`
