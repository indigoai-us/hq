---
title: "GUPP: Gastown Universal Propulsion Principle"
category: gas-town-operations
tags: ["agent-loop", "gas-town", "agent-architecture", "context-management", "coordination"]
source: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04"
confidence: 0.5
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

GUPP is Gas Town's core mechanism for keeping work moving across agent session boundaries. It solves the fundamental problem that Claude Code sessions end (context fills, crashes, compactions) but work must continue.

## The Principle

**If there is work on your hook, YOU MUST RUN IT.**

Every Gas Town worker has a persistent identity (Agent Bead in Git) with a Hook — a special pinned bead where molecules (workflows) are hung via `gt sling`. When a new session starts for that agent role, GUPP dictates it must check its hook and resume work immediately.

## Persistence Chain

- **Agent** = a Bead (persistent identity in Git), not a session. Sessions are cattle.
- **Hook** = a pinned Bead for that agent, where work molecules hang.
- **Molecule** = a chain of Beads in Git.

All three are Git-backed. Agent crashes don't lose work — the next session picks up the molecule where it left off.

## The GUPP Nudge

In practice, Claude Code is often too polite — it waits for user input instead of autonomously checking its hook. Workaround: patrol agents send `gt nudge` (tmux notification) ~30-60 seconds after startup, kicking the worker into action. The hierarchical heartbeat from Deacon downward ensures nudges propagate within ~5 minutes.

## Handoffs

`gt handoff` (or `/handoff` or "let's hand off") triggers graceful cleanup: the worker optionally sends itself work, then restarts its session in tmux. Combined with GUPP, this means continuous work across unlimited sessions.

## gt seance

Workers can communicate with their predecessors via `gt seance`, which uses Claude Code's `/resume` to revive old sessions. Useful when handoff context gets lost. Session IDs are included in nudge messages for discoverability.
