# INDEX.md Specification

Standard for hierarchical INDEX.md files across GHQ directories.

## Template

```markdown
# {Directory Name}

> Auto-generated. Updated: {YYYY-MM-DD}

| Name | Description |
|------|-------------|
| `item/` | 1-line description |
```

Optional 1-2 line notes section at bottom for usage hints (e.g., "Run skills via `/execute-task`").

## Description Extraction

| File type | Source |
|-----------|--------|
| `.md` | First `#` heading |
| `.yaml` | `description:` field |
| `.json` | `name` or `description` field |
| Directory | File count + purpose summary |

Max 80 chars per description. If no metadata extractable, use filename.

## Variants

- `projects/INDEX.md` — add `Status` column (active/completed/archived)
- `workspace/orchestrator/INDEX.md` — add `Progress` column (e.g. "5/11 45%")
- `workspace/reports/INDEX.md` — add `Date` column

## Locations

### Core Directories

1. `projects/`
2. `knowledge/`
3. `knowledge/ghq-core/`
4. `knowledge/skills/`
5. `knowledge/ralph/`
6. `.claude/skills/`
7. `workspace/orchestrator/`
8. `workspace/reports/`
9. `workspace/threads/`

Root `INDEX.md` also exists but follows its own format.

## Regeneration Rules

- Always full-rewrite (not incremental patch). Idempotent.
- Skip: `INDEX.md` itself, `.DS_Store`, `node_modules/`, dotfiles
- Sort entries: directories first, then files, alphabetical within each group
- Timestamp: use current date in YYYY-MM-DD format

## Update Triggers

| Command | INDEX.md files updated |
|---------|----------------------|
| `/checkpoint` | Root, threads/, + touched knowledge dirs |
| `/handoff` | Root, threads/, orchestrator/, + touched knowledge dirs |
| `/cleanup --reindex` | ALL INDEX.md files (full rebuild) |
| `/prd` | `projects/` |
| `/run-project` | `projects/`, `workspace/orchestrator/` |
| Report generation | `workspace/reports/` |

## qmd

INDEX.md files are excluded from qmd indexing via `.qmdignore`. They are navigation aids, not searchable content.
