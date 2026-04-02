---
# auto-generated: command-skill-bridge
name: idea
description: |
  Capture a project idea on the board without a full PRD
user-invokable: true
args:
  - name: input
    description: "[idea description] [--company <slug>] [--app <repo-name>]"
    required: false
---

Run the HQ `/idea` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/idea.md`, passing through any user arguments.
