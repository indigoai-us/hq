---
# auto-generated: command-skill-bridge
name: newcompany
description: |
  Scaffold a new company with full infrastructure
user-invokable: true
args:
  - name: input
    description: "[company-slug]"
    required: false
---

Run the HQ `/newcompany` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/newcompany.md`, passing through any user arguments.
