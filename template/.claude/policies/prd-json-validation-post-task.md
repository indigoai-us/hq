---
id: prd-json-validation-post-task
title: Validate PRD JSON after sub-agent story writes
scope: command
trigger: run-project, execute-task
enforcement: hard
created: 2026-03-26
---

## Rule

After any sub-agent writes to prd.json (setting `passes`, adding `notes`, updating `files`), validate the JSON is parseable before proceeding to the next story. Use: `python3 -c "import json; json.load(open('prd.json'))"`.

If validation fails, fix the JSON (typically a missing closing `}` on the last-modified story object) before continuing.

## Rationale

ROAD-008 in `{company}-platform` (2026-03-26): sub-agent wrote a `notes` field but omitted the closing `}` of the story object. The corrupted PRD caused `jq` parse errors that crashed the orchestrator mid-completion-flow (after ROAD-008 but before the ROAD-004 retry and completion summary). Required manual PRD fix and orchestrator resume.
