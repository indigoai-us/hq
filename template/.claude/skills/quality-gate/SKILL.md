---
# auto-generated: command-skill-bridge
name: quality-gate
description: |
  Universal pre-commit quality checks (typecheck, lint, test, coverage, dead code) with auto-detection and --fix support
user-invokable: true
args:
  - name: input
    description: "[--fix] [--coverage-min=80] [--deadcode]"
    required: false
---

Run the HQ `/quality-gate` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/quality-gate.md`, passing through any user arguments.
