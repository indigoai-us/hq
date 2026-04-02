---
# auto-generated: command-skill-bridge
name: search-reindex
description: |
  Reindex and re-embed all qmd collections (HQ + repos)
user-invokable: true
args:
  - name: input
    description: "[--force]"
    required: false
---

Run the HQ `/search-reindex` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/search-reindex.md`, passing through any user arguments.
