# Audit: Directory Structure

**Task:** ghq-uik.1.1.5 -- Audit Directory Structure
**Date:** 2026-03-03
**Status:** Complete

## Summary

Scanned all GHQ directories against the documented structure in CLAUDE.md. Found 8 issues across 3 severity levels. No critical security violations. The `.claudeignore` is properly enforced. Naming conventions are mostly consistent with two exceptions.

## Documented Structure (CLAUDE.md)

```
.claude/          commands/, skills/, hooks/, policies/
companies/        {slug}/settings/, knowledge/, data/, projects/
knowledge/        shared knowledge (skills framework, etc.)
loops/            execution state (state.jsonl, history.jsonl)
```

## Findings

### Critical (0)

None.

### Major (3)

| # | Location | Issue | Detail |
|---|----------|-------|--------|
| M1 | `knowledge/policies/` | Missing INDEX.md | Every knowledge subdirectory should have an INDEX.md per the index-md-spec. `knowledge/policies/` is the only subdirectory without one. |
| M2 | `companies/{slug}/data/` | Missing directory | CLAUDE.md documents `companies/{slug}/data/` in the structure spec but `launch-grid` has no `data/` directory. Either create it or update the spec. |
| M3 | `loops/state.jsonl` | Duplicate and orphaned entries | Three stories (`ghq-uik.1.1.1`, `1.1.2`, `1.1.3`) each have duplicate `story_complete` entries. Four `skill_start` events have no matching `skill_complete` (`1.1.1`, `1.1.2`, `1.1.4`, `1.1.5`). Indicates incomplete cleanup from prior runs. |

### Minor (5)

| # | Location | Issue | Detail |
|---|----------|-------|--------|
| m1 | `.claude/commands/` | Naming inconsistency | `newcompany.md` and `newproject.md` use concatenated naming while all other commands use hyphenated (`create-task`, `execute-task`, `run-loop`). Should be `new-company.md` and `new-project.md`. |
| m2 | CLAUDE.md structure section | Undocumented items | Top-level `AGENTS.md`, `README.md`, `.beads/` are not mentioned in the structure spec. `.claude/settings.json` and `.claude/settings.local.json` are not listed under `.claude/`. |
| m3 | `.claude/policies/` and `knowledge/policies/` | Duplicate file | `company-isolation.md` exists identically in both locations. Ambiguous which is the source of truth. |
| m4 | `.DS_Store` | OS artifacts present | `.DS_Store` found at repo root and inside `.claude/`. Properly gitignored but still present on disk. |
| m5 | `loops/history.jsonl` | Empty file | `history.jsonl` is tracked in git but completely empty. Either populate it or document that it starts empty. |

## Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| All top-level directories scanned | Pass | Scanned: `.claude/`, `companies/`, `knowledge/`, `loops/`, `.beads/`, plus all top-level files |
| `.claudeignore` compliance verified | Pass | Pattern `companies/*/settings/**` correctly shields settings. No settings content accessible via Claude tooling. Symlinked `launch-grid/settings/` directory exists but is empty and shielded. |
| Naming conventions validated | Partial | All lowercase convention followed. Two command files (`newcompany`, `newproject`) break the hyphenation pattern. Skills, knowledge dirs, and other commands are consistent. |
| Unexpected files/directories flagged | Pass | Flagged: `.DS_Store` (2 locations), undocumented top-level files, missing `data/` directory, duplicate policy file. |

## E2E Test Results

| Test | Status | Notes |
|------|--------|-------|
| Scan `.claude/`, `companies/`, `knowledge/`, `loops/` for anomalies | Pass | Anomalies found and documented above |
| Verify no `settings/` content is accessible | Pass | `companies/launch-grid/settings/` is empty and shielded by `.claudeignore` |
| Check for files violating naming conventions | Pass | Found `newcompany.md`, `newproject.md` inconsistencies |
| List any directories not documented in CLAUDE.md | Pass | `.beads/` not documented in structure section; `data/` documented but missing |

## Recommendations

1. **Add INDEX.md to `knowledge/policies/`** -- Align with all other knowledge subdirectories.
2. **Resolve `data/` discrepancy** -- Either create `companies/launch-grid/data/` or remove `data/` from the CLAUDE.md structure spec.
3. **Clean up `loops/state.jsonl`** -- Remove duplicate `story_complete` entries and add missing `skill_complete` events (or document that incomplete entries are acceptable for interrupted runs).
4. **Standardize command naming** -- Rename `newcompany.md` -> `new-company.md` and `newproject.md` -> `new-project.md`.
5. **Consolidate duplicate policy** -- Keep `company-isolation.md` in one canonical location and reference it from the other.
6. **Update CLAUDE.md structure section** -- Add `.beads/`, `AGENTS.md`, `README.md`, and `.claude/settings*.json` to the documented structure.
