---
# auto-generated: command-skill-bridge
name: search
description: |
  Search across HQ and indexed repos (qmd-powered semantic + full-text)
user-invokable: true
args:
  - name: input
    description: "<query> [--mode search|vsearch|query] [-n count] [-c collection] [--full]"
    required: false
---

Run the HQ `/search` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/search.md`, passing through any user arguments.
