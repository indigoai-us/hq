---
# auto-generated: command-skill-bridge
name: prd
description: |
  Plan a project and generate PRD for execution
user-invokable: true
args:
  - name: input
    description: "[project/feature description]"
    required: false
---

Run the HQ `/prd` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/prd.md`, passing through any user arguments.
