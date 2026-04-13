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

## Rationale

On 2026-02-22, a `/prd` session for the Indigo fundraising deck directly edited `companies/{company}/data/pitch-deck/index.html` (14 edits across 12 slides) instead of creating the PRD project files first. This bypassed HQ's project tracking, worker assignment, handoff, and quality gate systems. The plan mode approval was misinterpreted as permission to implement rather than permission to generate the PRD.
