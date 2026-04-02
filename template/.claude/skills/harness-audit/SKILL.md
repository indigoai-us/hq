---
# auto-generated: command-skill-bridge
name: harness-audit
description: |
  Score HQ setup quality across 7 categories (hooks, context, gates, persistence, search, security, cost)
user-invokable: true
args:
  - name: input
    description: "[--verbose] [--json]"
    required: false
---

Run the HQ `/harness-audit` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/harness-audit.md`, passing through any user arguments.
