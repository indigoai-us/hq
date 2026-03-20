---
title: "Nondeterministic Idempotence (NDI)"
category: gas-town-operations
tags: ["gas-town", "agent-orchestration", "distributed-systems", "agent-loop", "production-patterns", "comparison"]
source: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04, https://cloudnativenow.com/features/gas-town-what-kubernetes-for-ai-coding-agents-actually-looks-like/, https://docs.temporal.io/workflows, https://temporal.io/blog/spooky-stories-chilling-temporal-anti-patterns-part-1"
confidence: 0.75
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T03:30:00Z"
---

Nondeterministic Idempotence (NDI) is Gas Town's durability guarantee, analogous to (but different from) Temporal's deterministic durable replay.

## How It Works

All work is expressed as molecules (chains of Beads in Git). Each step is executed by an AI agent. Because molecules are persistent and Git-backed:

1. Agent crashes mid-step → next session finds the molecule, identifies where it stopped, figures out the fix, and continues.
2. The execution path is fully nondeterministic — each agent session may take different approaches.
3. The outcome converges on the workflow's intended result, because each step has well-specified acceptance criteria.

## Key Insight

The guarantee is not "same path every time" (Temporal's approach) but "same destination eventually" — as long as you keep throwing agent sessions at the molecule. The molecule's acceptance criteria guide self-correction.

## Comparison to Temporal

| Dimension | Gas Town NDI | Temporal Deterministic Replay |
|---|---|---|
| **Durability mechanism** | Persistent molecules in Git + GUPP hook enforcement | Event history + deterministic replay on resume |
| **Path constraint** | Nondeterministic — each session may diverge | Deterministic — every replay must produce identical command sequence |
| **Failure detection** | Implicit — agent re-evaluates acceptance criteria | Explicit — NonDeterminismError raised on history mismatch |
| **Recovery action** | Re-run: new agent session picks up where molecule stopped | Replay: re-execute from last recorded event in history |
| **Code change handling** | Transparent — new agent logic just runs on the current molecule | Requires explicit versioning (patching API or Worker Versioning) |
| **Guarantee strength** | "Eventually finishes if you keep trying" | Exactly-once or at-least-once per configured retry policy |
| **Scope** | Developer tooling (AI coding agents) | General-purpose production workflow engine |

## Temporal Failure Modes in Practice

- **NonDeterminismError on deployment**: If workflow code changes break replay, Temporal raises a `NonDeterminismError`. By default this is treated as a transient `WorkflowTaskFailure` and retries indefinitely — workflows can stall silently unless versioning is applied.
- **Versioning debt**: The patching API requires duplicating code paths and grows unwieldy. Worker Versioning (recommended 2025+) is better but adds operational complexity.
- **History size limits**: Very long-running workflows accumulate large event histories; Temporal uses `ContinueAsNew` to truncate, but workflows must be designed to handle this.
- **Activity non-idempotency**: Activities that have side effects can double-execute if retried; developers must design for idempotency explicitly.

## Gas Town NDI Failure Modes in Practice

- **GUPP non-compliance**: Claude Code is "miserably polite" — it sometimes ignores hooks and waits for user input instead of running them, breaking the GUPP guarantee. Recovery requires a human nudge.
- **Agent instability**: Rogue agents have been observed deleting code unpredictably; early adopters reported needing multiple force-pushes to recover Git state.
- **Convergence is not guaranteed**: NDI says "outcome converges if you keep throwing agents at it" — but acceptance criteria can be poorly specified, causing agents to loop without converging.
- **Cost accumulation**: One early adopter reported ~$100/hour at peak; failed or stuck molecules keep burning tokens if not caught early.
- **Context exhaustion mid-step**: When an agent hits its context limit mid-molecule, the molecule's state must be recoverable from the Beads record. If the bead wasn't flushed before exhaustion, progress may be lost.

## Recovery Guarantees Summary

**Temporal**: Strong guarantees — exactly-once execution with event sourcing, deterministic recovery to a specific point, explicit failure types. Cost: strict determinism in workflow code, versioning ceremony on changes.

**Gas Town NDI**: Weak guarantees — eventual convergence assuming compliant agents, no formal proof of termination. Cost: nondeterminism is a feature (no versioning needed), but silent divergence/loops are harder to detect.

Yegge positions NDI as sufficient for developer tooling, not a replacement for production workflow engines. The two systems solve different problems at different reliability tiers.
