---
# auto-generated: command-skill-bridge
name: brainstorm
description: |
  Explore approaches and tradeoffs before committing to a PRD
user-invokable: true
args:
  - name: input
    description: "[company] <idea description or board idea ID>"
    required: false
---

Run the HQ `/brainstorm` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/brainstorm.md`, passing through any user arguments.
