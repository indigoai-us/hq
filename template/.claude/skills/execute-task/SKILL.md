---
# auto-generated: command-skill-bridge
name: execute-task
description: |
  Execute a single task through coordinated worker phases (Ralph pattern)
user-invokable: true
args:
  - name: input
    description: "[project/task-id]"
    required: false
---

Run the HQ `/execute-task` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/execute-task.md`, passing through any user arguments.
