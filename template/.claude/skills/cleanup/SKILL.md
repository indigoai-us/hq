---
# auto-generated: command-skill-bridge
name: cleanup
description: |
  Audit and clean HQ to enforce current policies and migrate outdated structures
user-invokable: true
args:
  - name: input
    description: "[--audit | --migrate | --fix | --consolidate-learnings]"
    required: false
---

Run the HQ `/cleanup` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/cleanup.md`, passing through any user arguments.
