# GHQ Integrity Review -- Consolidated Audit Report

> Epic: ghq-uik.1.1 | Task: ghq-uik.1.1.6 | Date: 2026-03-03

## Executive Summary

Five audit areas were reviewed across the GHQ system. The system is **structurally sound** with no critical security vulnerabilities, but has **one critical operational issue** (QMD index pointing to wrong paths, rendering search unusable) and several major/minor issues requiring attention.

**Overall Health: FAIR** -- Core architecture is solid; search infrastructure is broken; housekeeping debt accumulated.

| Area | Status | Critical | Major | Minor |
|------|--------|----------|-------|-------|
| 1. Beads System | Healthy | 0 | 1 | 3 |
| 2. Skills Migration | Complete | 0 | 0 | 0 |
| 3. Company Isolation | Sound | 0 | 0 | 2 |
| 4. Knowledge & QMD | Broken | 1 | 3 | 2 |
| 5. Directory Structure | Good | 0 | 3 | 5 |
| **Totals** | | **1** | **7** | **12** |

## Findings by Severity

### Critical (1)

| ID | Area | Finding | Impact |
|----|------|---------|--------|
| C1 | Knowledge/QMD | QMD `hq` collection points to `~/hq` (old path) instead of `~/repos/ghq`. 96% of indexed files are orphaned. 17 current knowledge files are completely unindexed. Search returns stale/deleted content as top results. | **Search is non-functional.** All `qmd search`, `vsearch`, and `query` commands return misleading results. Any skill or command relying on QMD gets wrong data. |

### Major (7)

| ID | Area | Finding | Impact |
|----|------|---------|--------|
| M1 | Beads | Git hooks incompatible with Dolt backend (`bd doctor` reports error). Hooks are v0.0.0 vs bd v0.57.0. | Automated workflows may not trigger correctly. Fix: `bd hooks install --force` |
| M2 | Knowledge/QMD | 6 stale company collections (`indigo`, `production-house`, `personal`, `content-co`, `ship-it-code`, `ghq`) in QMD config point to nonexistent or wrong paths. Only `launch-grid` and `indigo-nx` are valid. | Pollutes search results with phantom entries. Wastes index space. |
| M3 | Knowledge/QMD | Only 40% embedding coverage (743/1855 documents). 1500 documents pending embedding. | Vector search (`vsearch`) severely degraded. Hybrid `query` mode underperforms. |
| M4 | Knowledge/QMD | 34 duplicate document pairs across collections (same content, different paths). | Search results show duplicate content, halving effective result diversity. |
| M5 | Directory | `knowledge/policies/` missing INDEX.md (only knowledge subdirectory without one). | Breaks index-md-spec convention. Policies not discoverable via standard navigation. |
| M6 | Directory | `companies/{slug}/data/` documented in CLAUDE.md but does not exist for `launch-grid`. | Spec/reality mismatch. Confusing for new contributors. |
| M7 | Directory | `loops/state.jsonl` has duplicate `story_complete` entries and orphaned `skill_start` events without matching `skill_complete`. | State tracking is unreliable. Affects loop resumption logic. |

### Minor (12)

| ID | Area | Finding | Impact |
|----|------|---------|--------|
| m1 | Beads | 3 tasks missing metadata (`ghq-uik`, `ghq-uik.1`, `ghq-uik.1.1`) -- epics/parent tasks lack `acceptanceCriteria`. | Inconsistent schema. `bd lint` reports warnings. |
| m2 | Beads | All 9 tasks missing `## Acceptance Criteria` / `## Success Criteria` in description body (data in metadata JSON only). | Template format mismatch. Lint warnings but no functional impact. |
| m3 | Beads | 1 uncommitted Dolt change in dependencies table. | Minor state drift. |
| m4 | Company | Hardcoded cross-company path `companies/ship-it-code/assets/brand/ship-it-code-watermark.png` in `.claude/skills/video-gen/SKILL.md`. `ship-it-code` not in manifest. | Stale reference. Currently non-functional (path does not exist). Would break if company were re-added. |
| m5 | Company | `company-isolation.md` policy duplicated in both `knowledge/policies/` and `.claude/policies/`. | Maintenance risk -- changes to one copy may not propagate. |
| m6 | Knowledge/QMD | `~/hq` (old repo copy) still exists on disk. `qmd update` re-indexes stale data from it. | Root cause of C1. Must be decommissioned or path corrected. |
| m7 | Knowledge/QMD | Vector search scores low (~0.60 for relevant queries vs ~0.90+ for BM25). | Even when embeddings exist, semantic search quality is poor. |
| m8 | Directory | Command naming inconsistency: `newcompany.md` and `newproject.md` break the hyphenated convention used by all other commands. | Style inconsistency. |
| m9 | Directory | CLAUDE.md structure section does not document `.beads/`, `AGENTS.md`, `README.md`, or `.claude/settings*.json`. | Incomplete documentation for repo structure. |
| m10 | Directory | `.DS_Store` files present at repo root and `.claude/` (gitignored but on disk). | Cosmetic. No functional impact. |
| m11 | Directory | `loops/history.jsonl` tracked in git but completely empty. | Unclear if intentionally empty or missing data. |
| m12 | Directory | Undocumented top-level files not in CLAUDE.md structure spec. | New contributors may not understand purpose. |

## Baseline Metrics

Captured for future audit comparisons.

### Beads System
- Total issues: 15 (9 at audit time + 6 subsequently created)
- Issue types: 2 epics, 13 tasks
- Dependency relationships: 5 blocking + 9 parent-child = 14 total
- Metadata completeness: 67% (6/9 original tasks have full metadata)
- Lint warnings: 9 (all template format)

### Skills System
- Total skills: 9 (architect, backend, code-reviewer, database, enhancement, frontend, full-stack, qa, video-gen)
- Migration status: 100% complete (all SKILL.md, zero skill.yaml)
- Orphaned files: 0 (registry.yaml removed)
- Auto-discovery: functional

### Company Isolation
- Companies registered: 1 (launch-grid)
- Settings isolation: enforced (.claudeignore + .gitignore)
- Credential leakage: none detected
- Label compliance: 100% (all tasks labeled)

### Knowledge & QMD
- Total indexed documents: 1,855
- Embedding coverage: 40% (743/1,855)
- Orphaned documents: 373 (in `hq` collection)
- Unindexed current files: 17
- Duplicate pairs: 34
- Collections: 9 (2 valid, 7 stale/broken)
- Index size: 36.4 MB

### Directory Structure
- Convention compliance: 91% (2 naming exceptions)
- .claudeignore enforcement: complete
- Documented vs actual structure match: partial (3 discrepancies)

## Actionable Recommendations

### Priority 1: Fix Search (addresses C1, M2, M3, M4, m6)

1. **Update QMD config** -- Change `hq` collection path from `~/hq` to `~/repos/ghq` in `~/.config/qmd/index.yml`
2. **Remove stale collections** -- Delete `indigo`, `production-house`, `personal`, `content-co`, `ship-it-code` collections (or update to valid paths if companies exist elsewhere)
3. **Run cleanup cycle** -- `qmd cleanup` to purge orphaned entries, then `qmd update` to re-index
4. **Generate embeddings** -- `qmd embed` for the 1,500 pending documents
5. **Decommission `~/hq`** -- Rename or archive the old repo copy to prevent re-indexing stale data

### Priority 2: Fix Beads Health (addresses M1, m1, m2, m3)

6. **Reinstall git hooks** -- `bd hooks install --force` to fix Dolt backend compatibility
7. **Add metadata to epics** -- Add `acceptanceCriteria` or `successCriteria` to `ghq-uik`, `ghq-uik.1`, and `ghq-uik.1.1`
8. **Commit pending Dolt changes** -- Resolve uncommitted dependency table change

### Priority 3: Housekeeping (addresses M5, M6, M7, m4, m5, m8, m9)

9. **Add INDEX.md to `knowledge/policies/`** -- Align with index-md-spec
10. **Resolve `data/` discrepancy** -- Create `companies/launch-grid/data/` or remove from CLAUDE.md spec
11. **Clean `loops/state.jsonl`** -- Remove duplicate entries, add missing `skill_complete` events
12. **Fix video-gen cross-company reference** -- Parameterize or remove `ship-it-code` path
13. **Deduplicate `company-isolation.md`** -- Keep one canonical copy
14. **Rename commands** -- `newcompany.md` to `new-company.md`, `newproject.md` to `new-project.md`
15. **Update CLAUDE.md structure section** -- Document `.beads/`, `AGENTS.md`, `README.md`, settings files

## Subtask Completion Verification

| Subtask | Title | Status | Report Location |
|---------|-------|--------|-----------------|
| ghq-uik.1.1.1 | Audit Beads System Integrity | Closed | Comment on ghq-uik.1.1.1 |
| ghq-uik.1.1.2 | Audit Skills System Migration | Closed | Commit `ca5d469` (migration itself serves as audit) |
| ghq-uik.1.1.3 | Audit Company Isolation | Closed | `knowledge/ghq-core/audit-company-isolation.md` |
| ghq-uik.1.1.4 | Audit Knowledge & QMD System | Closed | `knowledge/ghq-core/audit-knowledge-qmd.md` |
| ghq-uik.1.1.5 | Audit Directory Structure | Closed | `knowledge/ghq-core/audit-directory-structure.md` |

All 5 subtask dependencies completed. Findings from all 5 areas aggregated in this report.

## Acceptance Criteria Verification

- [x] All subtask findings aggregated -- 5/5 audit areas included
- [x] Issues categorized by severity -- 1 critical, 7 major, 12 minor
- [x] Report includes actionable recommendations -- 15 recommendations in 3 priority tiers
- [x] Baseline metrics captured for future audits -- 5 metric categories documented
