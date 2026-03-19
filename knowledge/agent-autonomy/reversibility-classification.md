---
title: "Reversibility Classification for Agent Actions"
category: agent-autonomy
tags: ["production-patterns", "agent-security", "human-in-the-loop", "decision-making", "autonomy", "blast-radius"]
source: "https://medium.com/@raktims2210/the-enterprise-ai-control-plane-why-reversible-autonomy-is-the-missing-layer-for-scalable-ai-8dd1edef2ab5, https://noma.security/blog/the-risk-of-destructive-capabilities-in-agentic-ai/, https://dl.acm.org/doi/full/10.1145/3708359.3712153, https://agentsecurity.com/blog/governing-agentic-ai"
confidence: 0.82
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Production agents classify every action by reversibility to gate autonomy — irreversible actions demand human confirmation.

## The Core Idea

Reversibility is the primary axis for deciding how much autonomy an agent gets on any given action. Rather than a blanket permission level for the whole agent, each *action type* carries its own reversibility tier, which maps to a required confirmation level.

This prevents over-restriction (demanding human approval for every file read) while maintaining safety for high-stakes operations (financial transactions, sends, deletions).

## Reversibility Tiers

| Tier | Examples | Permission Gate |
|------|----------|----------------|
| **0 — Read-only** | file reads, API queries, search | Fully autonomous |
| **1 — Reversible write** | file edits, draft creation, staging deploys | Autonomous with logging |
| **2 — Soft irreversible** | git push, PR creation, config changes | Confirmation or second-model review |
| **3 — Hard irreversible** | email sends, financial transfers, deletes, production deploys | Mandatory human-in-the-loop |

> Some actions are *time-sensitive reversible*: they can be undone only within a window (e.g., an API call that can be cancelled for 30 seconds). These are treated as Tier 3 in practice.

## Blast Radius × Reversibility Matrix

Reversibility alone isn't sufficient — scope matters too. A reversible action with huge blast radius (bulk file rename across a shared repo) should still gate on confirmation.

```
               Local scope    Shared/external scope
Reversible     → autonomous   → log + notify
Irreversible   → confirm      → hard block / human gate
```

Excessive permissions multiply blast radius: if an agent is prompt-injected or misconfigured, its permissions define the maximum damage surface.

## Implementation Patterns

### 1. Action Annotation

Tools and capabilities declare their reversibility tier in their definition:

```python
@tool(reversibility=Tier.REVERSIBLE_WRITE, scope="local")
def write_file(path: str, content: str): ...

@tool(reversibility=Tier.HARD_IRREVERSIBLE, scope="external")
def send_email(to: str, body: str): ...
```

The agent runtime checks the tier before execution and routes to the appropriate gate.

### 2. Undo Stack

For Tier 1 actions, agents maintain an undo stack. Before each write, state is snapshotted (or a compensating action registered). On failure, rollback replays compensating actions in reverse order.

### 3. Dry-Run Mode

Agents can be run in dry-run mode where Tier 2+ actions are simulated and logged rather than executed. Output is reviewed before a live run. Claude Code does this implicitly — commands are shown before execution.

### 4. Per-Call Policy Check

Each tool call passes through a policy layer that evaluates: user identity, current context, and the action's tier. The policy can escalate automatically:

```
if action.tier >= Tier.SOFT_IRREVERSIBLE and not context.user_confirmed:
    raise ConfirmationRequired(action)
```

### 5. Least-Privilege Capability Binding

Grant read-only by default; actuation only for narrow, well-scoped operations. Tier 3 tools should never be in the default tool set — they require explicit opt-in per session.

## Anthropic's Minimal Footprint Principle

Claude's model spec encodes reversibility preference: agents should *prefer reversible over irreversible actions* and *err on the side of doing less* when uncertain about intended scope. This is implemented at the model level as a prior, complemented by runtime gates.

## Signals That an Action Needs Reclassification

- Users frequently undo an "autonomous" action → reclassify up a tier
- Human gates are always approved without review → reclassify down
- Action has downstream side effects not captured in its tier (e.g., a "file write" that triggers a webhook) → annotate and elevate

## Relation to Confidence Calibration

Reversibility tier and confidence interact: a low-confidence Tier 1 action may still warrant escalation. A practical heuristic: `effective_tier = base_tier + (1 if confidence < 0.7 else 0)`.
