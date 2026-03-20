---
title: "Convoys, Patrols, and Swarms"
category: gas-town-operations
tags: ["gas-town", "agent-orchestration", "task-management", "coordination", "production-patterns"]
source: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04, https://github.com/steveyegge/gastown/blob/main/CHANGELOG.md, https://github.com/steveyegge/gastown/blob/main/docs/glossary.md"
confidence: 0.8
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T03:25:00Z"
---

## Convoys

A Convoy is Gas Town's ticketing/work-order unit. It wraps a bunch of work into a trackable delivery unit. Every `gt sling` — from a single polecat task to a big swarm — gets wrapped in a Convoy.

- Convoys are special beads (not epics — tracked issues aren't children, they already have parents).
- Multiple swarms can attack a Convoy before it finishes.
- Convoys show in a Charmbracelet TUI dashboard with expanding trees.
- When a Convoy lands (completes), the Overseer gets notified.
- The Convoy event poller backs off on Dolt errors (preventing thundering-herd on DB failures).

## Patrols

Patrols are ephemeral wisp workflows that patrol workers (Refinery, Witness, Deacon) run in a loop.

- **Refinery patrol**: Preflight cleanup → process Merge Queue until empty → postflight handoff. Plugins coming for MQ reordering.
- **Witness patrol**: Check polecat wellbeing → check refineries → peek at Deacon → run rig-level plugins.
- **Deacon patrol**: Run town-level plugins → manage handoff protocol → delegate complex work to Dogs.

### Exponential Backoff

Patrols implement exponential backoff: when a patrol loop finds no work, the agent waits progressively longer before starting the next patrol. This prevents idle agents from busy-polling and consuming unnecessary resources.

### Wake-Up Triggers

A sleeping town (all workers in backoff) can be woken by:

| Trigger | Mechanism |
|---------|-----------|
| **Any mutating `gt` command** | `gt sling`, `gt start`, etc. — immediately wakes relevant workers |
| **Any mutating `bd` command** | Beads task mutations propagate a wake signal |
| **`gt nudge <session>`** | Sends a tmux notification directly; kicks the worker into reading mail and hook |
| **Boot Dog (5-min daemon check)** | Daemon wakes Boot every 5 minutes to inspect Deacon health |
| **Mail delivery** | Auto-nudge fires when mail arrives in an idle agent's queue |

### Boot Dog — Monitoring the Monitor

Boot is a special Dog that runs as a watchdog for the Deacon:

- The **daemon** wakes Boot every **5 minutes**, independent of patrol backoff.
- Boot checks the Deacon and decides one of four actions: **heartbeat**, **nudge**, **restart**, or **leave alone**.
- Boot is **ephemeral** — spawns fresh each daemon tick, runs `gt boot triage`, then exits.
- This creates a chain-of-accountability: daemon → Boot → Deacon → Witness → polecats.

The Boot Dog exists because the daemon's direct heartbeats were interrupting the Deacon too aggressively; Boot acts as a buffer that decides whether the Deacon actually needs attention.

### Relationship to GUPP

Patrol backoff and wake signals are the enforcement mechanism for GUPP. When a worker idles, backoff lets it sleep efficiently. When new work arrives (via `gt`/`bd` mutation or mail), the wake signal ensures the worker picks up its hook promptly. See `gupp.md` for the full nudge propagation hierarchy.

## Swarms

Polecats are spun up in swarms to attack work in parallel. The Witness manages polecat health. Swarms are ephemeral sessions taking on persistent work — whoever manages the Convoy keeps recycling polecats and pushing them on issues until done.
