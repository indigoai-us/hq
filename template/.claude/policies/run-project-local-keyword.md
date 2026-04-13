---
id: run-project-local-keyword
title: "run-project.sh: no `local` in top-level loop bodies"
scope: command
trigger: editing scripts/run-project.sh
enforcement: hard
---

## Rule

Never use `local` keyword in the top-level swarm or sequential mode loop bodies of `run-project.sh`. These loops are NOT inside functions — `local` only works inside bash functions and crashes the script at runtime.

Affected regions:
- Sequential mode loop (~line 2745 `while true`)
- Swarm mode loop (~line 2500 `while true`)
- Safe: function `process_swarm_completion()` (~line 2246) — `local` is valid here

Use plain variable assignment (`var=""`) instead of `local var` in loop bodies.

## Rationale

Bug found 2026-03-15: `local checkout_ts_iso` at line 2831 crashed the orchestrator after Codex review completed but before state update. US-011 passed in PRD but state.json never updated, requiring manual repair + re-launch for US-012. Same bug existed in swarm mode loop at line 2605.
