---
# auto-generated: command-skill-bridge
name: dashboard
description: |
  Generate a visual HTML goals dashboard for a company
user-invokable: true
args:
  - name: input
    description: "[company-slug | --all]"
    required: false
---

Run the HQ `/dashboard` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/dashboard.md`, passing through any user arguments.
