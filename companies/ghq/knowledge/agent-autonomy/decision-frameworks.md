---
title: "Decision Frameworks for Autonomous Agents"
category: agent-autonomy
tags: ["autonomy", "decision-making", "human-in-the-loop", "escalation", "planning"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

The core challenge of autonomous agents is knowing when to act vs when to ask. Too aggressive and the agent makes costly mistakes; too conservative and it's just a chatbot with extra steps.

## The Autonomy Spectrum

Agents operate on a spectrum from fully supervised to fully autonomous:

1. **Confirmation mode**: Every action requires approval (Claude Code default)
2. **Allowlist mode**: Pre-approved action classes execute freely, novel actions require approval
3. **Budget mode**: Agent acts freely within resource/time/scope budgets, escalates when exhausted
4. **Goal mode**: Agent receives a goal and pursues it autonomously, reporting only outcomes or blockers

GHQ currently operates at level 1-2 via Claude Code's permission system and hooks. Moving toward level 3-4 requires:
- **Reversibility classification**: Can this action be undone? File edits yes, git push maybe, Slack messages no.
- **Blast radius estimation**: Does this affect only my local env, or shared systems?
- **Confidence thresholds**: How certain is the agent about the right action? Low confidence → escalate.

## Goal Decomposition

Autonomous agents need to break high-level goals into executable steps. Common patterns:
- **Plan-then-execute**: Generate full plan, get approval, execute. Simple but brittle — plans rarely survive contact with reality.
- **Rolling horizon**: Plan 2-3 steps ahead, execute, replan based on results. More adaptive but harder to reason about.
- **Hierarchical task networks**: Decompose goals into sub-goals recursively. Each level can be delegated to a subprocess.

GHQ's `ask-claude.sh` subprocess model naturally supports hierarchical decomposition — the orchestrator plans and delegates sub-tasks to focused subprocesses.

## Open Questions

- How should an agent decide its own confidence level?
- What's the right granularity for reversibility classification in a coding context?
- How do you prevent an agent from "planning forever" vs actually executing?
