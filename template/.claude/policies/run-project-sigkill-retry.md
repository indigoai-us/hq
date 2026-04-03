---
id: hq-run-project-sigkill-retry
title: Let auto-retry handle SIGKILL (exit 137) in run-project subprocess
scope: command
trigger: run-project, monitoring
enforcement: soft
version: 1
created: 2026-04-02
updated: 2026-04-02
source: success-pattern
---

## Rule

When a `claude -p` subprocess in `run-project.sh` fails with exit code 137 (SIGKILL), do NOT manually intervene. macOS memory pressure is the most common cause. The orchestrator auto-retries once — attempt 2 usually succeeds.

Only intervene if:
- Attempt 2 also fails with 137 (indicates persistent memory issue — suggest closing apps or reducing concurrency)
- The story consistently takes >15 minutes (may need `model_hint` adjustment)

When monitoring: expect ~10-15 min per story. Output files (`US-XXX.output.json`) remain 0 bytes until the subprocess completes — this is normal, not an error signal.

## Rationale

During the `shopify-webhook-ts-rollout` project (2026-04-02), US-001 attempt 1 was killed after 334s (exit 137). The orchestrator correctly auto-retried and attempt 2 completed successfully in 638s. Manual intervention would have been wasted effort — the built-in retry mechanism handled it.
