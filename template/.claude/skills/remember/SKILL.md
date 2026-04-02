---
# auto-generated: command-skill-bridge
name: remember
description: |
  Capture learnings when things don't work right
user-invokable: true
args:
  - name: input
    description: "[what went wrong]"
    required: false
---

Run the HQ `/remember` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/remember.md`, passing through any user arguments.
