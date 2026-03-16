# CLAUDE.md Auto-Index Specification

Standard for auto-generated Contents sections inside CLAUDE.md files across GHQ directories.

## How It Works

Each indexed directory has a single `CLAUDE.md`. The auto-generated directory listing lives inside a `## Contents` section, identified by the `> Auto-generated` tagline. Human-authored content lives in other sections of the same file.

## Template

For directories with **only** auto-generated content (no human narrative):

```markdown
# {Directory Name}

> Auto-generated. Updated: {YYYY-MM-DD}

| Name | Description |
|------|-------------|
| `item/` | 1-line description |
```

For directories with **human-authored + auto-generated** content:

```markdown
# {Human Title}

{Human intro paragraph.}

## Contents

> Auto-generated. Updated: {YYYY-MM-DD}

| Name | Description |
|------|-------------|
| `item/` | 1-line description |

## {Next Human Section}
...
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

1. `knowledge/CLAUDE.md`
2. `knowledge/ghq-core/CLAUDE.md`
3. `knowledge/ralph/CLAUDE.md`
4. `.claude/skills/CLAUDE.md`

Plus all `companies/*/knowledge/CLAUDE.md` and `companies/*/projects/*/knowledge/CLAUDE.md`.

### Exceptions (still use README.md)

These directories keep `README.md` instead of `CLAUDE.md`:

| Directory | Reason |
|-----------|--------|
| `/` (root) | Public-facing project overview; read by humans on GitHub |
| `loops/` | Substantial schema documentation; human reference material |
| `knowledge/skills/` | 186-line skill authoring guide; human reference material |

## Regeneration Rules

- For auto-only CLAUDE.md files: full-rewrite. Idempotent.
- For mixed CLAUDE.md files: replace only the `## Contents` section (from `> Auto-generated` through the table, stopping at the next `##` heading or EOF). Preserve all other content.
- Skip listing: `CLAUDE.md` itself, `.DS_Store`, `node_modules/`, dotfiles
- Sort entries: directories first, then files, alphabetical within each group
- Timestamp: use current date in YYYY-MM-DD format

## Update Triggers

| Command | CLAUDE.md indexes updated |
|---------|--------------------------|
| `/checkpoint` | Root, threads/, + touched knowledge dirs |
| `/handoff` | Root, threads/, orchestrator/, + touched knowledge dirs |
| `/cleanup --reindex` | ALL indexed CLAUDE.md files (full rebuild) |
| `/plan` | N/A (tasks in beads, not filesystem) |
| `/run-loop` | N/A (state in loops/state.jsonl) |

## qmd

Auto-generated Contents sections in CLAUDE.md are navigation aids. The CLAUDE.md file itself is indexed by qmd (unlike the old INDEX.md which was excluded).
