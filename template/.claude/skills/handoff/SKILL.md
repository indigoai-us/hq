---
# auto-generated: command-skill-bridge
name: handoff
description: |
  Hand off to fresh session, work continues from checkpoint
user-invokable: true
args:
  - name: input
    description: "[message]"
    required: false
---

Run the HQ `/handoff` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/handoff.md`, passing through any user arguments.
