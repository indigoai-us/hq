---
title: "Claude Code Token Optimization Environment Variables"
category: hq-architecture-patterns
tags: ["token-optimization", "claude-code", "context-management", "production-patterns", "reasoning-patterns"]
source: "https://code.claude.com/docs/en/model-config, https://code.claude.com/docs/en/env-vars, https://github.com/anthropics/claude-code/issues/31806, https://claudelog.com/faqs/what-is-adaptive-thinking-in-claude-code/"
confidence: 0.9
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Four env vars control Claude Code's token spend and reasoning depth — understanding their interactions prevents both over-spend and silent quality regressions.

## The Four Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAX_THINKING_TOKENS` | 31,999 | Cap on extended-thinking tokens per request |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` | unset | Disable adaptive reasoning; revert to fixed budget |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | ~83.5% | Context-usage % at which auto-compaction triggers |
| `CLAUDE_CODE_SUBAGENT_MODEL` | (main model) | Model used for spawned subagents |

## How They Interact

### Adaptive Thinking vs. Fixed Budget

**Adaptive thinking** (default on Opus 4.6 and Sonnet 4.6) lets Claude skip thinking entirely on trivial requests and spend more on complex ones. The `CLAUDE_CODE_EFFORT_LEVEL` (or `/effort` command) controls the adaptive budget:

- `low` — minimizes thinking; skips for simple tasks
- `medium` — may skip thinking on straightforward queries
- `high` — almost always thinks deeply (default)
- `max` — always thinks, no token cap (Opus 4.6 only)

When `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` is set, adaptive reasoning is disabled and Claude falls back to a **fixed** budget defined by `MAX_THINKING_TOKENS`. This makes per-request cost predictable but wastes tokens on simple tasks because the budget is always consumed at the same rate regardless of complexity.

**Recommendation**: Leave adaptive thinking enabled (default) and tune via `CLAUDE_CODE_EFFORT_LEVEL`. Only disable adaptive thinking when you need strict latency/cost predictability for a specific workload.

### MAX_THINKING_TOKENS When Adaptive Thinking Is Disabled

When `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1`:
- `MAX_THINKING_TOKENS=0` disables extended thinking entirely (maximum savings, minimum depth)
- `MAX_THINKING_TOKENS=8000–15000` is a practical range: reduces hidden thinking cost ~50–70% vs the 31,999 default while maintaining quality on moderately complex tasks
- `MAX_THINKING_TOKENS=31999` is the default — full depth, highest cost

Cost impact is roughly linear: halving the budget halves thinking-token spend.

### CLAUDE_AUTOCOMPACT_PCT_OVERRIDE

Controls when Claude Code auto-compacts the conversation context. Lower values trigger compaction earlier, which:
- **Preserves quality** across long sessions (more context headroom before forced compaction)
- **Increases cost** slightly (more compaction calls)

**Known bug (issue #31806)**: The variable is capped with `Math.min(userValue, default)`, meaning you **cannot raise the threshold above ~83.5%**. Setting it to 90 or 95 is silently ignored. It only works for lowering the threshold.

Practical values:
- `50` — compact at half-full; good for long agentic sessions where losing context is costly
- `70` — moderate early compaction
- `83` (default) — standard behavior
- Above `83` — silently capped to default (bug, not yet fixed as of March 2026)

### CLAUDE_CODE_SUBAGENT_MODEL

Sets the model for spawned subagents. This only affects subagents that don't have an explicit `model` in their frontmatter — built-in agents are not overridden.

| Value | Cost Impact | Quality Impact |
|-------|-------------|----------------|
| `haiku` | ~80% cheaper than Sonnet | Adequate for exploration, file reading, simple tool use |
| `sonnet` | baseline | Full capability for subagent tasks |
| `opus` | ~2–3× Sonnet cost | Deep reasoning for subagent planning (rarely needed) |

**Recommendation**: `CLAUDE_CODE_SUBAGENT_MODEL=haiku` is safe for most research and exploration subagents. Use `sonnet` (default) when subagents must produce high-quality output that feeds into main-agent decisions.

## Recommended Configuration (Cost-Optimized)

For daily coding work where cost matters but quality must not regress:

```bash
# In ~/.claude/settings.json or shell profile
export MAX_THINKING_TOKENS=10000                  # 70% reduction in thinking cost
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50         # Earlier compaction = better long-session quality
export CLAUDE_CODE_SUBAGENT_MODEL=haiku           # 80% cheaper subagents
# Leave CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING unset (keep adaptive ON)
# Use /effort medium or CLAUDE_CODE_EFFORT_LEVEL=medium for daily tasks
```

Or in `settings.json`:

```json
{
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "50",
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  },
  "model": "sonnet"
}
```

## Cost / Quality Tradeoff Summary

| Setting | Approximate Cost Reduction | Quality Risk |
|---------|---------------------------|--------------|
| `MAX_THINKING_TOKENS=10000` + adaptive off | ~70% on thinking | Low on simple tasks; moderate on very complex ones |
| `CLAUDE_CODE_EFFORT_LEVEL=medium` + adaptive on | ~40–60% vs high effort | Low; adaptive skips thinking on simple queries |
| `CLAUDE_CODE_SUBAGENT_MODEL=haiku` | ~80% on subagent calls | Low for exploration; moderate if subagents make critical decisions |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50` | Slightly higher (more compactions) | Improves quality in long sessions |
| `model=sonnet` | ~60% vs Opus | Low for most coding tasks |

The most impactful lever is the **main model selection** (`sonnet` vs `opus`), followed by **effort level** for adaptive thinking, then subagent model. `MAX_THINKING_TOKENS` only matters when adaptive thinking is disabled.
