---
# auto-generated: command-skill-bridge
name: strategize
description: |
  Strategic prioritization — "what should I work on next?" with optional deep review
user-invokable: true
args:
  - name: input
    description: "[company-slug] [--deep]"
    required: false
---

Run the HQ `/strategize` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/strategize.md`, passing through any user arguments.
