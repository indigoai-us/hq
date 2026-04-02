---
# auto-generated: command-skill-bridge
name: checkpoint
description: |
  Save checkpoint and check context status
user-invokable: true
args:
  - name: input
    description: "[task-id]"
    required: false
---

Run the HQ `/checkpoint` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/checkpoint.md`, passing through any user arguments.
