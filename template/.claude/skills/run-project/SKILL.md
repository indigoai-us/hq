---
# auto-generated: command-skill-bridge
name: run-project
description: |
  Run a project through the Ralph loop - orchestrator for multi-task execution
user-invokable: true
args:
  - name: input
    description: "[project-name] or [--status] or [--help]"
    required: false
---

Run the HQ `/run-project` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/run-project.md`, passing through any user arguments.
