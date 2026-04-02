---
# auto-generated: command-skill-bridge
name: startwork
description: |
  Start a work session — pick company, project, or repo, gather context
user-invokable: true
args:
  - name: input
    description: "[company-or-project-or-repo]"
    required: false
---

Run the HQ `/startwork` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/startwork.md`, passing through any user arguments.
