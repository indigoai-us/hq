---
# auto-generated: command-skill-bridge
name: run
description: |
  Run a worker or list available workers
user-invokable: true
args:
  - name: input
    description: "[worker-id] [skill] [args]"
    required: false
---

Run the HQ `/run` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/run.md`, passing through any user arguments.
