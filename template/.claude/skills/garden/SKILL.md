---
# auto-generated: command-skill-bridge
name: garden
description: |
  Audit and clean HQ content — detect stale, duplicate, and inaccurate information
user-invokable: true
args:
  - name: input
    description: "[scope] or [--resume run-id] or [--status]"
    required: false
---

Run the HQ `/garden` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/garden.md`, passing through any user arguments.
