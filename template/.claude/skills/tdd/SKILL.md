---
# auto-generated: command-skill-bridge
name: tdd
description: |
  Enforce test-driven development with RED→GREEN→REFACTOR cycle and coverage validation
user-invokable: true
args:
  - name: input
    description: "[task-description]"
    required: false
---

Run the HQ `/tdd` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/tdd.md`, passing through any user arguments.
