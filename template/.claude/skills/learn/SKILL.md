---
# auto-generated: command-skill-bridge
name: learn
description: |
  Auto-capture and classify learnings from task execution
user-invokable: true
args:
  - name: input
    description: "[json-event or "rule description"]"
    required: false
---

Run the HQ `/learn` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/learn.md`, passing through any user arguments.
