---
# auto-generated: command-skill-bridge
name: goals
description: |
  View and manage OKR structure (objectives, key results) on company boards
user-invokable: true
args:
  - name: input
    description: "[add-objective | add-kr <obj-id> | update-kr <kr-id> <value> | set-status <obj-id> <status> | link-linear <obj-id> <uuid> | link-project <kr-id> <proj-id>] [--company <slug>]"
    required: false
---

Run the HQ `/goals` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/goals.md`, passing through any user arguments.
