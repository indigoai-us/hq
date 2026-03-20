---
title: "GUPP: Gastown Universal Propulsion Principle"
category: gas-town-operations
tags: ["agent-loop", "gas-town", "agent-architecture", "context-management", "coordination", "production-patterns"]
source: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04, https://gist.github.com/Xexr/3a1439038e4ce34b5e9de020f6cbdc4b, https://re-cinq.com/blog/multi-agent-orchestration-bmad-claude-flow-gastown"
confidence: 0.75
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T03:30:00Z"
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

## Why Prompting Must Enforce GUPP

LLMs are trained as helpful assistants: they wait politely for human instructions. Gas Town inverts this — workers are gears in a machine, not assistants. This creates a gap: a freshly started Claude Code session naturally waits for the user to say something, rather than checking its queue and getting to work.

The GUPP prompting strategy addresses this directly:
- Worker CLAUDE.md files are written to **override the assistant posture** — agents are told they are part of a multi-agent system, their job is to check the hook and run whatever is there
- Prompting is described as "so strict about GUPP and the theory of operation of Gas Town" that workers will **ignore what you type** unless you are explicitly overriding hook instructions
- No exact system prompt text has been published; the architecture description is public but the prompt engineering lives in the source repo

## Physics Over Politeness

"Physics over politeness" is the design philosophy: agents must prioritize execution over courtesy. A worker that finds work must run it — not ask, not confirm, not wait. The phrase encapsulates the shift from assistant-mode (responsive) to worker-mode (autonomous).

## The GUPP Nudge

In practice, Claude Code is often too polite — it waits for user input instead of autonomously checking its hook. Workarounds:

| Mechanism | Description |
|-----------|-------------|
| **Patrol nudge** | Deacon/patrol agents send `gt nudge` (tmux notification) ~30-60 seconds after startup |
| **Manual nudge** | `gt nudge <session>` sends a real-time wake-up message |
| **Hierarchical heartbeat** | Deacon → Witness → workers; ensures nudges propagate within ~5 minutes |

## Codex Runtime Fallback

For runtimes without native hook support (e.g., Codex), Gas Town provides a startup sequence:
1. `gt prime` — sends the role's identity context
2. `gt mail check --inject` — injects any pending mail into the session
3. `gt nudge deacon session-started` — triggers the hierarchical nudge chain

Codex users should also add `project_doc_fallback_filenames = ["CLAUDE.md"]` in `~/.codex/config.toml` so role instructions are picked up automatically.

## Handoffs

`gt handoff` (or `/handoff` or "let's hand off") triggers graceful cleanup: the worker optionally sends itself work, then restarts its session in tmux. Combined with GUPP, this means continuous work across unlimited sessions.

## gt seance

Workers can communicate with their predecessors via `gt seance`, which uses Claude Code's `/resume` to revive old sessions. Useful when handoff context gets lost. Session IDs are included in nudge messages for discoverability.
