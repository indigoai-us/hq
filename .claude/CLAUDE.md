# GHQ

Personal OS for orchestrating work across companies and AI.

## Structure

```
.claude/          commands/, skills/, hooks/
companies/        {slug}/settings/, knowledge/, projects/
knowledge/        shared knowledge (skills framework, etc.)
loops/            execution state (state.jsonl, history.jsonl)
README.md         project overview
```

## Rules

- **Context diet**: Never pre-load. Read only what the current task requires.
- **Skill-first**: Load `SKILL.md` before specialized tasks. Load command `.md` before running commands. Never pre-load.
- **Company rules**: Read `companies/{slug}/RULES.md` before working on anything for that company.
- **Git workflow**: Work on `main` or worktrees only -- never feature branches.
- **Company isolation**: `companies/manifest.yaml` maps ownership. Never cross-contaminate credentials, knowledge, or deploy targets.
- **`.claudeignore` awareness**: `companies/*/settings/**` is hidden. Never attempt to read shielded paths.
- **Sub-agent commits**: Each sub-agent MUST commit its own work before completing.
- **No AI attribution**: Never include Co-Authored-By or AI names in commit or pull request messages.
- **README.md index upkeep**: When creating or deleting files/directories inside an indexed directory, update the auto-generated Contents section in its `README.md` in the same commit.

## Search (qmd)

```
qmd search "<query>" --json -n 10        # BM25 keyword (fast, default)
qmd vsearch "<query>" --json -n 10       # semantic/conceptual
qmd query "<query>" --json -n 10         # hybrid BM25 + vector (best, slower)
```

Add `-c <collection>` to scope searches. Use `qmd` before Grep for exploration.

## Learned Rules

<!-- Max 10 rules. When full, evict the least-referenced rule. -->
<!-- Scoped rules go in skills, not here. -->

- **ALWAYS**: `companies/` contains symlinks. Use `--follow-links` (Grep tool) or `-L` (find) to traverse them.
