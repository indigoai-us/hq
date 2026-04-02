---
# auto-generated: command-skill-bridge
name: update-hq
description: |
  Upgrade HQ from the latest hq-starter-kit release
user-invokable: true
args:
  - name: input
    description: "[--check | --from v{X.Y.Z} | v{target}]"
    required: false
---

Run the HQ `/update-hq` command. This skill delegates to the full command implementation.

Load and execute the command file at `.claude/commands/update-hq.md`, passing through any user arguments.
