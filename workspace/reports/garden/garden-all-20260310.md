# Garden Report: Full HQ Sweep
**Run:** garden-all-20260310 | **Date:** 2026-03-10

## Summary
- **Chunks processed:** 3 (personal, indigo, _orphans)
- **Total findings:** 23 (personal: 3, indigo: 4, orphans: 16)
- **Findings actioned:** 5
- **Actions taken:** 5 (1 merge, 2 archives, 1 update, 1 clean)
- **Escalations:** 0

## Per-Chunk Results

### personal (3 findings, 0 actions)
All low severity — empty dirs and gitignored INDEX.md. Expected for new company setup. **Skipped.**

### indigo (4 findings, 1 action)
| Finding | Action | Before | After |
|---------|--------|--------|-------|
| F-004: README.md drift | Update | "Repos: None yet." | Lists `indigo-nx` repo |

3 low-severity findings (empty dirs) skipped — expected for new company.

### _orphans (16 findings, 4 actions)

| Finding | Sev | Action | Before | After |
|---------|-----|--------|--------|-------|
| F-003: `knowledge-hq-core` duplicate | High | Merge | `systems-access.md` in orphaned `knowledge-hq-core/` dir | Merged into `knowledge/hq-core/systems-access.md`, empty dir removed |
| F-001: `projects/distributed-tracking` | Med | Archive | Active project dir, 42d stale, no prd.json | Moved to `projects/_archive/distributed-tracking/` |
| F-009: `workspace/metrics` | Med | Clean | Missing INDEX.md | Added `workspace/metrics/INDEX.md` |
| F-016: `workspace/ralph-test` | Med | Archive | Test artifacts from Pure Ralph validation | Moved to `workspace/_archive/ralph-test/` |

12 low-severity findings skipped (missing INDEX.md files in workspace dirs, stale knowledge bases 25-43d).

## Skipped Findings (Low Severity)

| Type | Count | Details |
|------|-------|---------|
| Stale knowledge bases | 5 | loom (43d), context-needs (41d), project-context (40d), testing (35d), ai-security-framework (25d) |
| Missing workspace INDEX.md | 6 | checkpoints, drafts, scratch, content-ideas, knowledge-logs, learnings |
| Empty company dirs | 5 | personal/data, personal/settings, indigo/data, indigo/policies, indigo/settings |
| Gitignored INDEX | 1 | personal/knowledge/INDEX.md |
| Empty workspace dir | 1 | workspace/checkpoints |

## Health Assessment

**Overall HQ health: Good.** This is a recently scaffolded HQ with 2 companies. Key issues were:
1. One legacy duplicate knowledge directory (now merged)
2. One abandoned project spec (now archived)
3. Minor README drift (now fixed)
4. Test artifacts from initial Ralph Loop validation (now archived)

No critical issues, no data loss risk, no broken symlinks.
