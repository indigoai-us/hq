---
# auto-generated: command-skill-bridge
name: recover-session
description: |
  Recover dead sessions that hit context limits without running /handoff
user-invokable: true
args:
  - name: input
    description: "[--days N] [--session UUID] [--dry-run]"
    required: false
---

Run the HQ `/recover-session` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/recover-session.md`, passing through any user arguments.
