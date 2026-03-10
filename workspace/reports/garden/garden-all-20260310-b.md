# Garden Report: Full HQ Sweep (Run B)
**Run:** garden-all-20260310-b | **Date:** 2026-03-10

## Summary
- **Chunks processed:** personal, indigo, _orphans
- **Files scanned:** ~64
- **Findings:** 25 total (5 high, 6 medium, 14 low)
- **Validated findings:** 24 (1 false positive removed)
- **Actions taken:** 1 (updated workspace/reports/INDEX.md)
- **Skipped:** 22 (empty dirs expected, false positives, age-based non-issues)
- **Escalations:** 1 (broken symlink — needs human decision)

## Actions Taken

| Finding | Action | Path | Result |
|---------|--------|------|--------|
| F-orphan-013 | UPDATE | workspace/reports/INDEX.md | Regenerated to reflect garden/ subdirectory. Commit: f0f5afa |

## Escalations (Needs Human Decision)

| Finding | Severity | Path | Issue |
|---------|----------|------|-------|
| F-personal-001 | HIGH | companies/personal/knowledge/personal | Symlink → repos/private/knowledge-personal which does not exist. Personal knowledge base is inaccessible. Either create the repo at that path or update/remove the symlink. |

## Skipped Findings

| Reason | Count | Details |
|--------|-------|---------|
| Empty dirs (expected) | 6 | personal/data, personal/settings, indigo/data, indigo/policies, indigo/settings — normal for newly scaffolded companies |
| False positives (team dirs) | 3 | dev-team, gardener-team, content-shared are team containers / library — worker.yaml not required |
| False positive (indigo README) | 1 | indigo-nx is already listed in README.md |
| Scaffold placeholder | 1 | profile.md awaiting /personal-interview — intentional |
| Already archived | 1 | projects/_archive/distributed-tracking correctly placed |
| Accurate despite age | 8 | On-demand workers from content-team, design, QA — age not a staleness signal for on-demand workers |
| Downstream of escalation | 1 | personal/INDEX.md — fix after resolving broken symlink |
| Template reference material | 1 | sample-worker — evergreen |

## Scout Calibration Notes

The scout over-flagged in three areas this run:
1. **Team container dirs** should not trigger missing-worker.yaml (heuristic: dir with only subdirs + README = container)
2. **Library packages** (type: Library in registry.yaml) don't need worker.yaml
3. **On-demand workers** should not be flagged stale by age alone — check skill content for deprecated references instead

## Health: Good
HQ is in good shape. The one actionable escalation (broken personal knowledge symlink) is a setup gap from recent scaffolding, not decay.
