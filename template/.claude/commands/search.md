---
description: Search across HQ and indexed repos (qmd-powered semantic + full-text)
allowed-tools: Read, Grep, Bash(qmd:*), Bash(grep:*), Bash(ls:*)
argument-hint: <query> [--mode search|vsearch|query] [-n count] [-c collection] [--full]
visibility: public
---

# /search - HQ + Codebase Search

Run the `/search` skill to perform qmd-powered semantic + full-text search across HQ and indexed codebases.

**Query:** $ARGUMENTS

## Steps

1. Load the search skill from `.claude/skills/search/SKILL.md`
2. Parse `$ARGUMENTS` for query, `--mode`, `-n`, `-c`, `--full` flags
3. Auto-detect company collection from cwd if `-c` not provided; execute qmd search and display ranked results

## After Search

- For exact pattern matches (imports, function names), prefer Grep directly
- Run `/search-reindex` after adding new content to refresh embeddings
