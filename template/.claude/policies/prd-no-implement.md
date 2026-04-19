---
id: hq-prd-no-implement
title: "/prd NEVER implements — only creates PRD files"
scope: command
trigger: when /prd command is invoked
enforcement: hard
version: 1
created: 2026-02-22
updated: 2026-02-22
source: user-correction
---

## Rule

When `/prd` is invoked, the ONLY outputs are:
1. `projects/{name}/prd.json` — source of truth with user stories
2. `projects/{name}/README.md` — human-readable view
3. Orchestrator state.json registration
4. Company board.json registration

NEVER edit, modify, or create any files outside the `projects/{name}/` directory during a `/prd` session. The `/prd` command is a PLANNING tool, not an EXECUTION tool.

Even if plan mode approval is given, the plan MUST describe the PRD structure, NOT the direct edits to target files. Plan mode approval during `/prd` means "approved to generate the PRD files" — NOT "approved to implement the changes."

Implementation happens via `/execute-task` or `/run-project` AFTER the PRD is created.

