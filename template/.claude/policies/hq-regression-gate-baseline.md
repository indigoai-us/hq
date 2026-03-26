---
id: hq-regression-gate-baseline
title: Regression gate must compare against baseline error count
scope: global
trigger: run-project.sh regression gate execution, quality gate failures
enforcement: hard
version: 1
created: 2026-03-10
updated: 2026-03-10
source: back-pressure-failure
---

## Rule

Regression gates in `run-project.sh` MUST compare error counts against a baseBranch baseline. Only fail when errors **increase** beyond the baseline — pre-existing errors on main are not regressions.

The per-story back-pressure (inside `/execute-task`) already handles this correctly by noting "pre-existing errors only, none from this story." The regression gate must match this behavior.

When diagnosing regression gate failures: always verify whether the failing errors also exist on the base branch before treating them as regressions.

## Rationale

{PRODUCT} has chronic pre-existing TS errors from other teams' PRs (emoji-picker-react, suggested-replies/v2, firecrawl.agent). Running `bun check` raw returns exit code 2 even though none of those errors are caused by the current project's changes. This caused a false-positive regression gate failure after US-003 in the flow-migration-manager project, pausing the orchestrator unnecessarily. Fixed by adding baseline error count capture from baseBranch on first gate run (2026-03-10).
