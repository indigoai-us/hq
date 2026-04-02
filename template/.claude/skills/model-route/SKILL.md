---
# auto-generated: command-skill-bridge
name: model-route
description: |
  Recommend optimal model (Opus 4.6 / Codex GPT-5.4 / Gemini) based on task type
user-invokable: true
args:
  - name: input
    description: "[task description]"
    required: false
---

Run the HQ `/model-route` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/model-route.md`, passing through any user arguments.
