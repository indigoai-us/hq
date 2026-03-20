---
title: "gt seance: Cross-Session State Transfer via /resume"
category: gas-town-operations
tags: ["gas-town", "agent-loop", "context-management", "claude-code", "production-patterns", "multi-agent"]
source: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04, https://github.com/steveyegge/gastown/blob/main/docs/glossary.md, https://gist.github.com/Xexr/3a1439038e4ce34b5e9de020f6cbdc4b"
confidence: 0.75
created_at: "2026-03-20T03:30:00Z"
updated_at: "2026-03-20T03:30:00Z"
---

`gt seance` lets a Gas Town worker query its predecessor in the same role — e.g. the current Mayor asks the last Mayor what it left behind.

## The Problem It Solves

Agent sessions in Gas Town are ephemeral. When context fills or a crash occurs, a new session starts with a clean slate. The GUPP hook and Git-backed beads handle **work continuity** (tasks survive), but they don't recover **cognitive context** — explanations, decisions, and in-flight rationale the predecessor built up but never serialized.

Seance fills this gap by letting the successor agent directly interrogate its predecessor's memory.

## How It Works

### 1. Session ID in the Nudge

When Gas Town sends a startup nudge to a worker, it includes three pieces of data:

| Field | Purpose |
|-------|---------|
| `session_id` (Claude Code session ID) | Enables `/resume` to target the predecessor |
| Gas Town role (e.g. `mayor`, `polecat/toast`) | Identifies the agent identity |
| PID | Uniquely scopes the running session |

Including `session_id` in the nudge gives each `/resume` invocation a unique, role-scoped title — making predecessor sessions discoverable by role rather than by opaque session hash.

### 2. Subprocess Spawn + /resume

The worker executes `gt seance`, which:
1. Spins up a **Claude Code subprocess** (separate from the main worker session)
2. Issues `/resume <predecessor-session-id>` inside that subprocess to revive the predecessor's session
3. Sends a query into the revived session — essentially: *"Where is my stuff? What did you leave for me?"*

The predecessor, now running again in the subprocess, can respond from its own context (which is re-loaded from the session file).

### 3. Response and Termination

The predecessor session replies with handoff context — unfinished decisions, deferred work, important caveats. The successor reads the response, integrates it into its working context, then terminates the seance subprocess. The predecessor session is retired again.

## Relationship to gt handoff

| Mechanism | Timing | Direction | Medium |
|-----------|--------|-----------|--------|
| `gt handoff` | At session end | Predecessor → successor | Hook bead / Git |
| `gt seance` | At session start (if handoff incomplete) | Successor queries predecessor | `/resume` subprocess |

`gt handoff` is proactive: the predecessor serializes its state before dying. `gt seance` is reactive: the successor reaches back when it suspects the handoff was incomplete.

## Discoverability Design

Gas Town's choice to embed `session_id` in the nudge (rather than storing it in a separate registry) follows the system's **Discover, Don't Track** philosophy: current state is authoritative, so the session ID needed for seance is retrieved from the live nudge rather than a maintained log.

## Practical Guidance

- **When to use**: If the hook bead has tasks but no context about why they exist or what approach was being taken, run `gt seance` before diving in.
- **When to skip**: If `gt handoff` ran cleanly and the hook bead includes a summary molecule, the handoff context is likely sufficient.
- **Limitation**: If the predecessor's session file has been pruned or compacted by Claude Code (rolling window), `/resume` may return a session with minimal useful context.
