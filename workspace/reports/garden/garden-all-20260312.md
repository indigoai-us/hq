# Garden Report: all
**Run:** garden-all-20260312 | **Date:** 2026-03-12

## Summary
- Files scanned: ~80 (across personal, indigo, cortex, _orphans)
- Findings: 45 (3 high, 13 medium, 29 low)
- False positives: 2 (scout errors corrected in audit)
- Actions taken: 3 (all indigo)
- Logged not actioned: 4 (require user decision)

## Per-Chunk Results

| Chunk | Findings | Actions | False Positives | Status |
|-------|----------|---------|-----------------|--------|
| personal | 6 | 0 | 1 | clean |
| indigo | 10 | 3 | 0 | fixed |
| cortex | 9 | 0 | 1 | logged |
| _orphans | 20 | 0 | 0 | logged |

## Actions Taken

| Finding | Action | Detail |
|---------|--------|--------|
| F-indigo-003 | update | `companies/indigo/projects/INDEX.md`: e2e-perf status Ready → Complete |
| indigo-prd-uncommitted | commit | `companies/indigo/projects/e2e-perf/prd.json`: all 6 stories passes:true committed |
| indigo-data-untracked | commit | `companies/indigo/data/user-stories-draft.md`: added to git tracking |

Commit: `fc3f3b5` — "chore: garden sweep 2026-03-12 — indigo fixes"

## False Positives Corrected

| ID | Path | Reason |
|----|------|--------|
| F-personal-001 | companies/personal/knowledge/personal | Symlink resolves correctly; repos/private/knowledge-personal exists in HQ |
| cortex-001 | companies/cortex/knowledge | Real git-initialized directory; scout incorrectly flagged as broken symlink |

## Logged (Not Actioned — Require User Decision)

| ID | Severity | Path | Issue |
|----|----------|------|-------|
| cortex-002 | high | companies/cortex/projects/cortex-app/prd.json | PRD describes Option A (Tauri from scratch); brainstorm recommends Option C→B (HQ worker first). PRD needs revision once approach is decided. |
| cortex-008 | medium | companies/cortex/projects/cortex-app/prd.json | References non-existent repo `repos/private/cortex-app`. Needs `git init` + setup before /execute-task runs. |
| cortex-006 | medium | workspace/threads/T-20260310-220000-cortex-prd.json | Thread next steps say "scaffold Tauri app now" (Option A). Conflicts with brainstorm. Needs update once approach decided. |
| projects-orphan | medium | projects/ (8 dirs) | 8 HQ-infra projects (hq-installer, pure-ralph-*, e2e-cloud-testing, etc.) not assigned to any company. May belong under companies/personal/projects/. |

## Skipped (Low Severity / Initialization State)
- companies/personal/{data,settings,policies}: empty placeholder dirs — expected for new company
- companies/indigo/{policies,settings}: empty placeholder dirs — expected
- companies/cortex/{policies,settings,data}: empty placeholder dirs — expected
- All workspace/threads/ files: within 30-day freshness window
- All workspace/reports/: within 60-day freshness window
- All workspace/orchestrator/ completed runs: within 7-day archival window
