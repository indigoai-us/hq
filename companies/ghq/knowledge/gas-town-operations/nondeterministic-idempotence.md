---
title: "Nondeterministic Idempotence (NDI)"
category: gas-town-operations
tags: ["gas-town", "agent-orchestration", "distributed-systems", "agent-loop", "production-patterns"]
source: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04"
confidence: 0.5
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
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

Temporal uses deterministic replay with event sourcing. Gas Town achieves durability through persistent Beads in Git plus GUPP (agents always resume hooked work). Yegge positions NDI as sufficient for developer tooling, not a replacement for production workflow engines.

## Edge Cases

The article acknowledges NDI oversimplifies and has many edge cases. Gas Town is explicitly not a Temporal replacement — it provides "good enough" workflow guarantees for a developer tool context.
