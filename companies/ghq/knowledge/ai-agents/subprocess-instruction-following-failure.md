---
title: "Why Subprocess Agents Ignore CLAUDE.md Fallback Instructions When Blocked"
category: ai-agents
tags: ["agent-loop", "claude-code", "context-management", "autonomous-coding", "failure-modes", "permissions"]
source: "https://code.claude.com/docs/en/sub-agents, https://github.com/anthropics/claude-code/issues/7777, https://github.com/anthropics/claude-code/issues/3377, https://medium.com/@ilyas.ibrahim/the-4-step-protocol-that-fixes-claude-codes-context-amnesia-c3937385561c"
confidence: 0.75
created_at: "2026-03-24T22:00:00Z"
updated_at: "2026-03-24T22:00:00Z"
---

Subprocess agents load CLAUDE.md but deprioritize its fallback instructions when blocked by permissions.

## The Problem

When a `claude -p` subprocess hits a permission wall (e.g., Write tool denied by sandbox), it enters a problem-solving loop — retrying with alternative tools, different paths, or workarounds. CLAUDE.md instructions like "if blocked, call `report_issue.sh`" are loaded into context but consistently ignored. The agent exhausts its retry budget, then produces a user-facing error message instead of following the documented fallback procedure.

Observed in GHQ agent run `20260324_165107_slef`: agent was blocked on Write tool 4 times, tried multiple workarounds, then gave up with a user-facing message — never calling `report_issue.sh` as CLAUDE.md instructs.

## Root Causes

### 1. Attention Competition Under Stress

When an agent encounters a blocking error, its attention narrows to the immediate obstacle. The model enters a "fix the error" mode where it prioritizes tool-use strategies over consulting CLAUDE.md rules. Fallback instructions sit in the system/context portion of the prompt, which loses influence as the conversation grows with retry attempts and error messages.

### 2. CLAUDE.md Instructions Are Advisory, Not Enforced

Claude treats CLAUDE.md as guidance rather than hard constraints. There is no runtime mechanism that forces an agent to execute a specific action on failure — unlike hooks (which are enforced by the harness), CLAUDE.md rules depend entirely on the model choosing to follow them. Research and bug reports confirm this is a systemic issue: Claude "consistently fails to systematically apply methodology instructions present in CLAUDE.md context."

### 3. Negative/Conditional Instructions Are Weaker

Instructions of the form "when X happens, do Y" (conditional fallbacks) are harder for LLMs to follow reliably than unconditional positive instructions. The model must: (1) recognize it's in the trigger condition, (2) recall the fallback action, and (3) choose it over its default problem-solving behavior. Each step is a point of failure.

### 4. Context Window Degradation

Each failed retry adds tool calls and error messages to the context, pushing CLAUDE.md further from the model's attention window. By the time the agent "gives up," the original instructions may be 50+ messages back, severely reducing their influence.

## Mitigations

### Use Hooks Instead of CLAUDE.md for Critical Fallbacks

Hooks are enforced by the harness, not the model. A `Stop` hook or `PostToolUse` hook can detect failure patterns and trigger `report_issue.sh` automatically — the agent cannot skip it.

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "./scripts/check-and-report-failure.sh"
      }]
    }]
  }
}
```

### Reinject Instructions via System Reminders

Use a `PreToolUse` hook to inject reminders about fallback behavior when errors accumulate. This keeps the instruction close to the model's current attention window.

### Make the Fallback the Default, Not the Exception

Instead of "if blocked, do X," structure the agent prompt so that reporting is the default exit behavior. Frame it as: "After completing your task, run `report_issue.sh` with status. This is your final action regardless of success or failure."

### Limit Retry Budget

Set `--max-turns` low so the agent doesn't spend many turns in the retry loop. Fewer turns = less context dilution = better instruction retention.

### Use Positive, Prominent Phrasing

Place the instruction early and phrase it as an unconditional requirement: "ALWAYS run `report_issue.sh` as your last action" rather than "if this failure is blocking, please read settings... if you believe it's a permission issue, report it."

## Key Insight

The fundamental issue is that **CLAUDE.md is a prompting mechanism, not an enforcement mechanism**. For critical operational behaviors (like failure reporting), relying on the model to follow instructions is insufficient. Use the harness layer (hooks, permission modes, tool restrictions) for anything that must happen reliably.
