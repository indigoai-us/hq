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

## Locations

### Core Directories

1. `knowledge/`
2. `knowledge/ghq-core/`
3. `knowledge/skills/`
4. `knowledge/ralph/`
5. `.claude/skills/`

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
| `/create-task` | N/A (tasks in beads, not filesystem) |
| `/run-loop` | N/A (state in loops/state.jsonl) |

## qmd

INDEX.md files are excluded from qmd indexing via `.qmdignore`. They are navigation aids, not searchable content.
