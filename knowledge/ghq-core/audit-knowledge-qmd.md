# Audit: Knowledge & QMD System

> Task: ghq-uik.1.1.4 | Date: 2026-03-03

## Executive Summary

The QMD index is in a **critical state**. The primary `hq` collection points to an old path (`~/hq`) while GHQ now lives at `~/repos/ghq`, causing 96% of indexed files to be orphaned. Embedding coverage is only 40%, and 34 cross-collection duplicate document pairs pollute search results. New knowledge files (created after the repo move) are completely unindexed.

## 1. Embedding Coverage

| Collection | Total Files | Embedded | Coverage | Status |
|------------|-------------|----------|----------|--------|
| hq | 388 (383 unique hashes) | 321 | 84% | Stale -- 96% orphaned |
| indigo-nx | 1438 | 0 | 0% | No embeddings |
| indigo | 15 | 0 | 0% | No embeddings |
| production-house | 7 | 1 | 14% | Nearly zero |
| personal | 3 | 3 | 100% | OK but orphaned path |
| content-co | 1 | 0 | 0% | No embeddings |
| ghq | 1 | 0 | 0% | No embeddings |
| launch-grid | 1 | 0 | 0% | No embeddings |
| ship-it-code | 1 | 0 | 0% | No embeddings |
| **Total** | **1855** | **743** | **40%** | 1500 pending |

**Verdict**: Only the `hq` collection has meaningful embeddings, but most of those embeddings point to files that no longer exist at the indexed path. Vector search (`vsearch`) returns low-quality results (scores ~0.60).

## 2. Stale & Orphaned Documents

### 2a. Root Cause: Collection Path Mismatch

The QMD config (`~/.config/qmd/index.yml`) has stale paths:

| Collection | Configured Path | Actual Path | Status |
|------------|----------------|-------------|--------|
| `hq` | `~/hq` | `~/repos/ghq` | **WRONG** -- old pre-migration path |
| `indigo` | `~/hq/companies/indigo/knowledge` | Does not exist at `~/repos/ghq/companies/` | **WRONG** -- company removed from repo |
| `production-house` | `~/hq/companies/production-house/knowledge` | Does not exist at `~/repos/ghq/companies/` | **WRONG** -- company removed from repo |
| `personal` | `~/hq/companies/personal/knowledge` | Does not exist at `~/repos/ghq/companies/` | **WRONG** -- company removed from repo |
| `content-co` | `~/repos/ghq/companies/content-co/knowledge` | Does not exist | **WRONG** -- company not in repo |
| `ship-it-code` | `~/repos/ghq/companies/ship-it-code/knowledge` | Does not exist | **WRONG** -- company not in repo |
| `ghq` | `~/Documents/GHQ/companies/launch-grid/projects/ghq/knowledge` | Exists (1 file) | OK but unusual path |
| `launch-grid` | `~/repos/ghq/companies/launch-grid/knowledge` | Exists | OK |
| `indigo-nx` | `~/repos/indigo/indigo-nx` | Exists (1438 files) | OK |

Note: `~/hq` still exists on disk (old copy), so `qmd update` re-indexes stale data from it.

### 2b. Orphaned File Counts (hq collection)

Of 388 indexed files in `hq`, only **15 exist** at `~/repos/ghq`. The other **373 are orphaned**.

Orphaned by top-level directory:

| Directory | Orphaned Files | Note |
|-----------|---------------|------|
| `workers/` | 109 | Workers system was removed; replaced by skills |
| `knowledge/` (stale subdirs) | 205 | Old knowledge dirs no longer in repo |
| `companies/` | 33 | Companies moved; only `launch-grid` remains in repo |
| `projects/` | 20 | Old project refs |
| `workspace/` | 7 | Old workspace refs |
| Other (`changelog.md`, `migration.md`, `docs/`) | 3 | |

### 2c. Files on Disk but NOT Indexed

17 knowledge files exist at `~/repos/ghq/knowledge/` but are NOT in any QMD collection:

- `knowledge/ghq-core/INDEX.md` and 8 docs (index-md-spec, loops-schema, project-template, quick-reference, skill-schema, task-schema, audit-company-isolation, audit-directory-structure)
- `knowledge/skills/INDEX.md`, `knowledge/skills/README.md`
- `knowledge/video-gen/INDEX.md`, `knowledge/video-gen/pipeline-reference.md`, `knowledge/video-gen/remotion-patterns.md`
- `knowledge/policies/company-isolation.md`
- `knowledge/INDEX.md`

These are the **current, actively used** knowledge files. They are completely invisible to search.

## 3. Duplicate Content

### 3a. Exact File Duplicates (same hash, different paths)

**34 duplicate document pairs** found:

| Type | Count | Example |
|------|-------|---------|
| `-2.md` copies (ai-security-framework) | 4 | `contributing.md` == `contributing-2.md` |
| `hq/companies/X/knowledge/` vs `X/` collection | 25 | `hq/companies/indigo/knowledge/repos.md` == `indigo/repos.md` |
| `knowledge-hq-core/` vs `hq-core/` | 1 | Both contain `systems-access.md` |
| indigo-nx internal duplicates | 4 | Shared `tsconfig.json`, `next-env-d.ts`, etc. |

### 3b. Impact on Search

Search results return the same content multiple times under different paths (e.g., a query for "company isolation" returns results from both `hq/companies/indigo/knowledge/competitive-landscape.md` AND `indigo/competitive-landscape.md`). This halves effective result diversity.

## 4. Index Health Validation

### 4a. Search Relevance Test Results

| Query | Expected Top Result | Actual Top Result | Relevant? |
|-------|-------|-------|-----------|
| "skill schema definition" | `knowledge/ghq-core/skill-schema.md` | `workers/dev-team/database-dev/skills/create-schema.md` (orphaned) | NO |
| "company isolation policy" | `.claude/policies/company-isolation.md` | `projects/ghq/readme.md` (orphaned) | NO |
| "video generation remotion pipeline" | `knowledge/video-gen/` | `projects/zero-to-shipped/readme.md` (orphaned) | PARTIAL |
| "skill authoring guide" | `knowledge/skills/README.md` | `workers/content-brand/readme.md` (orphaned) | NO |

**Verdict**: Search is fundamentally broken. It returns orphaned files as top results while actual current knowledge is invisible (not indexed).

### 4b. Vector Search Quality

- 81% of documents lack embeddings (`qmd embed` needed)
- Vector search scores are low (~0.60 for relevant queries vs ~0.90+ for BM25)
- Query expansion works but expands queries against stale content

### 4c. Database Metrics

- Index size: 36.4 MB
- Total active documents: 1855
- Inactive (deleted) documents: 6
- Last update: 3 minutes ago (auto-refreshes but from wrong paths)

## 5. Recommendations (Priority Order)

### Critical (Blocks all search utility)

1. **Fix `hq` collection path**: Update `~/.config/qmd/index.yml` to point `hq` at `~/repos/ghq` instead of `~/hq`
2. **Run `qmd cleanup`**: Remove orphaned entries for files that no longer exist at the collection path
3. **Run `qmd update`**: Re-index from corrected paths

### High (Degrades search quality)

4. **Remove stale company collections**: `indigo`, `production-house`, `personal` collections point to `~/hq/companies/` (old path). Either update paths if companies still exist elsewhere, or remove collections
5. **Remove phantom company collections**: `content-co` and `ship-it-code` have no knowledge directories -- remove from config
6. **Run `qmd embed`**: Generate embeddings for the 1500 pending documents
7. **Delete `-2.md` duplicate files**: Remove the 4 `*-2.md` files in `knowledge/ai-security-framework/` (if they still exist at old path)

### Medium (Improves long-term health)

8. **Audit `~/hq` vs `~/repos/ghq`**: Determine if `~/hq` should be decommissioned entirely or if it serves a purpose
9. **Add company-scoped collections for `launch-grid`**: The only company in the repo; ensure its knowledge is searchable with `-c launch-grid`
10. **Set up `qmd update` as a post-commit hook or periodic task**: Prevent drift between disk and index

## Acceptance Criteria Status

| Criterion | Status | Details |
|-----------|--------|---------|
| Embedding coverage analyzed | DONE | 40% overall; 84% for hq (but against stale files) |
| Stale/orphaned docs identified | DONE | 373 orphaned in hq; 17 unindexed on disk |
| Duplicate content flagged | DONE | 34 duplicate pairs across collections |
| Index health validated | DONE | Search broken -- returns orphaned files as top results |
