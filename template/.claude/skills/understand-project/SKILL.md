---
# auto-generated: command-skill-bridge
name: understand-project
description: |
  Deep-dive project understanding through analysis + interview
user-invokable: true
args:
  - name: input
    description: "<project-name> [--repo <path>]"
    required: false
---

Run the HQ `/understand-project` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/understand-project.md`, passing through any user arguments.
